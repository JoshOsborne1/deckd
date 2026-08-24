/**
 * Presentation cues (blueprint §7.4).
 *
 * Optional cues attached to events that drive choreography without affecting
 * reduction. Events gain transaction/action id grouping, zone source/dest ids,
 * monotonic sequence and schema version.
 */

import type { ZoneId } from './types';
import type { GameEvent } from './events';

export type PresentationCue =
  | 'deal'
  | 'draw'
  | 'discard'
  | 'collect'
  | 'reveal'
  | 'muck'
  | 'move'
  | 'flip';

/** Semantic metadata that travels with an event but does not reduce state. */
export interface EventSemantics {
  /** Groups all events caused by one intent. */
  transactionId?: string;
  /** Source zone for card movement. */
  fromZoneId?: ZoneId;
  /** Destination zone for card movement. */
  toZoneId?: ZoneId;
  /** Optional choreography cue. */
  cue?: PresentationCue;
  /** Monotonic sequence number (already on BaseEvent, reiterated here). */
  seq: number;
  /** Schema version for forward compatibility. */
  schemaVersion: 1;
}

/**
 * Attach presentation semantics to an event. Returns a new event object;
 * the original is unchanged.
 */
export function withSemantics<T extends GameEvent>(
  event: T,
  semantics: Partial<Omit<EventSemantics, 'seq' | 'schemaVersion'>>,
): T & EventSemantics {
  return {
    ...event,
    transactionId: semantics.transactionId,
    fromZoneId: semantics.fromZoneId,
    toZoneId: semantics.toZoneId,
    cue: semantics.cue,
    seq: event.seq,
    schemaVersion: 1,
  };
}

/**
 * Extract semantics from an event if present. Returns undefined when the
 * event carries no choreography metadata.
 */
export function semanticsOf(event: GameEvent): EventSemantics | null {
  const candidate = event as GameEvent & Partial<EventSemantics>;
  if (candidate.schemaVersion !== 1) return null;
  return {
    transactionId: candidate.transactionId,
    fromZoneId: candidate.fromZoneId,
    toZoneId: candidate.toZoneId,
    cue: candidate.cue,
    seq: candidate.seq,
    schemaVersion: 1,
  };
}

/** Infer a cue from an event type when none is explicitly set. */
export function inferCue(event: GameEvent): PresentationCue | null {
  switch (event.type) {
    case 'card/deal':
      return 'deal';
    case 'card/move':
      return event.toZoneId === 'discard' ? 'discard' : 'move';
    case 'card/flip':
      return 'flip';
    case 'card/reveal':
      return 'reveal';
    case 'hand/reorder':
      return 'move';
    default:
      return null;
  }
}
