/**
 * Viewer-specific projection (blueprint §7.5).
 *
 * Canonical card IDs remain inside the authority boundary. Every client
 * receives opaque per-viewer card IDs until a reveal makes the identity legal.
 * Public clients get no private identities; private-hand clients get their
 * own hand + public state only.
 *
 * This extends the EXISTING `filterEventsForViewer` in src/store/syncLogic.ts
 * to snapshots, reconnect payloads and diagnostics. Never render-then-hide.
 */

import type { GameState, PlayerId, ZoneId } from './types';
import type { GameEvent } from './events';
import { handZoneId } from './types';
import { applyEvent } from './state';

// Re-export the existing filter so engine consumers do not import from store.
import { filterEventsForViewer } from '@store/syncLogic';

const OPAQUE_PREFIX = 'opaque-';

/** Per-viewer projection context. */
export interface ViewerProjection {
  viewerId: PlayerId;
  /** Opaque id -> real id for cards the viewer may see. */
  revealed: Map<string, string>;
  /** Real id -> opaque id for cards the viewer may NOT see. */
  concealed: Map<string, string>;
}

/**
 * Build a viewer projection from a folded state. Pure and framework-free.
 */
export function buildViewerProjection(state: GameState, viewerId: PlayerId): ViewerProjection {
  const revealed = new Map<string, string>();
  const concealed = new Map<string, string>();
  let counter = 0;

  const visible = visibleCardsForPlayerInState(state, viewerId);
  for (const cardId of state.deckCardIds) {
    if (visible.has(cardId)) {
      revealed.set(cardId, cardId);
    } else {
      const opaque = `${OPAQUE_PREFIX}${counter++}`;
      concealed.set(cardId, opaque);
    }
  }
  return { viewerId, revealed, concealed };
}

/**
 * Project a folded GameState for a specific viewer. The result contains only
 * what the viewer may know: their own hand cards are real, public zone cards
 * are real, everything else is opaque.
 */
export function projectStateForViewer(state: GameState, viewerId: PlayerId): GameState {
  const projection = buildViewerProjection(state, viewerId);
  const next: GameState = {
    ...state,
    zones: { ...state.zones },
    cards: {},
    deckCardIds: state.deckCardIds.map((id) => projectCardId(id, projection)),
  };

  for (const [zoneId, zone] of Object.entries(state.zones)) {
    next.zones[zoneId] = {
      ...zone,
      cardIds: zone.cardIds.map((id) => projectCardId(id, projection)),
    };
  }

  for (const [cardId, card] of Object.entries(state.cards)) {
    const projectedId = projectCardId(cardId, projection);
    next.cards[projectedId] = {
      ...card,
      id: projectedId,
      zoneId: card.zoneId,
    };
  }

  return next;
}

/**
 * Project an event stream for a specific viewer. Uses the same visibility
 * rules as `projectStateForViewer` but walks the log so reveal timing is
 * correct (identify events are inserted at the exact reveal point).
 */
export function projectEventsForViewer(events: GameEvent[], viewerId: PlayerId): GameEvent[] {
  // Delegate to the existing battle-tested implementation in syncLogic.
  // This wrapper keeps the engine-side API coherent while the store logic
  // remains the single source of truth for the privacy filter.
  return filterEventsForViewer(events, viewerId);
}

/**
 * Project a snapshot + tail for a reconnecting viewer. The snapshot is
 * folded, projected, then the tail is projected and appended.
 */
export function projectSnapshotWithTail(
  snapshot: GameState,
  nextSeq: number,
  tail: GameEvent[],
  viewerId: PlayerId,
): { state: GameState; events: GameEvent[]; lastSeq: number } {
  const projectedState = projectStateForViewer(snapshot, viewerId);
  const projectedTail = projectEventsForViewer(tail, viewerId);
  const appliedTail = projectedTail.filter((e) => e.seq >= nextSeq).sort((a, b) => a.seq - b.seq);
  const state = appliedTail.reduce(applyEvent, projectedState);
  const lastSeq = appliedTail.reduce((max, e) => Math.max(max, e.seq), nextSeq - 1);
  return { state, events: appliedTail, lastSeq };
}

function projectCardId(cardId: string, projection: ViewerProjection): string {
  if (projection.revealed.has(cardId)) return cardId;
  return projection.concealed.get(cardId) ?? `${OPAQUE_PREFIX}unknown`;
}

/** Which cards are visible to a player per zone privacy + face rules. */
export function visibleCardsForPlayerInState(state: GameState, playerId: PlayerId): Set<string> {
  const visible = new Set<string>();
  for (const zone of Object.values(state.zones)) {
    const zoneVisible =
      zone.visibility.kind === 'public' ||
      (zone.visibility.kind === 'private' && zone.visibility.ownerId === playerId);
    for (const cardId of zone.cardIds) {
      const card = state.cards[cardId];
      if (!card) continue;
      if (zoneVisible || card.face === 'up') {
        visible.add(cardId);
      }
    }
  }
  return visible;
}

/**
 * Diagnostics-safe projection: strips all real card identities and returns
 * a summary suitable for crash reports and logs.
 */
export function projectDiagnosticsForViewer(state: GameState, viewerId: PlayerId): {
  zones: Record<ZoneId, number>;
  handCounts: Record<PlayerId, number>;
  turn: number;
  phase: string;
} {
  const zones: Record<ZoneId, number> = {};
  const handCounts: Record<PlayerId, number> = {};
  for (const [zoneId, zone] of Object.entries(state.zones)) {
    zones[zoneId] = zone.cardIds.length;
  }
  for (const player of state.players) {
    handCounts[player.id] = state.zones[handZoneId(player.id)]?.cardIds.length ?? 0;
  }
  return {
    zones,
    handCounts,
    turn: state.turn,
    phase: state.phase,
  };
}
