import { generateFixtures } from '@engine/__fixtures__/rebuild-baseline/generate';
import type { GameEvent } from '@engine/events';
import { legalIntents } from '@engine/legalIntents';
import {
  projectEventsForViewer,
  projectSnapshotWithTail,
  projectStateForSurface,
  projectStateForViewer,
} from '@engine/projection';
import { applyEvent, emptyState, foldEvents } from '@engine/state';
import {
  handZoneId,
  type GameState,
  type Zone,
  ZONE_DISCARD,
  ZONE_DRAW,
} from '@engine/types';
import type { GameIntent } from '@engine/intents';
import { formatGameEventLine } from '../../lib/eventLogFormat';
import { SessionRuntime } from './SessionRuntime';
import {
  buildSnapshot,
  createRuntimeSnapshot,
  restoreRuntimeSnapshot,
  tailAfter,
  verifySnapshotWithTail,
} from './snapshot';

function startEvent(): GameEvent {
  const zones: Zone[] = [
    {
      id: ZONE_DRAW,
      label: 'Draw',
      visibility: { kind: 'hidden' },
      cardIds: ['H-4', 'S-5'],
    },
    {
      id: ZONE_DISCARD,
      label: 'Discard',
      visibility: { kind: 'public' },
      cardIds: [],
    },
    {
      id: 'pile:public',
      label: 'Public pile',
      visibility: { kind: 'public' },
      cardIds: ['D-6'],
    },
    {
      id: handZoneId('p1'),
      label: 'P1 hand',
      visibility: { kind: 'private', ownerId: 'p1' },
      ownerId: 'p1',
      cardIds: ['C-7'],
    },
    {
      id: handZoneId('p2'),
      label: 'P2 hand',
      visibility: { kind: 'private', ownerId: 'p2' },
      ownerId: 'p2',
      cardIds: ['S-8'],
    },
  ];

  return {
    id: 'session:1',
    ts: 10,
    actorId: 'system',
    seq: 1,
    type: 'session/start',
    meta: {
      id: 'session',
      createdAt: 10,
      rngSeed: 'secret-seed',
      mode: 'pass',
      hostId: 'p1',
    },
    config: {
      includeJokers: false,
      fanStyle: 'wide',
      autoReshuffleDiscard: true,
      presetId: 'freeplay',
    },
    players: [
      { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
      { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
    ],
    zones,
  };
}

function makeState(): GameState {
  return foldEvents([startEvent()]);
}

type EventPayload = GameEvent extends infer Candidate
  ? Candidate extends GameEvent
    ? Omit<Candidate, 'id' | 'ts' | 'seq'>
    : never
  : never;

function event(
  seq: number,
  payload: EventPayload,
): GameEvent {
  return {
    ...(payload as GameEvent),
    id: `session:${seq}`,
    ts: 10 + seq,
    seq,
  };
}

describe('canonical session topology migration', () => {
  test('folding a legacy session/start normalises surface profile and seat binding', () => {
    const state = makeState();

    expect(state.meta.surfaceProfile).toBe('hot-seat');
    expect(state.meta.seatBinding).toEqual({
      kind: 'shared-device',
      playerIds: ['p1', 'p2'],
    });
  });
});

describe('viewer projections', () => {
  test('snapshot projection strips the seed and every identity the viewer cannot know', () => {
    const state = makeState();
    const projected = projectStateForViewer(state, 'p1');
    const opponentId = state.zones[handZoneId('p2')]!.cardIds[0]!;
    const drawIds = state.zones[ZONE_DRAW]!.cardIds;
    const wire = JSON.stringify(projected);

    expect(projected.meta.rngSeed).toBe('');
    expect(wire).not.toContain(opponentId);
    for (const cardId of drawIds) expect(wire).not.toContain(cardId);
    expect(projected.zones[handZoneId('p1')]!.cardIds).toEqual(['C-7']);
  });

  test('a face-up card in another private hand remains concealed', () => {
    const state = applyEvent(makeState(), event(2, {
      actorId: 'p2',
      type: 'card/flip',
      cardId: 'S-8',
    }));
    const projected = projectStateForViewer(state, 'p1');

    expect(state.cards['S-8']?.face).toBe('up');
    expect(JSON.stringify(projected)).not.toContain('S-8');
  });

  test('opaque card ids are namespaced per viewer', () => {
    const state = makeState();
    const forP1 = projectStateForViewer(state, 'p1');
    const forP2 = projectStateForViewer(state, 'p2');

    expect(forP1.zones[ZONE_DRAW]!.cardIds).not.toEqual(forP2.zones[ZONE_DRAW]!.cardIds);
  });

  test('a public-table surface receives no private-hand identities', () => {
    const projected = projectStateForSurface(makeState(), {
      surfaceProfile: 'public-table',
      surfaceId: 'main-table',
    });
    const wire = JSON.stringify(projected);

    expect(wire).not.toContain('C-7');
    expect(wire).not.toContain('S-8');
    expect(projected.zones[ZONE_DISCARD]!.cardIds).toEqual([]);
  });

  test('event projection is deterministic, including synthetic identify metadata', () => {
    const start = startEvent();
    const revealByMove = event(2, {
      actorId: 'p2',
      type: 'card/move',
      cardId: 'S-8',
      toZoneId: ZONE_DISCARD,
      face: 'up',
    });
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(111).mockReturnValueOnce(222);

    const first = projectEventsForViewer([start, revealByMove], 'p1');
    const second = projectEventsForViewer([start, revealByMove], 'p1');
    now.mockRestore();

    expect(second).toEqual(first);
    const identify = first.find((candidate) => candidate.type === 'card/identify');
    expect(identify).toMatchObject({
      transactionId: revealByMove.transactionId,
      schemaVersion: 1,
      seq: 2,
    });
  });

  test('a face-up move into another private hand does not reveal its identity', () => {
    const faceUpPrivateMove = event(2, {
      actorId: 'p2',
      type: 'card/move',
      cardId: 'S-8',
      toZoneId: handZoneId('p2'),
      face: 'up',
    });

    const projected = projectEventsForViewer([startEvent(), faceUpPrivateMove], 'p1');

    expect(JSON.stringify(projected)).not.toContain('S-8');
    expect(projected.some((candidate) => candidate.type === 'card/identify')).toBe(false);
  });

  test('snapshot and tail share one opaque-id map through a reveal', () => {
    const snapshot = makeState();
    const tail: GameEvent[] = [
      event(2, {
        actorId: 'p2',
        type: 'card/move',
        cardId: 'S-8',
        toZoneId: ZONE_DISCARD,
        face: 'up',
      }),
    ];

    const result = projectSnapshotWithTail(snapshot, 2, tail, 'p1');

    expect(result.lastSeq).toBe(2);
    expect(result.state.zones[ZONE_DISCARD]!.cardIds).toEqual(['S-8']);
    expect(result.state.zones[handZoneId('p2')]!.cardIds).toEqual([]);
    expect(result.events.some((candidate) => candidate.type === 'card/identify')).toBe(true);
  });
});

describe('engine-owned legality', () => {
  test('a waiting player receives no manipulable sources or targets', () => {
    const result = legalIntents(makeState(), 'p2', 'player');

    expect(result.sources).toEqual([]);
    expect(result.targets).toEqual([]);
    expect(result.label).toBe('Waiting');
  });

  test('a table-only surface never receives private-hand sources', () => {
    const result = legalIntents(makeState(), 'p1', 'table', 'public-table');

    expect(result.sources.every((source) => !source.zoneId.startsWith('hand:'))).toBe(true);
  });
});

describe('SessionRuntime transaction boundary', () => {
  test('validates a multi-event transaction against staged state, then commits atomically', () => {
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    const intent: GameIntent = {
      id: 'take-1',
      type: 'pile.take',
      actorId: 'p1',
      pileId: 'pile:public',
      to: handZoneId('p1'),
    };

    const result = runtime.commit(intent, () => [
      event(99, {
        actorId: 'p1',
        type: 'card/move',
        cardId: 'D-6',
        toZoneId: handZoneId('p1'),
      }),
      event(100, {
        actorId: 'p1',
        type: 'hand/reorder',
        playerId: 'p1',
        order: ['D-6', 'C-7'],
      }),
    ]);

    expect(result.ok).toBe(true);
    expect(result.state.zones[handZoneId('p1')]!.cardIds).toEqual(['D-6', 'C-7']);
    expect(result.events).toHaveLength(2);
    for (const committed of result.events) {
      expect(committed).toMatchObject({
        transactionId: intent.id,
        schemaVersion: 1,
      });
    }
    expect(result.events[0]).toMatchObject({
      seq: 1,
      fromZoneId: 'pile:public',
      toZoneId: handZoneId('p1'),
    });
    expect(result.events[1]!.seq).toBe(2);
  });

  test('an invalid event aborts the whole transaction without advancing sequence', () => {
    const initial = makeState();
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, initial);
    const intent: GameIntent = {
      id: 'take-invalid',
      type: 'pile.take',
      actorId: 'p1',
      pileId: 'pile:public',
      to: handZoneId('p1'),
    };

    const result = runtime.commit(intent, () => [
      event(99, {
        actorId: 'p1',
        type: 'card/move',
        cardId: 'D-6',
        toZoneId: handZoneId('p1'),
      }),
      event(100, {
        actorId: 'p1',
        type: 'card/flip',
        cardId: 'missing-card',
      }),
    ]);

    expect(result.ok).toBe(false);
    expect(runtime.getSeq()).toBe(0);
    expect(runtime.getEvents()).toEqual([]);
    expect(runtime.getState()).toBe(initial);
  });

  test('a duplicate is rejected before translation and never causes another side effect', () => {
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    const intent: GameIntent = {
      id: 'pass-once',
      type: 'turn.pass',
      actorId: 'p1',
    };
    const translate = jest.fn(() => [
      event(99, {
        actorId: 'p1',
        type: 'turn/end',
        playerId: 'p1',
      }),
    ]);

    expect(runtime.commit(intent, translate).ok).toBe(true);
    const duplicate = runtime.commit(intent, translate);

    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toBe('duplicate intent');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(runtime.getSeq()).toBe(1);
  });

  test('commits a legal typed intent through the built-in translator', () => {
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    const intent: GameIntent = {
      id: 'draw-built-in',
      type: 'pile.draw',
      actorId: 'p1',
      pileId: ZONE_DRAW,
      to: handZoneId('p1'),
    };

    const result = runtime.commit(intent);

    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'card/deal',
      cardId: 'H-4',
      fromZoneId: ZONE_DRAW,
      toZoneId: handZoneId('p1'),
      transactionId: intent.id,
      cue: 'draw',
      seq: 1,
    });
    expect(formatGameEventLine(result.events[0]!)).toContain(
      '#1 · v1 · tx draw-built-in · draw card/deal · H-4 · draw → hand:p1',
    );
  });

  test('rejects a draw that names a private hand as its pile', () => {
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    const intent: GameIntent = {
      id: 'draw-from-opponent',
      type: 'pile.draw',
      actorId: 'p1',
      pileId: handZoneId('p2'),
      to: handZoneId('p1'),
    };

    const result = runtime.commit(intent);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('source');
    expect(runtime.getState().zones[handZoneId('p2')]!.cardIds).toEqual(['S-8']);
  });

  test('keeps an accepted intent idempotent for the whole runtime session', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    const intent: GameIntent = {
      id: 'pass-long-lived',
      type: 'turn.pass',
      actorId: 'p1',
    };

    expect(runtime.commit(intent).ok).toBe(true);
    clock.mockReturnValue(10 * 60 * 1_000);
    const duplicate = runtime.commit(intent);
    clock.mockRestore();

    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toBe('duplicate intent');
    expect(runtime.getSeq()).toBe(1);
  });

  test('continues monotonic event sequence from an imported authority state', () => {
    const runtime = new SessionRuntime(
      { sessionId: 'session', hostId: 'p1', initialSeq: 41 },
      makeState(),
    );

    const result = runtime.commit({ id: 'pass-42', type: 'turn.pass', actorId: 'p1' });

    expect(result.ok).toBe(true);
    expect(result.events[0]?.seq).toBe(42);
    expect(runtime.getSeq()).toBe(42);
  });

  test('reconnect rejects unknown players and wrong reclaim tokens', () => {
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' }, makeState());
    runtime.bindSeat('p1', 'token-one');

    const unknown = runtime.reconnect('missing', 'token');
    expect(unknown).toMatchObject({
      ok: false,
      seatClaimed: false,
    });
    const wrongToken = runtime.reconnect('p1', 'wrong');
    expect(wrongToken).toMatchObject({
      ok: false,
      seatClaimed: false,
    });
    for (const denied of [unknown, wrongToken]) {
      const deniedWire = JSON.stringify(denied.state);
      expect(denied.state.meta.rngSeed).toBe('');
      expect(deniedWire).not.toContain('C-7');
      expect(deniedWire).not.toContain('S-8');
    }
    const reclaimed = runtime.reconnect('p1', 'token-one');
    expect(reclaimed).toMatchObject({
      ok: true,
      seatClaimed: true,
    });
    const wire = JSON.stringify(reclaimed.snapshot?.state);
    expect(reclaimed.snapshot?.state.meta.rngSeed).toBe('');
    expect(wire).toContain('C-7');
    expect(wire).not.toContain('S-8');

    const forgedViewer = runtime.reconnect('p1', 'token-one', {
      surfaceProfile: 'personal-table',
      viewerId: 'p2',
    });
    const forgedWire = JSON.stringify(forgedViewer.state);
    expect(forgedWire).toContain('C-7');
    expect(forgedWire).not.toContain('S-8');
  });

  test('restore folds the tail and preserves its sequence high-water mark', () => {
    const snapshot = makeState();
    const move = event(8, {
      actorId: 'p1',
      type: 'card/move',
      cardId: 'C-7',
      toZoneId: ZONE_DISCARD,
      face: 'up',
    });
    const runtime = new SessionRuntime({ sessionId: 'session', hostId: 'p1' });

    runtime.restore(snapshot, [move]);

    expect(runtime.getSeq()).toBe(8);
    expect(runtime.getState().zones[ZONE_DISCARD]!.cardIds).toEqual(['C-7']);
  });
});

