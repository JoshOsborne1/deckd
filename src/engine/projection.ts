/**
 * Authority-side viewer projection (blueprint §7.5).
 *
 * Canonical identities and the RNG seed stop here. Events, snapshots,
 * reconnect payloads and diagnostics all use the same per-viewer opaque map;
 * clients never receive canonical data and then hide it in presentation code.
 */

import type { GameEvent } from './events';
import type { SurfaceProfile } from './sessionTopology';
import { applyEvent, emptyState } from './state';
import { handZoneId, type GameState, type PlayerId, type ZoneId } from './types';

// Preserve the existing p-* wire family while namespacing it per viewer.
const OPAQUE_PREFIX = 'p';

export interface ViewerProjection {
  viewerId: PlayerId;
  /** Real id -> real id for identities this viewer may know. */
  revealed: Map<string, string>;
  /** Real id -> viewer-specific opaque id. */
  concealed: Map<string, string>;
}

export interface ProjectionRequest {
  surfaceProfile: SurfaceProfile;
  /** Required when this surface is entitled to one player's private state. */
  viewerId?: PlayerId | null;
  /** Stable physical-surface id used to isolate public opaque maps. */
  surfaceId?: string;
}

class ProjectionTracker {
  readonly viewerId: PlayerId;
  readonly namespace: string;
  readonly revealed = new Set<string>();
  readonly concealed = new Map<string, string>();
  private nextOpaque = 0;

  constructor(sessionId: string, viewerId: PlayerId) {
    this.viewerId = viewerId;
    this.namespace = projectionNamespace(sessionId, viewerId);
  }

  initialise(state: GameState): void {
    const visible = visibleCardsForPlayerInState(state, this.viewerId);
    for (const cardId of state.deckCardIds) {
      if (visible.has(cardId)) this.revealed.add(cardId);
      else this.opaqueFor(cardId);
    }
    for (const cardId of Object.keys(state.cards)) {
      if (visible.has(cardId)) this.revealed.add(cardId);
      else this.opaqueFor(cardId);
    }
  }

  opaqueFor(realId: string): string {
    const existing = this.concealed.get(realId);
    if (existing) return existing;
    const opaque = `${OPAQUE_PREFIX}-${this.namespace}-${this.nextOpaque++}`;
    this.concealed.set(realId, opaque);
    return opaque;
  }

  projectedId(realId: string): string {
    return this.revealed.has(realId) ? realId : this.opaqueFor(realId);
  }

  reveal(realId: string): string | null {
    if (this.revealed.has(realId)) return null;
    const opaque = this.opaqueFor(realId);
    this.revealed.add(realId);
    return opaque;
  }
}

/** Build the stable map used by one snapshot projection. */
export function buildViewerProjection(state: GameState, viewerId: PlayerId): ViewerProjection {
  const tracker = trackerForState(state, viewerId);
  return {
    viewerId,
    revealed: new Map(Array.from(tracker.revealed, (cardId) => [cardId, cardId])),
    concealed: new Map(tracker.concealed),
  };
}

/** Project a folded snapshot for one private viewer (or a synthetic public id). */
export function projectStateForViewer(state: GameState, viewerId: PlayerId): GameState {
  return projectStateWithTracker(state, trackerForState(state, viewerId));
}

export function projectStateForSurface(
  state: GameState,
  request: ProjectionRequest,
): GameState {
  return projectStateForViewer(state, projectionViewerId(request));
}

/**
 * Project a complete event stream. The projection is deterministic: generated
 * identify records derive all metadata from the authority event they precede.
 */
export function projectEventsForViewer(events: GameEvent[], viewerId: PlayerId): GameEvent[] {
  let canonical = emptyState();
  let tracker: ProjectionTracker | null = null;
  const projected: GameEvent[] = [];

  for (const event of [...events].sort((left, right) => left.seq - right.seq)) {
    if (event.type === 'session/start') {
      canonical = applyEvent(canonical, event);
      tracker = trackerForState(canonical, viewerId);
      projected.push(projectSessionStart(event, tracker));
      continue;
    }

    if (!tracker) {
      tracker = new ProjectionTracker(canonical.meta.id || 'session', viewerId);
      tracker.initialise(canonical);
    }
    projected.push(...projectIncrementalEvent(canonical, event, tracker));
    canonical = applyEvent(canonical, event);
  }

  return projected;
}

