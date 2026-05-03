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
  findPreset,
  foldEvents,
  makeSeed,
  mulberry32,
  shuffleInPlace,
} from '@engine/index';

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
}

export interface GameStoreState {
  events: GameEvent[];
  seq: number;
  state: GameState;

  createSession: (input: CreateSessionInput) => GameState;
  resetSession: () => void;

  dispatch: (event: EventPayload) => void;

  dealCard: (cardId: CardId, toZoneId: ZoneId, face?: CardFace) => void;
  moveCard: (cardId: CardId, toZoneId: ZoneId, face?: CardFace) => void;
  flipCard: (cardId: CardId) => void;
  revealCard: (cardId: CardId) => void;
  reorderHand: (playerId: PlayerId, order: CardId[]) => void;
  endTurn: (playerId: PlayerId) => void;

  enterPrivacy: (playerId: PlayerId) => void;
  exitPrivacy: () => void;

  pauseSession: () => void;
  resumeSession: () => void;
  endSession: (winnerId?: PlayerId) => void;
}

const HOST_ACTOR: GameEvent['actorId'] = 'system';

function makeEvent(payload: EventPayload, seq: number): GameEvent {
  return {
    ...(payload as unknown as GameEvent),
    id: eventId(seq),
    ts: Date.now(),
    seq,
  };
}

function orderedDeckForPreset(seed: string, includeJokers: boolean): CardId[] {
  const deck = buildDeck({ includeJokers });
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
        const hostId = input.hostId ?? players[0]?.id ?? 'host';

        const deckOrder = orderedDeckForPreset(seed, config.includeJokers);
        const setup = preset.setup({ players, config, deckOrder });

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
                hostId,
              },
              config,
              players,
              zones: setup.zones,
            },
            seq++,
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
            ),
          );
        }

        const nextState = foldEvents(events);
        set({ events, seq, state: nextState });
        return nextState;
      },

      resetSession: () => set({ events: [], seq: 0, state: emptyState() }),

      dispatch: (event) => {
        const { seq, events, state } = get();
        const nextSeq = seq + 1;
        const full = makeEvent(event, nextSeq);
        const nextState = applyEvent(state, full);
        set({ events: [...events, full], seq: nextSeq, state: nextState });
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

      endTurn: (playerId) =>
        get().dispatch({
          type: 'turn/end',
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
    }),
    {
      name: 'game:active',
      storage: createJSONStorage(() => createPlatformStorage()),
      version: 1,
      // TODO: consider adding a `snapshot` field to the persist config for
      // faster rehydration (avoids folding all events on every app launch).
      partialize: (s) => ({ events: s.events, seq: s.seq }),
      onRehydrateStorage: () => (rehydrated, error) => {
        if (error || !rehydrated) return;
        // Zustand expects in-place mutation of the rehydrated object here.
        rehydrated.state = foldEvents(rehydrated.events);
      },
    },
  ),
);

export function getDrawZoneId(): ZoneId {
  return ZONE_DRAW;
}