describe('baseline fixtures through runtime and snapshot paths', () => {
  const fixtures = generateFixtures();

  for (const [name, raw] of Object.entries(fixtures)) {
    test(`${name} replays byte-for-byte through runtime restore`, () => {
      const events = raw.events as GameEvent[];
      const expected = foldEvents(events);
      const runtime = new SessionRuntime({
        sessionId: String(raw.sessionId),
        hostId: expected.meta.hostId,
      });

      runtime.restore(emptyState(), events);

      expect(JSON.stringify(runtime.getState())).toBe(JSON.stringify(expected));
      expect(runtime.getSeq()).toBe(events.at(-1)?.seq ?? 0);
    });

    test(`${name} snapshot plus tail reproduces authority state byte-for-byte`, () => {
      const events = raw.events as GameEvent[];
      const splitIndex = Math.max(1, Math.floor(events.length / 2));
      const snapshotEvents = events.slice(0, splitIndex);
      const afterSeq = snapshotEvents.at(-1)!.seq;
      const snapshot = buildSnapshot(snapshotEvents);
      const tail = tailAfter(events, afterSeq);
      const authority = foldEvents(events);

      expect(verifySnapshotWithTail(snapshot, tail, authority)).toBe(true);
      expect(JSON.stringify(tail.reduce(applyEvent, snapshot))).toBe(JSON.stringify(authority));
    });

    test(`${name} versioned snapshot envelope restores the canonical tail`, () => {
      const events = raw.events as GameEvent[];
      const splitIndex = Math.max(1, Math.floor(events.length / 2));
      const throughSeq = events[splitIndex - 1]!.seq;
      const snapshot = createRuntimeSnapshot(events, throughSeq);
      const restored = restoreRuntimeSnapshot(snapshot, tailAfter(events, throughSeq));

      expect(restored.lastSeq).toBe(events.at(-1)?.seq ?? throughSeq);
      expect(JSON.stringify(restored.state)).toBe(JSON.stringify(foldEvents(events)));
    });

    test(`${name} preserves exact-one-zone and unique-order invariants after every event`, () => {
      const events = raw.events as GameEvent[];
      let state = emptyState();
      for (const next of events) {
        state = applyEvent(state, next);
        if (state.phase === 'idle') continue;
        const zoneCards = Object.values(state.zones).flatMap((zone) => zone.cardIds.filter(Boolean));
        expect(new Set(zoneCards).size).toBe(zoneCards.length);
        expect(new Set(zoneCards)).toEqual(new Set(state.deckCardIds));
        for (const zone of Object.values(state.zones)) {
          const orders = zone.cardIds
            .filter(Boolean)
            .map((cardId) => state.cards[cardId]!.order);
          expect(new Set(orders).size).toBe(orders.length);
        }
      }
    });
  }
});