export function projectEventsForSurface(
  events: GameEvent[],
  request: ProjectionRequest,
): GameEvent[] {
  return projectEventsForViewer(events, projectionViewerId(request));
}

/** Project a reconnect snapshot and its tail through one shared opaque map. */
export function projectSnapshotWithTail(
  snapshot: GameState,
  nextSeq: number,
  tail: GameEvent[],
  viewerId: PlayerId,
): { state: GameState; events: GameEvent[]; lastSeq: number } {
  const tracker = trackerForState(snapshot, viewerId);
  const projectedSnapshot = projectStateWithTracker(snapshot, tracker);
  const events: GameEvent[] = [];
  let canonical = snapshot;

  for (const event of [...tail]
    .filter((candidate) => candidate.seq >= nextSeq)
    .sort((left, right) => left.seq - right.seq)) {
    events.push(...projectIncrementalEvent(canonical, event, tracker));
    canonical = applyEvent(canonical, event);
  }

  const state = events.reduce(applyEvent, projectedSnapshot);
  const lastSeq = events.reduce((maximum, event) => Math.max(maximum, event.seq), nextSeq - 1);
  return { state, events, lastSeq };
}

export function projectSnapshotWithTailForSurface(
  snapshot: GameState,
  nextSeq: number,
  tail: GameEvent[],
  request: ProjectionRequest,
): { state: GameState; events: GameEvent[]; lastSeq: number } {
  return projectSnapshotWithTail(snapshot, nextSeq, tail, projectionViewerId(request));
}

/** Which card identities are legal for this viewer at the current state. */
export function visibleCardsForPlayerInState(state: GameState, playerId: PlayerId): Set<string> {
  const visible = new Set<string>();
  for (const zone of Object.values(state.zones)) {
    const zoneVisible = zone.visibility.kind === 'public'
      || (zone.visibility.kind === 'private' && zone.visibility.ownerId === playerId);
    for (const cardId of zone.cardIds) {
      if (state.cards[cardId] && zoneVisible) visible.add(cardId);
    }
  }
  return visible;
}

/** Identity-free summary safe for diagnostics and crash reports. */
export function projectDiagnosticsForViewer(
  state: GameState,
  _viewerId: PlayerId,
): {
  zones: Record<ZoneId, number>;
  handCounts: Record<PlayerId, number>;
  turn: number;
  phase: string;
} {
  const zones: Record<ZoneId, number> = {};
  const handCounts: Record<PlayerId, number> = {};
  for (const [zoneId, zone] of Object.entries(state.zones)) zones[zoneId] = zone.cardIds.length;
  for (const player of state.players) {
    handCounts[player.id] = state.zones[handZoneId(player.id)]?.cardIds.length ?? 0;
  }
  return { zones, handCounts, turn: state.turn, phase: state.phase };
}

function trackerForState(state: GameState, viewerId: PlayerId): ProjectionTracker {
  const tracker = new ProjectionTracker(state.meta.id || 'session', viewerId);
  tracker.initialise(state);
  return tracker;
}

function projectStateWithTracker(state: GameState, tracker: ProjectionTracker): GameState {
  const zones: GameState['zones'] = {};
  const cards: GameState['cards'] = {};
  for (const [zoneId, zone] of Object.entries(state.zones)) {
    zones[zoneId] = {
      ...zone,
      cardIds: zone.cardIds.map((cardId) => tracker.projectedId(cardId)),
    };
  }
  for (const [cardId, card] of Object.entries(state.cards)) {
    const projectedId = tracker.projectedId(cardId);
    cards[projectedId] = { ...card, id: projectedId };
  }
  return {
    ...state,
    meta: { ...state.meta, rngSeed: '' },
    zones,
    cards,
    deckCardIds: state.deckCardIds.map((cardId) => tracker.projectedId(cardId)),
  };
}

