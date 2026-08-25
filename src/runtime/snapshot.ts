/**
 * Snapshot + tail verification (blueprint §7.2, Phase 2).
 *
 * A snapshot plus the event tail after the snapshot must reproduce the
 * authority state byte-for-byte. These helpers build and verify snapshots.
 */

import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';
import { applyEvent, emptyState } from '@engine/state';

export interface RuntimeSnapshot {
  schemaVersion: 1;
  sessionId: string;
  throughSeq: number;
  state: GameState;
}

export interface RestoredSnapshot {
  state: GameState;
  tail: GameEvent[];
  lastSeq: number;
}

/** Build a snapshot from an event log. */
export function buildSnapshot(events: GameEvent[]): GameState {
  return events.reduce(applyEvent, emptyState());
}

/** Verify that a snapshot + tail reproduces a reference state exactly. */
export function verifySnapshotWithTail(
  snapshot: GameState,
  tail: GameEvent[],
  reference: GameState,
): boolean {
  const folded = tail.reduce(applyEvent, snapshot);
  return JSON.stringify(folded) === JSON.stringify(reference);
}

/** Extract the tail of an event log after a given sequence number. */
export function tailAfter(events: GameEvent[], afterSeq: number): GameEvent[] {
  return events.filter((e) => e.seq > afterSeq).sort((a, b) => a.seq - b.seq);
}

/** Versioned snapshot envelope used by authority and reconnect transports. */
export function createRuntimeSnapshot(
  events: GameEvent[],
  throughSeq = events.reduce((maximum, event) => Math.max(maximum, event.seq), 0),
): RuntimeSnapshot {
  const included = events
    .filter((event) => event.seq <= throughSeq)
    .sort((left, right) => left.seq - right.seq);
  const state = buildSnapshot(included);
  return {
    schemaVersion: 1,
    sessionId: state.meta.id,
    throughSeq,
    state,
  };
}

/** Build an envelope when the authority already owns a folded state. */
export function snapshotFromState(state: GameState, throughSeq: number): RuntimeSnapshot {
  return {
    schemaVersion: 1,
    sessionId: state.meta.id,
    throughSeq,
    state,
  };
}

/**
 * Restore a versioned snapshot plus its canonical event tail. Tail sequence is
 * strict and contiguous so reconnect cannot silently skip an authority event.
 */
export function restoreRuntimeSnapshot(
  snapshot: RuntimeSnapshot,
  tail: GameEvent[] = [],
): RestoredSnapshot {
  if (snapshot.schemaVersion !== 1) throw new Error('Unsupported snapshot schema');
  const seenIds = new Set<string>();
  const fresh = tail
    .filter((event) => event.seq > snapshot.throughSeq)
    .filter((event) => {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    })
    .sort((left, right) => left.seq - right.seq);

  let expectedSeq = snapshot.throughSeq + 1;
  for (const event of fresh) {
    if (event.seq !== expectedSeq) {
      throw new Error(`Snapshot tail sequence gap: expected ${expectedSeq}, received ${event.seq}`);
    }
    expectedSeq += 1;
  }

  return {
    state: fresh.reduce(applyEvent, snapshot.state),
    tail: fresh,
    lastSeq: fresh.at(-1)?.seq ?? snapshot.throughSeq,
  };
}
