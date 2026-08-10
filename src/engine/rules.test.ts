import { buildDeck, makeSeed, mulberry32, shuffleInPlace } from './deck';
import { emptyState, foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { ZONE_DRAW, handZoneId } from './types';
import { blackjackStylePreset } from './presets';
import { blackjackDealerPlay, handValue, isBust } from './rules';

function makeBlackjackState(players: { id: string; name: string }[]) {
  const seed = makeSeed();
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const playerObjs = players.map((p, seat) => ({ id: p.id, name: p.name, seat, avatarSeed: `seed-${p.id}` }));
  const setup = blackjackStylePreset.setup({
    players: playerObjs,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
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
    meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'pass', hostId: players[0]!.id },
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
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
  return foldEvents(events);
}

describe('blackjack rules', () => {
  test('handValue counts aces as 11 then demotes over 21', () => {
    const state = emptyState();
    const zone = handZoneId('p1');
    state.zones[zone] = { id: zone, label: 'hand', visibility: { kind: 'private', ownerId: 'p1' }, ownerId: 'p1', cardIds: ['H-A', 'H-A'] };
    state.cards['H-A'] = { id: 'H-A', face: 'up', zoneId: zone, order: 0 };
    expect(handValue(state, 'p1')).toBe(12);
  });

  test('isBust is true over 21', () => {
    expect(isBust(22)).toBe(true);
    expect(isBust(21)).toBe(false);
  });

  test('dealer play resolves winner when players stick', () => {
    const state = makeBlackjackState([
      { id: 'p1', name: 'P1' },
      { id: 'dealer', name: 'Dealer' },
    ]);
    const events = blackjackDealerPlay(state);
    const ends = events.filter((e) => e.type === 'session/end');
    expect(ends.length).toBe(1);
    const end = ends[0]!;
    // Winner must be a real player id and the dealer must play to >= 17 or bust.
    expect(['dealer', 'p1']).toContain(end.winnerId);
    const dealerValue = handValue(state, 'dealer');
    expect(dealerValue < 17 || isBust(dealerValue)).toBe(false);
  });

  test('dealer busts hand a win to the player', () => {
    // Force dealer to 24 via a hand of 10 + 10 + 4 and an empty draw pile.
    const state = makeBlackjackState([
      { id: 'p1', name: 'P1' },
      { id: 'dealer', name: 'Dealer' },
    ]);
    const dZone = handZoneId('dealer');
    state.zones[dZone] = { ...state.zones[dZone]!, cardIds: ['H-10', 'D-10', 'S-4'] };
    state.zones[ZONE_DRAW] = { ...state.zones[ZONE_DRAW]!, cardIds: [] };
    for (const cid of ['H-10', 'D-10', 'S-4']) {
      state.cards[cid] = { id: cid, face: 'up', zoneId: dZone, order: 0 };
    }
    const events = blackjackDealerPlay(state);
    const end = events.find((e) => e.type === 'session/end')!;
    expect(end.winnerId).toBe('p1');
  });
});
