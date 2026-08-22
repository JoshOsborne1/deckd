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

import { applyEvent, emptyState } from '@engine/state';
import type { GameEvent } from '@engine/events';
import type { CardFace, GameState, ZoneId } from '@engine/types';

/**
 * Per-recipient privacy filter for online games.
 *
 * The host's event log contains every card id, and card ids are
 * deterministic (`H-A`, `S-10`), so shipping the raw log to a guest lets
 * them read every hidden card. This filter rewrites the log for one viewer:
 *
 * - Cards the viewer may see (public zones, their own private zones, and
 *   any face-up card) keep their real ids.
 * - Every other card id is replaced with an opaque placeholder (`p-0`,
 *   `p-1`, …). The placeholder is stable across the whole log for that
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

const PLACEHOLDER_PREFIX = 'p-';

export function filterEventsForViewer(events: GameEvent[], viewerId: string): GameEvent[] {
  const placeholderByReal = new Map<string, string>();
  const visible = new Set<string>();
  const faces = new Map<string, CardFace>();
  let nextPlaceholder = 0;
  const out: GameEvent[] = [];

  // Precompute zone visibility from session/start (the only event that
  // defines zones). If there is no session/start, nothing is visible.
  const zoneVisibility = new Map<ZoneId, boolean>();
  const startEvent = events.find((e) => e.type === 'session/start');
  if (startEvent && startEvent.type === 'session/start') {
    for (const zone of startEvent.zones) {
      zoneVisibility.set(
        zone.id,
        zone.visibility.kind === 'public' ||
          (zone.visibility.kind === 'private' && zone.visibility.ownerId === viewerId),
      );
    }
  }

  const placeholderFor = (realId: string): string => {
    let p = placeholderByReal.get(realId);
    if (!p) {
      p = `${PLACEHOLDER_PREFIX}${nextPlaceholder++}`;
      placeholderByReal.set(realId, p);
    }
    return p;
  };

  const remap = (id: string): string => (visible.has(id) ? id : placeholderFor(id));

  const markVisible = (realId: string, seq: number): void => {
    if (visible.has(realId)) return;
    visible.add(realId);
    const p = placeholderByReal.get(realId);
    if (p) {
      out.push({
        type: 'card/identify',
        cardId: p,
        realId,
        id: `evt-id-${p}`,
        ts: Date.now(),
        actorId: 'system',
        seq,
      });
    }
  };

  for (const event of events) {
    switch (event.type) {
      case 'session/start': {
        // Rebuild zones with remapped card ids. Cards in zones the viewer
        // can see keep real ids; everything else becomes a placeholder.
        const zones = event.zones.map((zone) => {
          const zoneVisible = zoneVisibility.get(zone.id) ?? false;
          const cardIds = zone.cardIds.map((cid) => {
            faces.set(cid, 'down');
            if (zoneVisible) {
              visible.add(cid);
              return cid;
            }
            return placeholderFor(cid);
          });
          return { ...zone, cardIds };
        });
        out.push({
          ...event,
          meta: { ...event.meta, rngSeed: '' },
          zones,
        });
        break;
      }

      case 'card/deal':
      case 'card/move': {
        const cardId = event.cardId;
        const zoneVisible = zoneVisibility.get(event.toZoneId) ?? false;
        const face = event.face ?? faces.get(cardId) ?? 'down';
        faces.set(cardId, face);
        if (zoneVisible || face === 'up') {
          markVisible(cardId, event.seq);
        }
        out.push({
          ...event,
          cardId: remap(cardId),
          ...(event.type === 'card/move' && event.toIndex !== undefined ? { toIndex: event.toIndex } : {}),
        });
        break;
      }

      case 'card/flip': {
        const cardId = event.cardId;
        const current = faces.get(cardId) ?? 'down';
        const nextFace: CardFace = current === 'up' ? 'down' : 'up';
        faces.set(cardId, nextFace);
        if (nextFace === 'up') {
          markVisible(cardId, event.seq);
        }
        out.push({ ...event, cardId: remap(cardId) });
        break;
      }

      case 'card/reveal': {
        faces.set(event.cardId, 'up');
        markVisible(event.cardId, event.seq);
        out.push({ ...event, cardId: remap(event.cardId) });
        break;
      }

      case 'card/peek': {
        out.push({ ...event, cardId: remap(event.cardId) });
        break;
      }

      case 'hand/reorder': {
        out.push({ ...event, order: event.order.map(remap) });
        break;
      }

      case 'deck/shuffle': {
        out.push({ ...event, newOrder: event.newOrder.map(remap) });
        break;
      }

      case 'card/identify': {
        // Host never emits these; pass through defensively.
        out.push(event);
        break;
      }

      default:
        out.push(event);
        break;
    }
  }

  return out;
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