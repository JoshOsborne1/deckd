/**
 * Snapshot + tail verification (blueprint §7.2, Phase 2).
 *
 * A snapshot plus the event tail after the snapshot must reproduce the
 * authority state byte-for-byte. These helpers build and verify snapshots.
 */

import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';
import { applyEvent, emptyState } from '@engine/state';

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
