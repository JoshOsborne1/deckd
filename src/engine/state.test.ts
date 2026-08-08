import { buildDeck, makeSeed, mulberry32, shuffleInPlace } from './deck';
import { emptyState, foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { ZONE_DISCARD, ZONE_DRAW, handZoneId } from './types';
import { freeplayPreset, dealTwoEachPreset } from './presets';
import {
  selectDrawPileCount,
  selectDiscardTopCard,
  selectLocalHand,
  selectOpponents,
  selectIsMyTurn,
} from './selectors';

function makeSessionEvents(players: { id: string; name: string }[], presetId: string): GameEvent[] {
  const seed = makeSeed();
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const preset = presetId === 'deal-two-each' ? dealTwoEachPreset : freeplayPreset;
  const playerObjs = players.map((p, seat) => ({ id: p.id, name: p.name, seat, avatarSeed: `seed-${p.id}` }));
  const setup = preset.setup({ players: playerObjs, config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId }, deckOrder });

  const events: GameEvent[] = [];
  let seq = 1;
  events.push({
    type: 'session/start',
    id: eventId(seq),
    ts: Date.now(),
    actorId: 'system',
    seq: seq++,
    meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'pass', hostId: players[0]!.id },
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

describe('foldEvents / session start', () => {
  it('starts a freeplay session with a full draw pile', () => {
    const events = makeSessionEvents([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], 'freeplay');
    const state = foldEvents(events);
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    expect(selectDrawPileCount(state)).toBe(52);
    expect(state.currentPlayerId).toBe('p1');
  });

  it('deal-two-each deals 2 face-down cards to every player', () => {
    const events = makeSessionEvents(
      [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }],
      'deal-two-each',
    );
    const state = foldEvents(events);
    for (const p of state.players) {
      expect(selectLocalHand(state, p.id)).toHaveLength(2);
    }
    expect(selectDrawPileCount(state)).toBe(52 - 6);
  });

  it('empty state is idle with no zones', () => {
    const state = emptyState();
    expect(state.phase).toBe('idle');
    expect(Object.keys(state.zones)).toHaveLength(0);
  });
});

describe('turn flow', () => {
  it('end turn advances to the next player and back around', () => {
    const events = makeSessionEvents([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], 'freeplay');
    const state = foldEvents(events);
    const afterP1 = foldEvents([
      ...events,
      { type: 'turn/end', id: eventId(99), ts: Date.now(), actorId: 'p1', seq: 99, playerId: 'p1' },
    ]);
    expect(afterP1.currentPlayerId).toBe('p2');
    expect(selectIsMyTurn(afterP1, 'p2')).toBe(true);
    expect(selectIsMyTurn(afterP1, 'p1')).toBe(false);

    const afterP2 = foldEvents([
      ...events,
      { type: 'turn/end', id: eventId(99), ts: Date.now(), actorId: 'p1', seq: 99, playerId: 'p1' },
      { type: 'turn/end', id: eventId(100), ts: Date.now(), actorId: 'p2', seq: 100, playerId: 'p2' },
    ]);
    expect(afterP2.currentPlayerId).toBe('p1');
    expect(afterP2.turn).toBe(2);
  });
});

describe('zones and visibility', () => {
  it('discard top card is visible and selectable', () => {
    const events = makeSessionEvents([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], 'freeplay');
    const state = foldEvents(events);
    const drawTop = state.zones[ZONE_DRAW]!.cardIds[0]!;
    const discard = foldEvents([
      ...events,
      {
        type: 'card/move',
        id: eventId(99),
        ts: Date.now(),
        actorId: 'p1',
        seq: 99,
        cardId: drawTop,
        toZoneId: ZONE_DISCARD,
        face: 'up',
      },
    ]);
    const top = selectDiscardTopCard(discard);
    expect(top).not.toBeNull();
    expect(top!.id).toBe(drawTop);
    expect(top!.face).toBe('up');
  });

  it('opponents excludes the viewer', () => {
    const events = makeSessionEvents([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }], 'freeplay');
    const state = foldEvents(events);
    const opps = selectOpponents(state, 'p1');
    expect(opps.map((o) => o.id).sort()).toEqual(['p2', 'p3']);
  });

  it('hand zone is private to its owner', () => {
    const events = makeSessionEvents([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], 'deal-two-each');
    const state = foldEvents(events);
    const zone = state.zones[handZoneId('p1')]!;
    expect(zone.visibility).toEqual({ kind: 'private', ownerId: 'p1' });
  });
});