function projectSessionStart(
  event: Extract<GameEvent, { type: 'session/start' }>,
  tracker: ProjectionTracker,
): GameEvent {
  return {
    ...event,
    meta: { ...event.meta, rngSeed: '' },
    zones: event.zones.map((zone) => ({
      ...zone,
      cardIds: zone.cardIds.map((cardId) => tracker.projectedId(cardId)),
    })),
  };
}

function projectIncrementalEvent(
  state: GameState,
  event: GameEvent,
  tracker: ProjectionTracker,
): GameEvent[] {
  const out: GameEvent[] = [];
  const revealedCardId = cardRevealedByEvent(state, event, tracker.viewerId);
  if (revealedCardId) {
    const opaque = tracker.reveal(revealedCardId);
    if (opaque) out.push(identifyEvent(event, opaque, revealedCardId));
  }
  out.push(remapEvent(event, tracker));
  return out;
}

function cardRevealedByEvent(
  state: GameState,
  event: GameEvent,
  viewerId: PlayerId,
): string | null {
  switch (event.type) {
    case 'card/deal':
    case 'card/move': {
      const destination = state.zones[event.toZoneId];
      const destinationVisible = destination?.visibility.kind === 'public'
        || (destination?.visibility.kind === 'private' && destination.visibility.ownerId === viewerId);
      return destinationVisible ? event.cardId : null;
    }
    case 'card/flip': {
      const card = state.cards[event.cardId];
      const zone = card ? state.zones[card.zoneId] : undefined;
      const zoneVisible = zone?.visibility.kind === 'public'
        || (zone?.visibility.kind === 'private' && zone.visibility.ownerId === viewerId);
      return card?.face === 'down' && zoneVisible ? event.cardId : null;
    }
    case 'card/reveal':
      return event.cardId;
    case 'card/peek':
      return event.byPlayerId === viewerId ? event.cardId : null;
    case 'card/identify':
      return event.realId;
    default:
      return null;
  }
}

function identifyEvent(source: GameEvent, opaque: string, realId: string): GameEvent {
  return {
    type: 'card/identify',
    cardId: opaque,
    realId,
    id: `${source.id}:identify:${opaque}`,
    ts: source.ts,
    actorId: 'system',
    seq: source.seq,
    transactionId: source.transactionId,
    schemaVersion: 1,
  };
}

function remapEvent(event: GameEvent, tracker: ProjectionTracker): GameEvent {
  switch (event.type) {
    case 'card/deal':
    case 'card/move':
    case 'card/flip':
    case 'card/peek':
    case 'card/reveal':
      return { ...event, cardId: tracker.projectedId(event.cardId) };
    case 'card/identify':
      return {
        ...event,
        cardId: tracker.projectedId(event.cardId),
        realId: event.realId,
      };
    case 'hand/reorder':
      return { ...event, order: event.order.map((cardId) => tracker.projectedId(cardId)) };
    case 'deck/shuffle':
      return { ...event, newOrder: event.newOrder.map((cardId) => tracker.projectedId(cardId)) };
    case 'session/start':
      return projectSessionStart(event, tracker);
    default:
      return event;
  }
}

function projectionNamespace(sessionId: string, viewerId: string): string {
  // FNV-1a is used only for a compact, per-viewer namespace. The opaque map's
  // counter carries no card identity and the authority never serialises the map.
  let hash = 0x811c9dc5;
  const input = `${sessionId}\u0000${viewerId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function projectionViewerId(request: ProjectionRequest): PlayerId {
  if (request.surfaceProfile === 'public-table') {
    return `@public:${request.surfaceId ?? 'table'}`;
  }
  if (!request.viewerId) {
    throw new Error(`${request.surfaceProfile} projection requires a viewerId`);
  }
  return request.viewerId;
}