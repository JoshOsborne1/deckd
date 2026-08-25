/**
 * Authoritative session runtime (blueprint §7.2).
 *
 * The runtime owns intent idempotency, transaction validation, event metadata,
 * sequencing and seat reclaim. The framework-free reducer remains the sole
 * canonical state transition function.
 */

import type { GameEvent } from '@engine/events';
import type { GameIntent } from '@engine/intents';
import { intentLegalityError, translateIntentToEvents } from '@engine/legalIntents';
import { cueForIntent, inferCue } from '@engine/presentationCues';
import { projectStateForSurface, type ProjectionRequest } from '@engine/projection';
import { applyEvent, canApplyEvent, emptyState } from '@engine/state';
import { handZoneId, type GameState, type PlayerId, type ZoneId } from '@engine/types';
import { IdempotencyRegistry } from './idempotency';
import {
  restoreRuntimeSnapshot,
  snapshotFromState,
  type RuntimeSnapshot,
} from './snapshot';

export interface SessionRuntimeConfig {
  sessionId: string;
  hostId: PlayerId;
  /** Last committed authority sequence when importing an already-folded state. */
  initialSeq?: number;
  /** Injectable wall clock keeps committed metadata deterministic in tests. */
  now?: () => number;
}

export interface CommitResult {
  ok: boolean;
  events: GameEvent[];
  state: GameState;
  error?: string;
}

export interface ReconnectResult {
  ok: boolean;
  state: GameState;
  seatClaimed: boolean;
  snapshot?: RuntimeSnapshot;
  tail?: GameEvent[];
  error?: string;
}

export type IntentTranslator = (intent: GameIntent, state: GameState) => GameEvent[];

export class SessionRuntime {
  private state: GameState;
  private events: GameEvent[] = [];
  private seq = 0;
  private readonly sessionId: string;
  private readonly hostId: PlayerId;
  private readonly now: () => number;
  // An idempotency id is session-scoped. Expiring it on wall-clock time would
  // allow a delayed relay retry to execute the same action a second time.
  private readonly intentResults = new IdempotencyRegistry<CommitResult>(Number.POSITIVE_INFINITY);
  private readonly seatTokens = new Map<PlayerId, string>();

  constructor(config: SessionRuntimeConfig, initial?: GameState) {
    this.sessionId = config.sessionId;
    this.hostId = config.hostId;
    this.now = config.now ?? Date.now;
    this.state = initial ?? emptyState();
    const initialSeq = config.initialSeq ?? 0;
    if (!Number.isSafeInteger(initialSeq) || initialSeq < 0) {
      throw new Error('initialSeq must be a non-negative safe integer');
    }
    this.seq = initialSeq;
  }

  getState(): GameState {
    return this.state;
  }

  getEvents(): GameEvent[] {
    return [...this.events];
  }

  getSeq(): number {
    return this.seq;
  }

  /**
   * Validate and atomically commit all events produced by one typed intent.
   * Validation folds against a staged state so later events may depend on
   * earlier events in the same transaction; no partial prefix is observable.
   */
  commit(
    intent: GameIntent,
    translate: IntentTranslator = (candidate, state) =>
      translateIntentToEvents(candidate, state) ?? [],
  ): CommitResult {
    if (this.intentResults.has(intent.id)) {
      return { ok: false, events: [], state: this.state, error: 'duplicate intent' };
    }

    const intentError = intentLegalityError(this.state, intent);
    if (intentError) return this.rememberRejection(intent.id, intentError);

    let drafts: GameEvent[];
    try {
      drafts = translate(intent, this.state);
    } catch {
      return this.rememberRejection(intent.id, 'intent translation failed');
    }
    if (drafts.length === 0) return this.rememberRejection(intent.id, 'no events produced');

    let stagedState = this.state;
    const committed: GameEvent[] = [];
    let stagedSeq = this.seq;

    for (const draft of drafts) {
      stagedSeq += 1;
      const full = decorateEvent(
        draft,
        stagedState,
        intent,
        stagedSeq,
        this.sessionId,
        this.now(),
      );
      if (!canApplyEvent(stagedState, full)) {
        return this.rememberRejection(intent.id, `illegal event ${full.type}`);
      }
      const nextState = applyEvent(stagedState, full);
      if (nextState === stagedState) {
        return this.rememberRejection(intent.id, `event ${full.type} did not reduce`);
      }
      stagedState = nextState;
      committed.push(full);
    }

    this.state = stagedState;
    this.seq = stagedSeq;
    this.events.push(...committed);
    const result: CommitResult = { ok: true, events: committed, state: this.state };
    this.intentResults.set(intent.id, result);
    return result;
  }

