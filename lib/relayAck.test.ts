/**
 * Relay ACK/gap helper tests (P1-5).
 */

import {
  encodeBatchAck,
  encodeEventBatch,
  hasSeqGap,
  parseBatchAck,
  parseEventBatchEnvelope,
  seqBounds,
} from './relayAck';
import type { GameEvent } from '@engine/events';

function ev(seq: number): GameEvent {
  return {
    type: 'card/deal',
    id: `ev-${seq}`,
    actorId: 'p1',
    seq,
    ts: 1,
    cardId: 'H-A',
    toZoneId: 'hand:p1',
    face: 'up',
  };
}

describe('seqBounds', () => {
  test('returns bounds of a batch', () => {
    expect(seqBounds([ev(3), ev(1), ev(2)])).toEqual({ firstSeq: 1, lastSeq: 3 });
  });
  test('empty batch returns zero bounds', () => {
    expect(seqBounds([])).toEqual({ firstSeq: 0, lastSeq: 0 });
  });
});

describe('encode/parse event batch', () => {
  test('round-trips an envelope through the string payload channel', () => {
    const events = [ev(1), ev(2), ev(3)];
    const wire = encodeEventBatch('b-1', events);
    const parsed = parseEventBatchEnvelope(wire);
    expect(parsed).toEqual({ kind: 'event_batch', batchId: 'b-1', firstSeq: 1, lastSeq: 3, events });
  });
  test('accepts an already-object envelope', () => {
    const parsed = parseEventBatchEnvelope({ kind: 'event_batch', batchId: 'b-2', firstSeq: 4, lastSeq: 5, events: [ev(4), ev(5)] });
    expect(parsed?.batchId).toBe('b-2');
    expect(parsed?.lastSeq).toBe(5);
  });
  test('rejects malformed envelopes', () => {
    expect(parseEventBatchEnvelope('not json')).toBeNull();
    expect(parseEventBatchEnvelope({ kind: 'event_batch', batchId: '', firstSeq: 1, lastSeq: 2, events: [ev(1)] })).toBeNull();
    expect(parseEventBatchEnvelope({ kind: 'event_batch', batchId: 'b', firstSeq: 5, lastSeq: 2, events: [] })).toBeNull();
    expect(parseEventBatchEnvelope({ kind: 'event_batch', batchId: 'b', firstSeq: 1, lastSeq: 1, events: [{ type: 'x' }] })).toBeNull();
    expect(parseEventBatchEnvelope({ kind: 'other' })).toBeNull();
  });
});

describe('parseBatchAck', () => {
  test('round-trips an ACK', () => {
    const parsed = parseBatchAck(encodeBatchAck('batch-9', 42));
    expect(parsed).toEqual({ kind: 'batch_ack', batchId: 'batch-9', lastSeq: 42 });
  });
  test('rejects malformed ACKs', () => {
    expect(parseBatchAck('nope')).toBeNull();
    expect(parseBatchAck({ kind: 'batch_ack', batchId: 'b', lastSeq: -1 })).toBeNull();
    expect(parseBatchAck({ kind: 'batch_ack', batchId: 7, lastSeq: 1 })).toBeNull();
  });
});

describe('hasSeqGap', () => {
  test('no gap when the batch continues the chain', () => {
    expect(hasSeqGap(5, 6)).toBe(false);
    expect(hasSeqGap(5, 5)).toBe(false);
  });
  test('gap when the batch skips seqs', () => {
    expect(hasSeqGap(5, 7)).toBe(true);
  });
  test('no gap when the guest has no session yet', () => {
    expect(hasSeqGap(0, 1)).toBe(false);
    expect(hasSeqGap(0, 99)).toBe(false);
  });
  test('no gap when the batch overlaps (duplicate re-send)', () => {
    expect(hasSeqGap(5, 4)).toBe(false);
  });
});
