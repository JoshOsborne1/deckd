/**
 * Pure sync-logic tests + host/guest simulation.
 *
 * These tests exercise the framework-free helpers in syncLogic.ts and
 * simulate the full host-broadcast → guest-fold loop the multiplayerBridge
 * performs at runtime, without a real WebSocket.
 */

import { buildDeck, makeSeed, mulberry32, shuffleInPlace } from '@engine/deck';
import { foldEvents } from '@engine/state';
import { eventId } from '@engine/events';
import type { GameEvent } from '@engine/events';
import { ZONE_DISCARD, ZONE_DRAW, handZoneId } from '@engine/types';
import { freeplayPreset, dealTwoEachPreset } from '@engine/presets';
import {
  selectDrawPileCount,
  selectDiscardTopCard,
  selectLocalHand,
  selectOpponents,
  selectIsMyTurn,
} from '@engine/selectors';
import {
  selectNewEvents,
  foldRemoteEvents,
  selectBroadcastDelta,
  applySnapshotWithTail,
} from '@store/syncLogic';

function makeSessionEvents(
  players: { id: string; name: string }[],
  presetId: string,
): GameEvent[] {
  const seed = makeSeed();
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const preset = presetId === 'deal-two-each' ? dealTwoEachPreset : freeplayPreset;
  const playerObjs = players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    seat,
    avatarSeed: `seed-${p.id}`,
  }));
  const setup = preset.setup({
    players: playerObjs,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId },
    deckOrder,
  });

  const events: GameEvent[] = [];
  let seq = 1;
  events.push({
    type: 'session/start',
    id: eventId(seq),
    ts: Date.now(),
    actorId: 'system',
    seq: seq++,
    meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'online-host', hostId: players[0]!.id },
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId },
    players: playerObjs,
    zones: setup.zones,
  });
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq),
      ts: Date.now(),
      actorId: 'system',
      seq: seq++,
      cardId: deal.cardId,
      toZoneId: deal.toZoneId,
      face: deal.face,
    });
  }
  return events;
}

describe('selectNewEvents', () => {
  it('filters events the local store has already seen (by id)', () => {
    const e1: GameEvent = { type: 'session/start', id: 'a', ts: 1, actorId: 'system', seq: 1, meta: {} as never, config: {} as never, players: [], zones: [] };
    const e2: GameEvent = { type: 'session/pause', id: 'b', ts: 2, actorId: 'system', seq: 2 };
    const incoming = [e1, e2];
    const fresh = selectNewEvents([e1], incoming);
    expect(fresh).toEqual([e2]);
  });

  it('sorts by seq', () => {
    const e1: GameEvent = { type: 'session/pause', id: 'a', ts: 1, actorId: 'system', seq: 5 };
    const e2: GameEvent = { type: 'session/resume', id: 'b', ts: 2, actorId: 'system', seq: 3 };
    const fresh = selectNewEvents([], [e1, e2]);
    expect(fresh.map((e) => e.seq)).toEqual([3, 5]);
  });

  it('returns empty when all events are already known', () => {
    const e1: GameEvent = { type: 'session/pause', id: 'a', ts: 1, actorId: 'system', seq: 1 };
    expect(selectNewEvents([e1], [e1])).toEqual([]);
  });
});

describe('foldRemoteEvents', () => {
  it('folds a fresh session-start batch into a playing state', () => {
    const sessionEvents = makeSessionEvents(
      [{ id: 'host', name: 'Alice' }, { id: 'guest', name: 'Bob' }],
      'freeplay',
    );
    const result = foldRemoteEvents([], sessionEvents);
    expect(result.applied).toBe(sessionEvents.length);
    expect(result.state.phase).toBe('playing');
    expect(result.state.players).toHaveLength(2);
    expect(result.lastSeq).toBe(sessionEvents.length);
  });

  it('dedupes events the guest already has', () => {
    const sessionEvents = makeSessionEvents(
      [{ id: 'host', name: 'Alice' }, { id: 'guest', name: 'Bob' }],
      'freeplay',
    );
    // Guest already folded the first event.
    const result = foldRemoteEvents(sessionEvents.slice(0, 1), sessionEvents);
    expect(result.applied).toBe(sessionEvents.length - 1);
    expect(result.events).toHaveLength(sessionEvents.length);
  });

  it('applied=0 returns without changing anything', () => {
    const sessionEvents = makeSessionEvents(
      [{ id: 'host', name: 'Alice' }, { id: 'guest', name: 'Bob' }],
      'freeplay',
    );
    const result = foldRemoteEvents(sessionEvents, sessionEvents);
    expect(result.applied).toBe(0);
  });
});

