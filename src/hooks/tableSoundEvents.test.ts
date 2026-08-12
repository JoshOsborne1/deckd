import type { GameEvent } from '@engine/events';
import {
  EMPTY_CURSOR,
  nextSoundBatch,
  pickSound,
  soundForEvent,
  type SoundCursor,
} from './tableSoundEvents';

function ev(seq: number, type: GameEvent['type'], extra: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `evt-${seq}`,
    ts: seq,
    actorId: 'system',
    seq,
    type,
    ...extra,
  } as GameEvent;
}

const sessionStart = (id: string): GameEvent =>
  ev(1, 'session/start', {
    meta: { id, createdAt: 1, rngSeed: 's', mode: 'pass', hostId: 'p1' },
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'freeplay' },
    players: [{ id: 'p1', name: 'You', seat: 0, avatarSeed: 'a' }],
    zones: [],
  });

describe('soundForEvent', () => {
  it('maps the five table sounds to their events', () => {
    expect(soundForEvent(ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'hand:p1', face: 'up' }))).toBe('deal');
    expect(soundForEvent(ev(2, 'card/flip', { cardId: 'H-A' }))).toBe('flip');
    expect(soundForEvent(ev(2, 'card/reveal', { cardId: 'H-A' }))).toBe('flip');
    expect(soundForEvent(ev(2, 'card/move', { cardId: 'H-A', toZoneId: 'discard' }))).toBe('discard');
    expect(soundForEvent(ev(2, 'turn/end', { playerId: 'p1' }))).toBe('pass');
    expect(soundForEvent(ev(2, 'session/end', { winnerId: 'p1' }))).toBe('win');
  });

  it('stays silent for bookkeeping and betting events', () => {
    for (const type of [
      'deck/shuffle',
      'hand/reorder',
      'turn/set',
      'privacy/enter',
      'privacy/exit',
      'game/street',
      'game/burn',
      'game/bet',
      'game/fold',
      'session/pause',
      'session/resume',
    ] as GameEvent['type'][]) {
      expect(soundForEvent(ev(2, type))).toBeNull();
    }
  });
});

describe('pickSound', () => {
  it('returns null for an empty batch', () => {
    expect(pickSound([])).toBeNull();
  });

  it('picks the highest-priority sound in a batch', () => {
    expect(pickSound([ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })])).toBe('deal');
    expect(
      pickSound([
        ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' }),
        ev(3, 'card/deal', { cardId: 'H-2', toZoneId: 'h', face: 'up' }),
      ]),
    ).toBe('deal');
    // A 52-card deal must not fire 52 swishes — one sound per batch.
    expect(
      pickSound([
        ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' }),
        ev(3, 'turn/end', { playerId: 'p1' }),
      ]),
    ).toBe('pass');
    expect(
      pickSound([
        ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' }),
        ev(3, 'session/end', { winnerId: 'p1' }),
      ]),
    ).toBe('win');
  });
});

describe('nextSoundBatch', () => {
  it('plays the deal of a brand-new session from an empty cursor', () => {
    const events = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const { sound, next } = nextSoundBatch(events, EMPTY_CURSOR);
    expect(sound).toBe('deal');
    expect(next.lastEventId).toBe('evt-2');
    expect(next.lastSessionId).toBe('sess-1');
  });

  it('plays only the newly appended events on the next tick', () => {
    const events = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const first = nextSoundBatch(events, EMPTY_CURSOR);
    const more = [...events, ev(3, 'card/flip', { cardId: 'H-A' })];
    const second = nextSoundBatch(more, first.next);
    expect(second.sound).toBe('flip');
    expect(second.next.lastEventId).toBe('evt-3');
  });

  it('plays nothing when the log is unchanged', () => {
    const events = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const first = nextSoundBatch(events, EMPTY_CURSOR);
    const second = nextSoundBatch(events, first.next);
    expect(second.sound).toBeNull();
  });

  it('does not replay sounds after an undo/rewind', () => {
    const events = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const first = nextSoundBatch(events, EMPTY_CURSOR);
    const rewound = [sessionStart('sess-1')];
    const after = nextSoundBatch(rewound, first.next);
    expect(after.sound).toBeNull();
    expect(after.next.lastEventId).toBe('evt-1');
  });

  it('plays the new deal when a fresh session replaces the old one', () => {
    const oldEvents = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const first = nextSoundBatch(oldEvents, EMPTY_CURSOR);
    const newSession = [sessionStart('sess-2'), ev(2, 'card/deal', { cardId: 'S-A', toZoneId: 'h', face: 'up' })];
    const after = nextSoundBatch(newSession, first.next);
    expect(after.sound).toBe('deal');
    expect(after.next.lastSessionId).toBe('sess-2');
  });

  it('treats a missing cursor as a fresh start', () => {
    const events = [sessionStart('sess-1'), ev(2, 'card/deal', { cardId: 'H-A', toZoneId: 'h', face: 'up' })];
    const { sound } = nextSoundBatch(events, { lastEventId: null, lastSessionId: null } as SoundCursor);
    expect(sound).toBe('deal');
  });
});
