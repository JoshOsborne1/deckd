/**
 * Pure multiplayer sync logic.
 *
 * Framework-free helpers that dedup, fold, and diff game events so a guest
 * store can mirror a host store. All functions are pure (no React, no
 * zustand, no WebSocket) so they can be unit-tested in isolation.
 *
 * Host = source of truth. Guests send intents; the host applies them and
 * broadcasts resulting events; guests fold the broadcast events.
 */

import type { GameEvent } from '@engine/events';
import {
  projectDiagnosticsForViewer,
  projectEventsForViewer,
  projectSnapshotWithTail,
  projectStateForViewer,
} from '@engine/projection';
import { applyEvent, emptyState } from '@engine/state';
import type { GameState } from '@engine/types';

/**
 * Per-recipient privacy filter for online games.
 *
 * The host's event log contains every card id, and card ids are
 * deterministic (`H-A`, `S-10`), so shipping the raw log to a guest lets
 * them read every hidden card. This filter rewrites the log for one viewer:
 *
 * - Cards the viewer may see (public zones, their own private zones, and
 *   any face-up card) keep their real ids.
 * - Every other card id is replaced with a viewer-namespaced opaque
 *   placeholder (`p-<viewer>-0`, `p-<viewer>-1`, …). The placeholder is stable across the whole log for that
 *   viewer, so zone membership and movement stay consistent.
 * - The moment a card becomes visible to the viewer (dealt to them, dealt
 *   face-up to a public zone, revealed, flipped up), a `card/identify`
 *   event is emitted immediately before the triggering event, remapping
 *   the placeholder to the real id. The guest's reducer applies the
 *   remap, then the event, in order.
 * - The rngSeed is stripped from session/start: the guest must not be able
 *   to reconstruct the deck order.
 *
 * Pure and framework-free so it can be unit-tested.
 */

export function filterEventsForViewer(events: GameEvent[], viewerId: string): GameEvent[] {
  return projectEventsForViewer(events, viewerId);
}

/** Apply the event privacy boundary to a folded snapshot before serialising. */
export function filterSnapshotForViewer(snapshot: GameState, viewerId: string): GameState {
  return projectStateForViewer(snapshot, viewerId);
}

/** Project reconnect snapshot + tail through one shared opaque-id map. */
export function filterReconnectPayloadForViewer(
  snapshot: GameState,
  nextSeq: number,
  tail: GameEvent[],
  viewerId: string,
): { state: GameState; events: GameEvent[]; lastSeq: number } {
  return projectSnapshotWithTail(snapshot, nextSeq, tail, viewerId);
}

/** Produce an identity-free diagnostics payload safe for logs/crash reports. */
export function filterDiagnosticsForViewer(
  state: GameState,
  viewerId: string,
): ReturnType<typeof projectDiagnosticsForViewer> {
  return projectDiagnosticsForViewer(state, viewerId);
}

/**
 * Events from a remote batch that the local store has not already seen,
 * sorted by seq so fold order is deterministic. Identity dedup is by event
 * `id`, which the engine mints from `seq` plus randomness — unique per host.
 */
export function selectNewEvents(
  localEvents: GameEvent[],
  incoming: GameEvent[],
): GameEvent[] {
  const seen = new Set(localEvents.map((e) => e.id));
  return incoming
    .filter((e) => !seen.has(e.id))
    .sort((a, b) => a.seq - b.seq);
}

/**
 * Fold the union of local + fresh remote events into a new GameState.
 * Returns the resulting state plus the new event list and highest seq.
 *
 * This is the guest-side core: given a local event log and a remote event
 * batch, produce the mirrored state. Used by gameStore.ingestRemoteEvents.
 */
export function foldRemoteEvents(
  localEvents: GameEvent[],
  incoming: GameEvent[],
  baseline: GameState = emptyState(),
  baselineSeq = 0,
): { state: GameState; events: GameEvent[]; lastSeq: number; applied: number } {
  const seen = new Set(localEvents.map((e) => e.id));
  const fresh = incoming
    .filter((event) => event.seq > baselineSeq && !seen.has(event.id))
    .sort((a, b) => a.seq - b.seq);
  const events = [...localEvents, ...fresh].sort((a, b) => a.seq - b.seq);
  const state = events.reduce(applyEvent, baseline);
  const lastSeq = events.reduce((max, event) => Math.max(max, event.seq), baselineSeq);
  return { state, events, lastSeq, applied: fresh.length };
}

/**
 * Events with seq strictly greater than `afterSeq`. Used by the host to
 * broadcast only the delta since the last broadcast (or since a snapshot
 * baseline) rather than the full log on every change.
 */
export function selectBroadcastDelta(
  events: GameEvent[],
  afterSeq: number,
): GameEvent[] {
  return events
    .filter((e) => e.seq > afterSeq)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * Apply a snapshot (a folded GameState) plus an optional tail of events
 * with seq >= nextSeq, producing the resulting state. This is the rejoin
 * path: the host sends a folded snapshot and any events that landed after.
 */
export function applySnapshotWithTail(
  snapshot: GameState,
  nextSeq: number,
  tail: GameEvent[] = [],
): { state: GameState; lastSeq: number; appliedTail: GameEvent[] } {
  const appliedTail = tail
    .filter((e) => e.seq >= nextSeq)
    .sort((a, b) => a.seq - b.seq);
  const state = appliedTail.reduce(applyEvent, snapshot);
  const lastSeq = appliedTail.reduce((max, e) => Math.max(max, e.seq), nextSeq - 1);
  return { state, lastSeq, appliedTail };
}

/**
 * The full event chain needed to reconstruct a session from scratch.
 * Used by the host when answering a guest snapshot request: instead of
 * shipping a folded GameState (which loses the event log), we send the
 * original session-start + deal events so the guest rebuilds identically.
 */
export function fullSessionEvents(events: GameEvent[]): GameEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

/**
 * Whether a state is a real session (has a session/start event folded in).
 */
export function hasActiveSession(state: GameState): boolean {
  return state.phase !== 'idle' && state.meta.id !== '';
}

/**
 * Sentinel for "no session yet" so callers can distinguish a cold guest
 * store from a live one.
 */
export function isEmptyState(state: GameState): boolean {
  return state.meta.id === '' && state.phase === 'idle';
}

export { emptyState };

/**
 * Intent payload sent by a guest to the host requesting game actions.
 * The host applies the action locally and broadcasts the resulting events.
 */
export interface ActionIntent {
  intent: 'request_snapshot' | 'draw_card' | 'move_card' | 'flip_card' | 'end_turn';
  payload?: {
    cardId?: string;
    toZoneId?: string;
    face?: 'up' | 'down';
    playerId?: string;
  };
}

/**
 * Game-sync handler registry. The lobbyStore owns the RelaySession and its
 * transport callbacks; these handlers are registered by the multiplayer
 * bridge (which imports both gameStore and lobbyStore) so lobbyStore stays
 * free of gameStore imports. Keeping the registry here avoids a circular
 * import between lobbyStore and multiplayerBridge.
 */
export interface GameSyncHandlers {
  /** Host: a guest intent arrived. Guest: a remote event batch arrived. */
  onEventsReceived?: (events: GameEvent[]) => void;
  onIntentReceived?: (intent: string, payload: unknown, fromClientId?: string) => void;
  onSnapshotRequested?: (fromClientId?: string) => void;
}