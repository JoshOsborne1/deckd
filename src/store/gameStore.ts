import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createPlatformStorage } from '@lib/storage';
import {
  type CardId,
  type CardFace,
  type GameEvent,
  type GameState,
  type PlayerId,
  type SessionConfig,
  type ZoneId,
  ZONE_DRAW,
  applyEvent,
  buildDeck,
  emptyState,
  eventId,
  executeRecipe,
  findPreset,
  foldEvents,
  getGameRules,
  makeSeed,
  mulberry32,
  shuffleInPlace,
  blackjackDealerPlay,
  topologyFromLegacyMode,
} from '@engine/index';
import {
  applySnapshotWithTail,
  compactEventLog,
  foldRemoteEvents,
} from '@store/syncLogic';

type EventBaseKey = 'id' | 'ts' | 'seq';
type DistributiveOmit<T, K extends keyof GameEvent> = T extends GameEvent ? Omit<T, K> : never;
export type EventPayload = DistributiveOmit<GameEvent, EventBaseKey>;

export interface CreateSessionInput {
  mode: GameState['meta']['mode'];
  presetId: string | null;
  players: { id: PlayerId; name: string; avatarSeed: string }[];
  config?: Partial<SessionConfig>;
  hostId?: PlayerId;
  seed?: string;
  /**
   * Dual-end board (blueprint §8.3): two players share one phone from
   * opposite ends. Overrides the legacy-mode topology with the
   * `dual-end-board` surface profile while the mode stays `pass`.
   */
  dualEnd?: boolean;
}

export interface GameStoreState {
  events: GameEvent[];
  seq: number;
  state: GameState;
  /** Fold baseline for snapshot+tail recovery. Null means events start at idle. */
  eventBaseState: GameState | null;
  eventBaseSeq: number;

  createSession: (input: CreateSessionInput) => GameState;
  resetSession: () => void;

  dispatch: (event: EventPayload) => GameState;
  ingestRemoteEvents: (events: GameEvent[]) => { applied: number; lastSeq: number };
  applyRemoteSnapshot: (snapshot: GameState, nextSeq: number, tail?: GameEvent[]) => void;

  dealCard: (cardId: CardId, toZoneId: ZoneId, face?: CardFace) => void;
  moveCard: (cardId: CardId, toZoneId: ZoneId, face?: CardFace) => void;
  flipCard: (cardId: CardId) => void;
  revealCard: (cardId: CardId) => void;
  reorderHand: (playerId: PlayerId, order: CardId[]) => void;
  endTurn: (playerId: PlayerId) => void;

  /** Route a game-specific action (twist, stick, flop, fold...) through the rules engine. */
  gameAction: (action: import('@engine/rules').GameAction, playerId: PlayerId) => boolean;
  setStreet: (street: number) => void;
  foldPlayer: (playerId: PlayerId) => void;

  enterPrivacy: (playerId: PlayerId) => void;
  exitPrivacy: () => void;

  pauseSession: () => void;
  resumeSession: () => void;
  endSession: (winnerId?: PlayerId) => void;

  /**
   * Undo the last reversible action for freeplay-family pass-and-play games.
   * Replays the event log minus the last reversible event (card/deal,
   * card/move, card/flip, card/reveal, hand/reorder) that occurred in the
   * current player's turn. Returns true if an event was undone, false if
   * nothing is reversible.
   */
  undoLastAction: () => boolean;

  /** Solo blackjack: deal a fresh hand with the same players. */
  startNextHand: () => void;
  /** Offline pass-and-play: replay the ended table with the same seats. */
  replaySession: () => void;
}

const HOST_ACTOR: GameEvent['actorId'] = 'system';
const KNOWN_EVENT_TYPES = new Set([
  'session/start', 'deck/shuffle', 'card/deal', 'card/move', 'card/flip',
  'card/peek', 'card/ask', 'card/reveal', 'card/identify', 'hand/reorder',
  'turn/set', 'turn/end', 'privacy/enter', 'privacy/exit', 'game/street',
  'game/burn', 'game/bet', 'game/fold', 'session/pause', 'session/resume',
  'session/end',
]);