describe('selectBroadcastDelta', () => {
  it('returns events with seq > afterSeq', () => {
    const e1: GameEvent = { type: 'session/pause', id: 'a', ts: 1, actorId: 'system', seq: 1 };
    const e2: GameEvent = { type: 'session/resume', id: 'b', ts: 2, actorId: 'system', seq: 2 };
    const e3: GameEvent = { type: 'session/end', id: 'c', ts: 3, actorId: 'system', seq: 3 };
    expect(selectBroadcastDelta([e1, e2, e3], 1)).toEqual([e2, e3]);
  });

  it('returns empty when no events are after the cursor', () => {
    const e1: GameEvent = { type: 'session/pause', id: 'a', ts: 1, actorId: 'system', seq: 1 };
    expect(selectBroadcastDelta([e1], 1)).toEqual([]);
  });
});

describe('applySnapshotWithTail', () => {
  it('applies tail events onto a snapshot', () => {
    const sessionEvents = makeSessionEvents(
      [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
      'freeplay',
    );
    const snapshot = foldEvents(sessionEvents);
    const tail: GameEvent[] = [
      { type: 'turn/end', id: eventId(99), ts: Date.now(), actorId: 'p1', seq: 99, playerId: 'p1' },
    ];
    const result = applySnapshotWithTail(snapshot, 99, tail);
    expect(result.state.currentPlayerId).toBe('p2');
    expect(result.lastSeq).toBe(99);
    expect(result.appliedTail).toHaveLength(1);
  });

  it('filters out tail events below nextSeq', () => {
    const sessionEvents = makeSessionEvents(
      [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
      'freeplay',
    );
    const snapshot = foldEvents(sessionEvents);
    const tail: GameEvent[] = [
      { type: 'turn/end', id: eventId(50), ts: Date.now(), actorId: 'p1', seq: 50, playerId: 'p1' },
    ];
    const result = applySnapshotWithTail(snapshot, 99, tail);
    expect(result.appliedTail).toHaveLength(0);
  });
});

/**
 * Full host → guest simulation: the bridge broadcasts events, the guest
 * folds them, and the guest's state mirrors the host's state. This is the
 * core acceptance test for T2 without a real WebSocket.
 */
describe('host/guest simulation', () => {
  it('guest mirrors host after session start + turn pass', () => {
    const hostEvents = makeSessionEvents(
      [{ id: 'host-cid', name: 'Alice' }, { id: 'guest-cid', name: 'Bob' }],
      'freeplay',
    );
    const hostState = foldEvents(hostEvents);

    // Guest starts cold, receives the full event chain (snapshot request answer).
    let guestResult = foldRemoteEvents([], hostEvents);
    expect(guestResult.state.phase).toBe('playing');
    expect(guestResult.state.players).toHaveLength(2);
    expect(selectDrawPileCount(guestResult.state)).toBe(selectDrawPileCount(hostState));

    // Host draws a card (adds an event).
    const drawTop = hostState.zones[ZONE_DRAW]!.cardIds[0]!;
    const drawEvent: GameEvent = {
      type: 'card/deal',
      id: eventId(99),
      ts: Date.now(),
      actorId: 'host-cid',
      seq: 99,
      cardId: drawTop,
      toZoneId: handZoneId('host-cid'),
      face: 'up',
    };
    const hostEvents2 = [...hostEvents, drawEvent];

    // Host broadcasts the delta (events with seq > lastSeq the guest has).
    const delta = selectBroadcastDelta(hostEvents2, guestResult.lastSeq);

    // Guest folds the delta.
    guestResult = foldRemoteEvents(guestResult.events, delta);
    expect(guestResult.state.zones[ZONE_DRAW]!.cardIds.length).toBe(
      selectDrawPileCount(hostState) - 1,
    );
  });

  it('guest hands stay private: guest sees their own hand but not the host hand', () => {
    const hostEvents = makeSessionEvents(
      [{ id: 'host-cid', name: 'Alice' }, { id: 'guest-cid', name: 'Bob' }],
      'deal-two-each',
    );

    // Guest folds the session.
    const guestResult = foldRemoteEvents([], hostEvents);
    const guestState = guestResult.state;

    // Guest sees their own 2-card hand.
    const guestHand = selectLocalHand(guestState, 'guest-cid');
    expect(guestHand).toHaveLength(2);

    // Guest sees the host as an opponent with 2 cards (face-down stubs).
    const opponents = selectOpponents(guestState, 'guest-cid');
    expect(opponents).toHaveLength(1);
    expect(opponents[0]!.id).toBe('host-cid');

    // The host's hand zone is private to host-cid, not to guest-cid.
    const hostHandZone = guestState.zones[handZoneId('host-cid')]!;
    expect(hostHandZone.visibility).toEqual({ kind: 'private', ownerId: 'host-cid' });

    // Guest cannot see host's hand cards via selectLocalHand (wrong viewerId).
    const hostHandFromGuestView = selectLocalHand(guestState, 'guest-cid');
    const hostHandFromHostView = selectLocalHand(guestState, 'host-cid');
    expect(hostHandFromGuestView.map((c) => c.id)).not.toEqual(
      hostHandFromHostView.map((c) => c.id),
    );
  });

  it('turn changes propagate: host ends turn, guest sees current player change', () => {
    const hostEvents = makeSessionEvents(
      [{ id: 'host-cid', name: 'Alice' }, { id: 'guest-cid', name: 'Bob' }],
      'freeplay',
    );
    const hostState = foldEvents(hostEvents);
    expect(hostState.currentPlayerId).toBe('host-cid');

    // Host ends turn.
    const turnEnd: GameEvent = {
      type: 'turn/end',
      id: eventId(99),
      ts: Date.now(),
      actorId: 'host-cid',
      seq: 99,
      playerId: 'host-cid',
    };
    const hostEvents2 = [...hostEvents, turnEnd];

    // Guest folds the delta.
    let guestResult = foldRemoteEvents([], hostEvents);
    const delta = selectBroadcastDelta(hostEvents2, guestResult.lastSeq);
    guestResult = foldRemoteEvents(guestResult.events, delta);

    expect(guestResult.state.currentPlayerId).toBe('guest-cid');
    expect(selectIsMyTurn(guestResult.state, 'guest-cid')).toBe(true);
    expect(selectIsMyTurn(guestResult.state, 'host-cid')).toBe(false);
  });

  it('card moves propagate: guest sees the discard top change', () => {
    const hostEvents = makeSessionEvents(
      [{ id: 'host-cid', name: 'Alice' }, { id: 'guest-cid', name: 'Bob' }],
      'freeplay',
    );
    const hostState = foldEvents(hostEvents);
    const drawTop = hostState.zones[ZONE_DRAW]!.cardIds[0]!;

    // Host moves a card to discard.
    const moveEvent: GameEvent = {
      type: 'card/move',
      id: eventId(99),
      ts: Date.now(),
      actorId: 'host-cid',
      seq: 99,
      cardId: drawTop,
      toZoneId: ZONE_DISCARD,
      face: 'up',
    };
    const hostEvents2 = [...hostEvents, moveEvent];

    // Guest folds the delta.
    let guestResult = foldRemoteEvents([], hostEvents);
    const delta = selectBroadcastDelta(hostEvents2, guestResult.lastSeq);
    guestResult = foldRemoteEvents(guestResult.events, delta);

    const guestDiscardTop = selectDiscardTopCard(guestResult.state);
    expect(guestDiscardTop).not.toBeNull();
    expect(guestDiscardTop!.id).toBe(drawTop);
    expect(guestDiscardTop!.face).toBe('up');
  });

  it('pass-and-play with no relay: the helpers work for local-only event folding', () => {
    // No relay session means the bridge is inert, but the gameStore still
    // folds events locally. Verify the helpers don't break on an empty batch.
    const sessionEvents = makeSessionEvents(
      [{ id: 'you', name: 'You' }, { id: 'p2', name: 'Player 2' }],
      'freeplay',
    );
    const result = foldRemoteEvents(sessionEvents, []);
    expect(result.applied).toBe(0);
    expect(result.events).toHaveLength(sessionEvents.length);
  });
});