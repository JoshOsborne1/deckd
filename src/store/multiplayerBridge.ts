/**
 * Multiplayer bridge — wires gameStore to the relay session in lobbyStore.
 *
 * Host = source of truth:
 *   - After any local gameStore change, broadcasts the new events (delta
 *     since the last broadcast) via session.sendEvents.
 *   - On a guest 'request_snapshot' intent, sends the full event chain so
 *     the guest can rebuild from scratch.
 *   - On a guest action intent (draw/move/flip/end_turn), applies the
 *     action to the local gameStore. The resulting events then broadcast
 *     via the subscription above.
 *
 * Guest:
 *   - On onEventsReceived, folds the events into the local gameStore via
 *     ingestRemoteEvents so the table mirrors the host.
 *   - On connect (status -> connected), sends 'request_snapshot' so the
 *     host replays the session-start + deal chain.
 *
 * Pass & play with no relay: the bridge is inert. If there is no lobby
 * session (status idle), all handlers are no-ops and the gameStore
 * subscription never fires a broadcast.
 */

import type { GameEvent } from '@engine/events';
import type { CardId, ZoneId, CardFace, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/rules';
import { handZoneId, tableZoneId, ZONE_DISCARD } from '@engine/types';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import { selectBroadcastDelta, filterEventsForViewer } from '@store/syncLogic';

let unsubscribeGameStore: (() => void) | null = null;
let lastBroadcastSeq = 0;
let trackedSessionId: string | null = null;
const broadcastCursors = new Map<string, { sessionId: string | null; seq: number }>();
let installed = false;

/**
 * The session id of the first `session/start` event in the log, if any.
 * Used to detect a new game in the same lobby: the event log restarts at
 * seq 1, so the broadcast cursor must reset or the new game's opening
 * events are silently suppressed.
 */
function sessionIdOf(events: GameEvent[]): string | null {
  for (const ev of events) {
    if (ev.type === 'session/start') {
      const meta = (ev as { meta?: { id?: string } }).meta;
      return meta?.id ?? null;
    }
  }
  return null;
}

/**
 * The host's session/start event is the canonical source of game metadata, so
 * its mode is `online-host` for every recipient. A guest still needs a local
 * role marker for privacy-sensitive view selection (and it must survive the
 * relay session being temporarily torn down), so rewrite only the local copy
 * of session/start before folding it into the guest store.
 */
function markGuestSession(events: GameEvent[]): GameEvent[] {
  if (useLobbyStore.getState().session?.role !== 'guest') return events;
  return events.map((event) => (
    event.type === 'session/start'
      ? { ...event, meta: { ...event.meta, mode: 'online-guest' as const } }
      : event
  ));
}

/**
 * The last seq the host has broadcast. Exposed for tests.
 */
export function getLastBroadcastSeq(): number {
  return lastBroadcastSeq;
}

/** Reset the broadcast cursor (test helper). */
export function resetBridge(): void {
  lastBroadcastSeq = 0;
  trackedSessionId = null;
  broadcastCursors.clear();
  if (unsubscribeGameStore) {
    unsubscribeGameStore();
    unsubscribeGameStore = null;
  }
  installed = false;
}

/**
 * Host: broadcast the events that have landed since the last broadcast.
 * Called from the gameStore subscription. No-op if not connected or no session.
 *
 * Each guest receives a recipient-filtered view: hidden cards are replaced
 * with stable placeholders so no guest can read another player's hand or the
 * deck order from the event log.
 */
function broadcastDelta(): void {
  const lobby = useLobbyStore.getState();
  if (lobby.status !== 'connected' || !lobby.session) return;
  if (lobby.session.role !== 'host') return;

  const game = useGameStore.getState();
  if (game.events.length === 0) return;

  // New game in the same lobby: the log restarted at seq 1, so reset the
  // cursor or the opening events of the new game are never broadcast.
  const sessionId = sessionIdOf(game.events);
  if (sessionId !== trackedSessionId) {
    trackedSessionId = sessionId;
    lastBroadcastSeq = 0;
    broadcastCursors.clear();
  }

  const guests = lobby.players.filter((p) => !p.isHost).map((p) => p.clientId);
  for (const guestId of guests) {
    const cursor = broadcastCursors.get(guestId);
    const before = cursor?.sessionId === sessionId ? cursor.seq : 0;
    const delta = selectBroadcastDelta(game.events, before);
    if (delta.length === 0) continue;
    const filtered = filterEventsForViewer(game.events, guestId).filter((e) => e.seq > before);
    if (filtered.length === 0) continue;
    const latest = delta[delta.length - 1]!.seq;
    lastBroadcastSeq = Math.max(lastBroadcastSeq, latest);
    const sendEventsTo = lobby.session.sendEventsTo;
    if (!sendEventsTo) continue;
    void Promise.resolve(sendEventsTo.call(lobby.session, guestId, filtered))
      .then(() => {
        const latest = delta[delta.length - 1]!.seq;
        broadcastCursors.set(guestId, { sessionId, seq: latest });
        lastBroadcastSeq = Math.max(lastBroadcastSeq, latest);
      })
      .catch(() => {
        // Leave the cursor unchanged. The next reconnect/snapshot will retry.
      });
  }
}

/**
 * Host: send the full event chain to a rejoining/cold guest. This rebuilds
 * the guest from scratch rather than shipping a folded snapshot (keeps the
 * event log intact on the guest side). The chain is recipient-filtered so
 * the guest only sees their own hand and public cards.
 */
function sendFullSnapshot(requestedGuestId?: string): void {
  const lobby = useLobbyStore.getState();
  const game = useGameStore.getState();
  if (!lobby.session || lobby.session.role !== 'host') return;
  if (game.events.length === 0) return;

  const sessionId = sessionIdOf(game.events);
  trackedSessionId = sessionId;
  const guests = requestedGuestId
    ? [requestedGuestId]
    : lobby.players.filter((p) => !p.isHost).map((p) => p.clientId);
  const sendEventsTo = lobby.session.sendEventsTo;
  if (!sendEventsTo) return;
  for (const guestId of guests) {
    const filtered = filterEventsForViewer(game.events, guestId);
    if (filtered.length === 0) continue;
    void Promise.resolve(sendEventsTo.call(lobby.session, guestId, filtered))
      .then(() => {
        const seq = game.events[game.events.length - 1]!.seq;
        broadcastCursors.set(guestId, { sessionId, seq });
        lastBroadcastSeq = Math.max(lastBroadcastSeq, seq);
      })
      .catch(() => undefined);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const STATIC_GAME_ACTIONS = new Set([
  'draw', 'recycle', 'flip', 'discard', 'reorder', 'pass', 'shuffle', 'end',
  'twist', 'stick', 'stand', 'burn', 'flop', 'turn', 'river', 'fold', 'check',
  'call', 'raise', 'reveal', 'pair', 'cycleStock', 'restart', 'autoFoundation',
]);

function isGameAction(value: unknown): value is GameAction {
  if (typeof value !== 'string' || value.length > 128) return false;
  return STATIC_GAME_ACTIONS.has(value)
    || /^(move|play|flip):[^:]{1,96}$/.test(value)
    || /^ask:[^:]{1,48}:[^:]{1,48}$/.test(value);
}

type GuestPayload = { cardId?: CardId; toZoneId?: ZoneId; face?: CardFace; action?: GameAction };

function parseGuestPayload(value: unknown): GuestPayload | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const result: GuestPayload = {};
  if (value.cardId !== undefined) {
    if (typeof value.cardId !== 'string' || value.cardId.length > 128) return null;
    result.cardId = value.cardId;
  }
  if (value.toZoneId !== undefined) {
    if (typeof value.toZoneId !== 'string' || value.toZoneId.length > 128) return null;
    result.toZoneId = value.toZoneId;
  }
  if (value.face !== undefined) {
    if (value.face !== 'up' && value.face !== 'down') return null;
    result.face = value.face;
  }
  if (value.action !== undefined) {
    if (!isGameAction(value.action)) return null;
    result.action = value.action;
  }
  return result;
}
function applyGuestAction(
  intent: string,
  payload: unknown,
  fromClientId?: string,
): void {
  const game = useGameStore.getState();
  if (!fromClientId || game.state.phase !== 'playing') return;
  const playerId = fromClientId;
  const p = parseGuestPayload(payload);
  if (!p || !game.state.players.some((player) => player.id === playerId)) return;

  // A guest may only touch cards in zones they own (hand:<id> or table:<id>).
  // This is the privacy gate: without it a guest could flip another player's
  // hidden card or move cards out of someone else's hand.
  const card = p.cardId ? game.state.cards[p.cardId] : undefined;
  const ownsCard = (): boolean => {
    if (!card) return false;
    const z = card.zoneId;
    return z === handZoneId(playerId) || z === tableZoneId(playerId);
  };

  switch (intent) {
    case 'draw_card': {
      // Guest draws the top card to their hand.
      if (game.state.currentPlayerId !== playerId) return;
      const drawZone = game.state.zones['draw'];
      if (!drawZone || drawZone.cardIds.length === 0) return;
      const topCardId = drawZone.cardIds[0];
      if (!topCardId) return;
      game.dealCard(topCardId, `hand:${playerId}` as ZoneId, 'up');
      break;
    }
    case 'move_card': {
      // Only the current turn holder may move, and only their own cards.
      if (game.state.currentPlayerId !== playerId) return;
      if (!p.cardId || !p.toZoneId) return;
      // The current UI intent is specifically "swipe up to discard". Do not
      // let an untrusted payload move a private card into an arbitrary zone.
      if (p.toZoneId !== ZONE_DISCARD) return;
      if (!ownsCard()) return;
      game.moveCard(p.cardId, ZONE_DISCARD, 'up');
      break;
    }
    case 'flip_card': {
      // Flipping is only allowed on your own cards (privacy: never reveal
      // another player's hidden card), during that player's turn.
      if (game.state.currentPlayerId !== playerId) return;
      if (!p.cardId) return;
      if (!ownsCard()) return;
      game.flipCard(p.cardId);
      break;
    }
    case 'end_turn': {
      if (game.state.currentPlayerId !== playerId) return;
      game.endTurn(playerId);
      break;
    }
    case 'game_action': {
      // Route game-specific actions (twist/stick/flop/fold...) through the
      // host's rules engine. The rules validate turn, phase, and ownership.
      if (game.state.currentPlayerId !== playerId) return;
      const action = p.action;
      if (!action) return;
      game.gameAction(action, playerId);
      break;
    }
    default:
      break;
  }
}

/**
 * Guest: on connecting, ask the host for a snapshot so we can mirror.
 */
function requestSnapshotOnConnect(): void {
  const lobby = useLobbyStore.getState();
  if (lobby.status !== 'connected' || !lobby.session) return;
  if (lobby.session.role !== 'guest') return;
  void lobby.session.sendIntent('request_snapshot', {});
}

/**
 * Install the bridge. Call once at app startup (after stores exist).
 * Idempotent — safe to call multiple times.
 *
 * Registers game-sync handlers with lobbyStore and subscribes to gameStore
 * for host-side broadcasting, and to lobbyStore for guest-side snapshot
 * requests on connect.
 */
export function installMultiplayerBridge(): void {
  if (installed) return;
  installed = true;

  // Register the handlers the lobbyStore transport callbacks delegate to.
  useLobbyStore.getState().registerGameSyncHandlers({
    // Guest path: host broadcast a batch of events.
    onEventsReceived: (events: GameEvent[]) => {
      useGameStore.getState().ingestRemoteEvents(markGuestSession(events));
    },
    // Host path: a guest sent an intent.
    onIntentReceived: (intent: string, payload: unknown, fromClientId?: string) => {
      if (intent === 'request_snapshot') {
        sendFullSnapshot(fromClientId);
      } else {
        applyGuestAction(intent, payload, fromClientId);
      }
    },
    onSnapshotRequested: (fromClientId?: string) => {
      sendFullSnapshot(fromClientId);
    },
  });

  // Host path: subscribe to gameStore changes and broadcast the delta.
  // Every local mutation (createSession, dispatch, dealCard, moveCard,
  // flipCard, endTurn, endSession) triggers a set(), which fires this.
  unsubscribeGameStore = useGameStore.subscribe(() => {
    broadcastDelta();
  });

  // Guest path: on connecting, request a snapshot from the host. We watch
  // the lobby status so the request fires when the relay connects, which
  // may happen after the bridge is installed.
  let prevStatus = useLobbyStore.getState().status;
  useLobbyStore.subscribe((state) => {
    if (state.status !== prevStatus) {
      const wasConnected = prevStatus === 'connected';
      prevStatus = state.status;
      if (state.status === 'connected' && !wasConnected) {
        requestSnapshotOnConnect();
      }
    }
  });
}

/**
 * Guest: call this when the relay connects to request a snapshot from the
 * host. Exposed so the UI / bridge installer can trigger it on connect.
 */
export function onGuestConnected(): void {
  requestSnapshotOnConnect();
}