function isPersistedGameEvent(value: unknown): value is GameEvent {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { type?: unknown; id?: unknown; ts?: unknown; seq?: unknown; actorId?: unknown };
  return typeof record.type === 'string'
    && KNOWN_EVENT_TYPES.has(record.type)
    && typeof record.id === 'string'
    && typeof record.ts === 'number'
    && Number.isFinite(record.ts)
    && typeof record.seq === 'number'
    && Number.isInteger(record.seq)
    && typeof record.actorId === 'string';
}

function makeEvent(payload: EventPayload, seq: number, sessionId: string): GameEvent {
  return {
    ...(payload as unknown as GameEvent),
    id: eventId(seq, sessionId),
    ts: Date.now(),
    seq,
  };
}

function orderedDeckForPreset(seed: string, includeJokers: boolean, presetId?: string): CardId[] {
  const needsOldMaidJoker = presetId === 'old-maid';
  // FreeCell/Pyramid/Golf layouts are hardcoded to 52 cards; jokers would
  // silently drop 2 cards from the deal. Force them off at the deck level so no
  // session (UI, deep link, or API) can build an unsupported 54-card deck.
  const layoutFixed52 = presetId === 'freecell' || presetId === 'pyramid' || presetId === 'golf';
  const deck = buildDeck({ includeJokers: (includeJokers && !layoutFixed52) || needsOldMaidJoker })
    .filter((card) => !needsOldMaidJoker || card.id !== 'JK-BLACK');
  const rng = mulberry32(seed);
  const order = deck.map((card) => card.id);
  return shuffleInPlace(order, rng);
}

