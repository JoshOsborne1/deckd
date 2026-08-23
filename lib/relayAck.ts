/**
 * Relay ACK/gap helpers — pure encode/decode/detect logic for P1-5.
 *
 * Host → guest event batches travel as wrapped payloads:
 *   { kind: 'event_batch', batchId, firstSeq, lastSeq, events }
 * The guest replies:
 *   { kind: 'batch_ack', batchId, lastSeq }
 *
 * All of this rides inside the existing opaque relay payload channel, so the
 * dumb-pipe server needs no changes. Keeping the encode/decode/gap logic
 * here (framework-free) makes the wire contract unit-testable.
 */

import type { GameEvent } from '@engine/events';

export interface EventBatchEnvelope {
  kind: 'event_batch';
  batchId: string;
  firstSeq: number;
  lastSeq: number;
  events: GameEvent[];
}

export interface BatchAckEnvelope {
  kind: 'batch_ack';
  batchId: string;
  lastSeq: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGameEventArray(value: unknown): value is GameEvent[] {
  return Array.isArray(value)
    && value.length <= 2048
    && value.every((item) => isRecord(item)
      && typeof item.type === 'string'
      && typeof item.id === 'string'
      && typeof item.actorId === 'string'
      && typeof item.seq === 'number'
      && Number.isInteger(item.seq));
}

/** Seq bounds of an event array (assumes seqs present; never throws). */
export function seqBounds(events: GameEvent[]): { firstSeq: number; lastSeq: number } {
  let first = Number.MAX_SAFE_INTEGER;
  let last = 0;
  for (const event of events) {
    if (event.seq < first) first = event.seq;
    if (event.seq > last) last = event.seq;
  }
  if (events.length === 0) return { firstSeq: 0, lastSeq: 0 };
  return { firstSeq: first, lastSeq: last };
}

/** Build the wire envelope for a host-sent event batch. */
export function makeEventBatchEnvelope(batchId: string, events: GameEvent[]): EventBatchEnvelope {
  const { firstSeq, lastSeq } = seqBounds(events);
  return { kind: 'event_batch', batchId, firstSeq, lastSeq, events };
}

/** Serialise a batch envelope for the relay payload channel. */
export function encodeEventBatch(batchId: string, events: GameEvent[]): string {
  return JSON.stringify(makeEventBatchEnvelope(batchId, events));
}

/** Serialise an ACK for the relay payload channel. */
export function encodeBatchAck(batchId: string, lastSeq: number): string {
  return JSON.stringify({ kind: 'batch_ack', batchId, lastSeq });
}

/**
 * Parse a possibly-serialised event batch envelope. Accepts either the raw
 * envelope object or its JSON string (the relay payload channel is a string).
 */
export function parseEventBatchEnvelope(value: unknown): EventBatchEnvelope | null {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!isRecord(raw)) return null;
  if (raw.kind !== 'event_batch') return null;
  if (typeof raw.batchId !== 'string' || raw.batchId.length === 0 || raw.batchId.length > 128) return null;
  if (typeof raw.firstSeq !== 'number' || !Number.isInteger(raw.firstSeq) || raw.firstSeq < 0) return null;
  if (typeof raw.lastSeq !== 'number' || !Number.isInteger(raw.lastSeq) || raw.lastSeq < raw.firstSeq) return null;
  if (!isGameEventArray(raw.events)) return null;
  return { kind: 'event_batch', batchId: raw.batchId, firstSeq: raw.firstSeq, lastSeq: raw.lastSeq, events: raw.events };
}

/** Parse a received ACK payload (string or object). */
export function parseBatchAck(value: unknown): BatchAckEnvelope | null {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!isRecord(raw)) return null;
  if (raw.kind !== 'batch_ack') return null;
  if (typeof raw.batchId !== 'string' || raw.batchId.length === 0 || raw.batchId.length > 128) return null;
  if (typeof raw.lastSeq !== 'number' || !Number.isInteger(raw.lastSeq) || raw.lastSeq < 0) return null;
  return { kind: 'batch_ack', batchId: raw.batchId, lastSeq: raw.lastSeq };
}

/**
 * True when the guest's event chain has a hole: the incoming batch starts
 * AFTER the next expected seq. `localLastSeq` is the highest seq the guest
 * has applied; 0 means the guest has no session yet (no gap).
 */
export function hasSeqGap(localLastSeq: number, batchFirstSeq: number): boolean {
  return localLastSeq > 0 && batchFirstSeq > localLastSeq + 1;
}

/** Parse JSON defensively; returns null on malformed input. */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
