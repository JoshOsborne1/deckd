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
import { handZoneId, tableZoneId } from '@engine/types';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import { selectBroadcastDelta } from '@store/syncLogic';

let unsubscribeGameStore: (() => void) | null = null;
let lastBroadcastSeq = 0;
let installed = false;

/**
 * The last seq the host has broadcast. Exposed for tests.
 */
export function getLastBroadcastSeq(): number {
  return lastBroadcastSeq;
}

/** Reset the broadcast cursor (test helper). */
export function resetBridge(): void {
  lastBroadcastSeq = 0;
  if (unsubscribeGameStore) {
    unsubscribeGameStore();
    unsubscribeGameStore = null;
  }
  installed = false;
}

/**
 * Host: broadcast the events that have landed since the last broadcast.
 * Called from the gameStore subscription. No-op if not connected or no session.
 */
function broadcastDelta(): void {
  const lobby = useLobbyStore.getState();
  if (lobby.status !== 'connected' || !lobby.session) return;
  if (lobby.session.role !== 'host') return;

  const game = useGameStore.getState();
  if (game.events.length === 0) return;

  const delta = selectBroadcastDelta(game.events, lastBroadcastSeq);
  if (delta.length === 0) return;

  lastBroadcastSeq = delta[delta.length - 1]!.seq;
  void lobby.session.sendEvents(delta);
}

/**
 * Host: send the full event chain to a rejoining/cold guest. This rebuilds
 * the guest from scratch rather than shipping a folded snapshot (keeps the
 * event log intact on the guest side).
 */
function sendFullSnapshot(): void {
  const lobby = useLobbyStore.getState();
  const game = useGameStore.getState();
  if (!lobby.session || lobby.session.role !== 'host') return;
  if (game.events.length === 0) return;

  lastBroadcastSeq = game.events[game.events.length - 1]!.seq;
  void lobby.session.sendEvents([...game.events]);
}

/**
 * Host: apply a guest's action intent to the local gameStore. The resulting
 * events then broadcast via the subscription. Validates that the acting
 * player is the current turn holder (host authority).
 */
function applyGuestAction(
  intent: string,
  payload: unknown,
  fromClientId?: string,
): void {
  const game = useGameStore.getState();
  const lobby = useLobbyStore.getState();
  if (!fromClientId) return;

  // Map the guest's relay clientId to a game playerId. In online mode the
  // host creates the session with players mapped by clientId, so the
  // guest's clientId IS their playerId.
  const playerId = fromClientId as PlayerId;

  // The guest must be a known player in the session.
  const isPlayer = game.state.players.some((p) => p.id === playerId);
  if (!isPlayer) return;

  const p = (payload ?? {}) as {
    cardId?: CardId;
    toZoneId?: ZoneId;
    face?: CardFace;
  };

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
      if (!ownsCard()) return;
      game.moveCard(p.cardId, p.toZoneId, p.face);
      break;
    }
    case 'flip_card': {
      // Flipping is only allowed on your own cards (privacy: never reveal
      // another player's hidden card).
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
    default:
      break;
  }
  // The gameStore mutation triggers the subscription, which broadcasts.
  void lobby; // satisfy linter: lobby read above for role guard.
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
      useGameStore.getState().ingestRemoteEvents(events);
    },
    // Host path: a guest sent an intent.
    onIntentReceived: (intent: string, payload: unknown, fromClientId?: string) => {
      if (intent === 'request_snapshot') {
        sendFullSnapshot();
      } else {
        applyGuestAction(intent, payload, fromClientId);
      }
    },
    onSnapshotRequested: () => {
      sendFullSnapshot();
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