export const useGameStore = create<GameStoreState>()(
  persist(
    (set, get) => ({
      events: [],
      seq: 0,
      state: emptyState(),
      eventBaseState: null,
      eventBaseSeq: 0,

      createSession: (input) => {
        const preset = findPreset(input.presetId);
        const seed = input.seed ?? makeSeed();
        const config: SessionConfig = {
          includeJokers: input.config?.includeJokers ?? false,
          fanStyle: input.config?.fanStyle ?? 'wide',
          autoReshuffleDiscard: input.config?.autoReshuffleDiscard ?? true,
          presetId: preset.id,
        };

        const players = input.players.map((p, seat) => ({
          id: p.id,
          name: p.name,
          avatarSeed: p.avatarSeed,
          seat,
        }));
        // Blackjack: append a virtual house seat (last = dealer) so every real
        // player gets a turn and the house auto-plays last. Without this, the
        // last real player (e.g. the guest in a 2-player online game) would be
        // the dealer and never play.
        if (preset.id === 'blackjack') {
          players.push({
            id: 'house',
            name: 'House',
            avatarSeed: 'house',
            seat: players.length,
          });
        }
        const hostId = input.hostId ?? players[0]?.id ?? 'host';
        const legacyTopology = topologyFromLegacyMode(input.mode, hostId, players.map((player) => player.id));
        // Dual-end board (§8.3): same shared-device binding as hot-seat, but
        // the surface profile marks the one-phone-two-ends layout so the
        // table picks the facing split composition instead of the veil flow.
        // The virtual house seat is not a human end, so it does not count
        // toward the two-seat eligibility check.
        const humanSeatCount = players.filter((player) => player.id !== 'house').length;
        const topology = input.dualEnd && input.mode === 'pass' && humanSeatCount === 2
          ? { ...legacyTopology, surfaceProfile: 'dual-end-board' as const }
          : legacyTopology;

        const deckOrder = orderedDeckForPreset(seed, config.includeJokers, preset.id);
        const setup = executeRecipe(preset.recipe, { players, config, deckOrder });

        const events: GameEvent[] = [];
        let seq = 1;

        events.push(
          makeEvent(
            {
              type: 'session/start',
              actorId: HOST_ACTOR,
              meta: {
                id: `sess-${seed}`,
                createdAt: Date.now(),
                rngSeed: seed,
                mode: input.mode,
                surfaceProfile: topology.surfaceProfile,
                seatBinding: topology.seatBinding,
                hostId,
              },
              config,
              players,
              zones: setup.zones,
            },
            seq++,
            `sess-${seed}`,
          ),
        );

        for (const deal of setup.initialDeals) {
          events.push(
            makeEvent(
              {
                type: 'card/deal',
                actorId: HOST_ACTOR,
                cardId: deal.cardId,
                toZoneId: deal.toZoneId,
                face: deal.face,
              },
              seq++,
              `sess-${seed}`,
            ),
          );
        }

        const nextState = foldEvents(events);
        set({ events, seq: seq - 1, state: nextState, eventBaseState: null, eventBaseSeq: 0 });
        return nextState;
      },

      resetSession: () => set({ events: [], seq: 0, state: emptyState(), eventBaseState: null, eventBaseSeq: 0 }),

      startNextHand: () => {
        const { state } = get();
        if (state.meta.mode !== 'solo') return;
        const preset = findPreset(state.config.presetId);
        const seed = makeSeed();
        const players = state.players.map((p) => ({
          id: p.id,
          name: p.name,
          avatarSeed: p.avatarSeed,
          seat: p.seat,
        }));
        const topology = topologyFromLegacyMode('solo', state.meta.hostId, players.map((player) => player.id));
        const deckOrder = orderedDeckForPreset(seed, state.config.includeJokers, preset.id);
        const setup = executeRecipe(preset.recipe, {
          players,
          config: state.config,
          deckOrder,
        });

        const events: GameEvent[] = [];
        let seq = 1;
        events.push(
          makeEvent(
            {
              type: 'session/start',
              actorId: HOST_ACTOR,
              meta: {
                id: `sess-${seed}`,
                createdAt: Date.now(),
                rngSeed: seed,
                mode: 'solo',
                surfaceProfile: topology.surfaceProfile,
                seatBinding: topology.seatBinding,
                hostId: state.meta.hostId,
              },
              config: state.config,
              players,
              zones: setup.zones,
            },
            seq++,
            `sess-${seed}`,
          ),
        );
        for (const deal of setup.initialDeals) {
          events.push(
            makeEvent(
              {
                type: 'card/deal',
                actorId: HOST_ACTOR,
                cardId: deal.cardId,
                toZoneId: deal.toZoneId,
                face: deal.face,
              },
              seq++,
              `sess-${seed}`,
            ),
          );
        }
        const nextState = foldEvents(events);
        set({ events, seq: seq - 1, state: nextState, eventBaseState: null, eventBaseSeq: 0 });
        return nextState;
      },

      replaySession: () => {
        const { state } = get();
        if (state.meta.mode !== 'pass' || state.phase !== 'ended') return;
        get().createSession({
          mode: 'pass',
          presetId: state.config.presetId,
          players: state.players
            .filter((player) => player.id !== 'house')
            .map((player) => ({
              id: player.id,
              name: player.name,
              avatarSeed: player.avatarSeed,
            })),
          config: state.config,
          hostId: state.meta.hostId,
        });
      },

      dispatch: (event) => {
        const { seq, events, state, eventBaseState, eventBaseSeq } = get();
        const nextSeq = seq + 1;
        const full = makeEvent(event, nextSeq, state.meta.id || 'session');
        const nextState = applyEvent(state, full);
        const compacted = compactEventLog([...events, full], nextState, eventBaseState, eventBaseSeq);
        set({
          events: compacted.events,
          seq: nextSeq,
          state: nextState,
          eventBaseState: compacted.eventBaseState,
          eventBaseSeq: compacted.eventBaseSeq,
        });
        return nextState;
      },

      ingestRemoteEvents: (incoming) => {
        const current = get();
        const result = foldRemoteEvents(current.events, incoming, current.eventBaseState ?? undefined, current.eventBaseSeq);
        if (result.applied === 0) {
          return { applied: 0, lastSeq: current.seq };
        }
        set({ events: result.events, seq: result.lastSeq, state: result.state });
        return { applied: result.applied, lastSeq: result.lastSeq };
      },

      applyRemoteSnapshot: (snapshot, nextSeq, tail = []) => {
        const result = applySnapshotWithTail(snapshot, nextSeq, tail);
        set({
          events: result.appliedTail,
          seq: Math.max(nextSeq - 1, result.lastSeq),
          state: result.state,
          eventBaseState: snapshot,
          eventBaseSeq: nextSeq - 1,
        });
      },

      dealCard: (cardId, toZoneId, face = 'down') =>
        get().dispatch({
          type: 'card/deal',
          actorId: get().state.meta.hostId || HOST_ACTOR,
          cardId,
          toZoneId,
          face,
        }),

      moveCard: (cardId, toZoneId, face) =>
        get().dispatch({
          type: 'card/move',
          actorId: get().state.currentPlayerId || HOST_ACTOR,
          cardId,
          toZoneId,
          face,
        }),

      flipCard: (cardId) =>
        get().dispatch({
          type: 'card/flip',
          actorId: get().state.currentPlayerId || HOST_ACTOR,
          cardId,
        }),

      revealCard: (cardId) =>
        get().dispatch({
          type: 'card/reveal',
          actorId: get().state.currentPlayerId || HOST_ACTOR,
          cardId,
        }),

      reorderHand: (playerId, order) =>
        get().dispatch({
          type: 'hand/reorder',
          actorId: playerId,
          playerId,
          order,
        }),

      endTurn: (playerId) => {
        const { state } = get();
        const nextState = get().dispatch({
          type: 'turn/end',
          actorId: playerId,
          playerId,
        });
        // Blackjack: when the turn lands on the dealer, run the house hand.
        const rules = getGameRules(state.config.presetId);
        const dealer = state.players[state.players.length - 1];
        if (rules.id === 'blackjack' && nextState.currentPlayerId === dealer?.id) {
          const dealerEvents = blackjackDealerPlay(nextState);
          for (const ev of dealerEvents) {
            if (ev.type === 'card/reveal') {
              get().revealCard(ev.cardId!);
            } else if (ev.type === 'card/deal') {
              get().dealCard(ev.cardId!, ev.toZoneId!, ev.face ?? 'up');
            } else if (ev.type === 'session/end') {
              get().endSession(ev.winnerId);
            }
          }
        }
        return nextState;
      },

      gameAction: (action, playerId) => {
        const { state } = get();
        const rules = getGameRules(state.config.presetId);
        const events = rules.apply(action, state, playerId);
        if (!events || events.length === 0) return false;
        for (const ev of events) {
          switch (ev.type) {
            case 'card/deal':
              get().dealCard(ev.cardId!, ev.toZoneId!, ev.face ?? 'up');
              break;
            case 'card/move':
              get().moveCard(ev.cardId!, ev.toZoneId!, ev.face ?? 'down');
              break;
            case 'card/flip':
              get().flipCard(ev.cardId!);
              break;
            case 'card/reveal':
              get().revealCard(ev.cardId!);
              break;
            case 'card/ask':
              get().dispatch({
                type: 'card/ask',
                actorId: playerId,
                targetPlayerId: ev.targetPlayerId!,
                rank: ev.rank ?? 'any',
                found: ev.found ?? false,
                transferredCount: ev.transferredCount ?? 0,
              });
              break;
            case 'turn/set':
              get().dispatch({
                type: 'turn/set',
                actorId: playerId,
                playerId: ev.playerId!,
              });
              break;
            case 'turn/end':
              get().endTurn(ev.playerId!);
              break;
            case 'game/street':
              get().setStreet(ev.street ?? 0);
              break;
            case 'game/burn':
              get().dispatch({
                type: 'game/burn',
                actorId: playerId,
                street: ev.street ?? 0,
              });
              break;
            case 'game/bet':
              get().dispatch({
                type: 'game/bet',
                actorId: playerId,
                playerId: ev.playerId!,
                action: ev.action!,
                amount: ev.amount ?? 0,
                roundComplete: ev.roundComplete,
              });
              break;
            case 'game/fold':
              get().foldPlayer(ev.playerId!);
              break;
            case 'session/end':
              get().endSession(ev.winnerId);
              break;
            default:
              break;
          }
        }
        return true;
      },

      setStreet: (street) =>
        get().dispatch({
          type: 'game/street',
          actorId: get().state.meta.hostId || HOST_ACTOR,
          street,
        }),

      foldPlayer: (playerId) =>
        get().dispatch({
          type: 'game/fold',
          actorId: playerId,
          playerId,
        }),

      enterPrivacy: (playerId) =>
        get().dispatch({
          type: 'privacy/enter',
          actorId: playerId,
          playerId,
        }),

      exitPrivacy: () =>
        get().dispatch({
          type: 'privacy/exit',
          actorId: get().state.currentPlayerId || HOST_ACTOR,
        }),

      pauseSession: () =>
        get().dispatch({
          type: 'session/pause',
          actorId: get().state.meta.hostId || HOST_ACTOR,
        }),

      resumeSession: () =>
        get().dispatch({
          type: 'session/resume',
          actorId: get().state.meta.hostId || HOST_ACTOR,
        }),

      endSession: (winnerId) =>
        get().dispatch({
          type: 'session/end',
          actorId: get().state.meta.hostId || HOST_ACTOR,
          winnerId,
        }),

      undoLastAction: () => {
        const { events, state, eventBaseState } = get();
        // Only freeplay-family pass-and-play games.
        if (state.meta.mode !== 'pass') return false;
        if (!['freeplay', 'deal-two-each'].includes(state.config.presetId ?? '')) return false;
        if (state.phase !== 'playing') return false;

        // Find the last reversible event. We scan backwards from the end,
        // skipping non-reversible events (privacy, session lifecycle).
        // We stop at the last turn/end — undo never crosses a turn boundary.
        const reversible = new Set([
          'card/deal',
          'card/move',
          'card/flip',
          'card/reveal',
          'hand/reorder',
        ]);
        let removeIndex = -1;
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i]!;
          if (ev.type === 'turn/end') break; // never undo across a turn
          if (ev.type === 'session/start') break; // nothing to undo before setup
          if (reversible.has(ev.type)) {
            removeIndex = i;
            break;
          }
        }
        if (removeIndex < 0) return false;

        const nextEvents = events.slice(0, removeIndex).concat(events.slice(removeIndex + 1));
        const nextState = nextEvents.reduce(applyEvent, eventBaseState ?? emptyState());
        const nextSeq = nextEvents.length > 0 ? nextEvents[nextEvents.length - 1]!.seq : (eventBaseState ? get().eventBaseSeq : 0);
        set({ events: nextEvents, seq: nextSeq, state: nextState });
        return true;
      },
    }),
    {
      name: 'game:active',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 2,
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') {
          return { events: [], seq: 0, eventBaseState: null, eventBaseSeq: 0 };
        }
        const candidate = persisted as { events?: unknown; seq?: unknown; eventBaseState?: unknown; eventBaseSeq?: unknown };
        const events = Array.isArray(candidate.events) ? candidate.events.filter(isPersistedGameEvent) : [];
        const seq = typeof candidate.seq === 'number' && Number.isInteger(candidate.seq) ? candidate.seq : 0;
        const eventBaseSeq = typeof candidate.eventBaseSeq === 'number' && Number.isInteger(candidate.eventBaseSeq)
          ? candidate.eventBaseSeq
          : 0;
        const eventBaseState = candidate.eventBaseState && typeof candidate.eventBaseState === 'object'
          ? candidate.eventBaseState as GameState
          : null;
        return { events, seq: Math.max(seq, eventBaseSeq), eventBaseState, eventBaseSeq };
      },
      partialize: (s) => ({
        events: s.events,
        seq: s.seq,
        eventBaseState: s.eventBaseState,
        eventBaseSeq: s.eventBaseSeq,
      }),
      onRehydrateStorage: () => (rehydrated, error) => {
        if (error || !rehydrated) return;
        rehydrated.state = rehydrated.events.reduce(
          applyEvent,
          rehydrated.eventBaseState ?? emptyState(),
        );
      },
    },
  ),
);

export function getDrawZoneId(): ZoneId {
  return ZONE_DRAW;
}