  reconnect(
    playerId: PlayerId,
    token: string,
    projection: ProjectionRequest = {
      surfaceProfile: 'personal-table',
      viewerId: playerId,
    },
  ): ReconnectResult {
    const publicState = projectStateForSurface(this.state, {
      surfaceProfile: 'public-table',
      viewerId: null,
      surfaceId: 'reconnect-denied',
    });
    if (!this.state.players.some((player) => player.id === playerId)) {
      return { ok: false, state: publicState, seatClaimed: false, error: 'unknown seat' };
    }
    const existing = this.seatTokens.get(playerId);
    if (!existing || existing !== token) {
      return { ok: false, state: publicState, seatClaimed: false, error: 'invalid reclaim token' };
    }
    const safeProjection: ProjectionRequest = projection.surfaceProfile === 'public-table'
      ? { ...projection, viewerId: null }
      : { ...projection, viewerId: playerId };
    const projectedState = projectStateForSurface(this.state, safeProjection);
    return {
      ok: true,
      state: projectedState,
      seatClaimed: true,
      snapshot: snapshotFromState(projectedState, this.seq),
      tail: [],
    };
  }

  bindSeat(playerId: PlayerId, token: string): void {
    if (!this.state.players.some((player) => player.id === playerId)) {
      throw new Error(`Cannot bind unknown seat ${playerId}`);
    }
    this.seatTokens.set(playerId, token);
  }

  snapshot(): GameState {
    return this.state;
  }

  snapshotEnvelope(): RuntimeSnapshot {
    return snapshotFromState(this.state, this.seq);
  }

  /** Restore an authority snapshot and fold a sorted, de-duplicated tail. */
  restore(snapshot: GameState | RuntimeSnapshot, tail: GameEvent[] = []): void {
    if ('schemaVersion' in snapshot) {
      const restored = restoreRuntimeSnapshot(snapshot, tail);
      this.state = restored.state;
      this.events = restored.tail;
      this.seq = restored.lastSeq;
      return;
    }
    const seen = new Set<string>();
    const orderedTail = [...tail]
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((left, right) => left.seq - right.seq);
    this.state = orderedTail.reduce(applyEvent, snapshot);
    this.events = orderedTail;
    this.seq = orderedTail.reduce((maximum, event) => Math.max(maximum, event.seq), 0);
  }

  private rememberRejection(intentId: string, error: string): CommitResult {
    const result: CommitResult = { ok: false, events: [], state: this.state, error };
    this.intentResults.set(intentId, result);
    return result;
  }
}

function decorateEvent(
  draft: GameEvent,
  state: GameState,
  intent: GameIntent,
  seq: number,
  sessionId: string,
  timestamp: number,
): GameEvent {
  const zone = movementZones(draft, state);
  return {
    ...draft,
    id: `${sessionId}:${seq}`,
    ts: timestamp,
    seq,
    transactionId: intent.id,
    fromZoneId: zone.fromZoneId,
    toZoneId: zone.toZoneId,
    cue: draft.cue ?? cueForIntent(intent, draft) ?? inferCue(draft) ?? undefined,
    schemaVersion: 1,
  } as GameEvent;
}

function movementZones(
  event: GameEvent,
  state: GameState,
): { fromZoneId?: ZoneId; toZoneId?: ZoneId } {
  if ('cardId' in event) {
    const currentZone = state.cards[event.cardId]?.zoneId;
    const destination = 'toZoneId' in event && event.toZoneId ? event.toZoneId : currentZone;
    return { fromZoneId: event.fromZoneId ?? currentZone, toZoneId: destination };
  }
  if (event.type === 'hand/reorder') {
    const zoneId = handZoneId(event.playerId);
    return { fromZoneId: zoneId, toZoneId: zoneId };
  }
  return { fromZoneId: event.fromZoneId, toZoneId: event.toZoneId };
}