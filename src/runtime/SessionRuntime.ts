/**
 * In-process session runtime (blueprint §7.2, Phase 2).
 *
 * Validates intents, commits events, handles sequencing and reconnect seat
 * reclaim. The engine reducer remains the only legality authority; this
 * runtime enforces ordering, idempotency and persistence boundaries.
 */

import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';
import { applyEvent, canApplyEvent, emptyState } from '@engine/state';
import type { GameIntent } from '@engine/intents';

export interface SessionRuntimeConfig {
  sessionId: string;
  hostId: PlayerId;
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
  error?: string;
}

/**
 * In-process runtime for local sessions (hot-seat, solo, personal-device
 * hosting during migration). No network, no serialisation boundary — the
 * store may hold a direct reference.
 */
export class SessionRuntime {
  private state: GameState;
  private events: GameEvent[] = [];
  private seq: number = 0;
  private readonly sessionId: string;
  private readonly hostId: PlayerId;
  /** Idempotency registry: rejected duplicate intents. */
  private readonly seenIntents = new Set<string>();
  /** Seat reclaim tokens for reconnect. */
  private readonly seatTokens = new Map<PlayerId, string>();

  constructor(config: SessionRuntimeConfig, initial?: GameState) {
    this.sessionId = config.sessionId;
    this.hostId = config.hostId;
    this.state = initial ?? emptyState();
  }

  /** Current folded state. */
  getState(): GameState {
    return this.state;
  }

  /** Full event log. */
  getEvents(): GameEvent[] {
    return [...this.events];
  }

  /** Current high-water mark. */
  getSeq(): number {
    return this.seq;
  }

  /**
   * Validate and commit a typed intent. Returns the committed events and the
   * new state, or an error result. Duplicate intents are rejected idempotently.
   */
  commit(intent: GameIntent, translate: (intent: GameIntent) => GameEvent[]): CommitResult {
    if (this.seenIntents.has(intent.id)) {
      return { ok: false, events: [], state: this.state, error: 'duplicate intent' };
    }

    const events = translate(intent);
    if (events.length === 0) {
      return { ok: false, events: [], state: this.state, error: 'no events produced' };
    }

    // Validate every event before committing any.
    for (const event of events) {
      if (!canApplyEvent(this.state, event)) {
        return { ok: false, events: [], state: this.state, error: `illegal event ${event.type}` };
      }
    }

    const committed: GameEvent[] = [];
    for (const event of events) {
      this.seq += 1;
      const full: GameEvent = {
        ...event,
        id: `${this.sessionId}:${this.seq}`,
        ts: Date.now(),
        seq: this.seq,
      };
      this.state = applyEvent(this.state, full);
      this.events.push(full);
      committed.push(full);
    }

    this.seenIntents.add(intent.id);
    return { ok: true, events: committed, state: this.state };
  }

  /**
   * Reconnect a player by reclaiming their seat. Returns the projected state
   * the reclaiming client should fold from.
   */
  reconnect(playerId: PlayerId, token: string): ReconnectResult {
    const existing = this.seatTokens.get(playerId);
    if (existing && existing !== token) {
      return { ok: false, state: this.state, seatClaimed: false, error: 'seat already bound' };
    }
    this.seatTokens.set(playerId, token);
    return { ok: true, state: this.state, seatClaimed: true };
  }

  /** Bind a seat token (host-side setup). */
  bindSeat(playerId: PlayerId, token: string): void {
    this.seatTokens.set(playerId, token);
  }

  /** Snapshot the current state for persistence or transfer. */
  snapshot(): GameState {
    return this.state;
  }

  /** Restore from snapshot + tail. */
  restore(snapshot: GameState, tail: GameEvent[] = []): void {
    this.state = snapshot;
    this.events = [...tail];
    this.seq = tail.reduce((max, e) => Math.max(max, e.seq), 0);
  }
}
