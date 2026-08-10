import { buildDeck, makeSeed, mulberry32, shuffleInPlace } from './deck';
import { emptyState, foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { ZONE_DRAW, communalZoneId, handZoneId } from './types';
import { blackjackStylePreset, pokerStylePreset } from './presets';
import { blackjackDealerPlay, evaluatePokerHand, getGameRules, handValue, isBust } from './rules';

function makeSession(players: { id: string; name: string }[], preset: 'blackjack' | 'poker' = 'blackjack') {
  const seed = makeSeed();
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const playerObjs = players.map((p, seat) => ({ id: p.id, name: p.name, seat, avatarSeed: `seed-${p.id}` }));
  const presetObj = preset === 'blackjack' ? blackjackStylePreset : pokerStylePreset;
  const setup = presetObj.setup({
    players: playerObjs,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: preset },
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
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: preset },
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

function makeBlackjackState(players: { id: string; name: string }[]) {
  return makeSession(players, 'blackjack');
}

describe('poker rules', () => {
  test('poker preset creates the communal zone so flop deals are accepted', () => {
    const state = makeSession(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      'poker',
    );
    expect(state.zones[communalZoneId(0)]).toBeDefined();
  });

  test('evaluatePokerHand ranks pairs numerically (regression: string compare)', () => {
    // Pair of tens vs pair of nines: tens must win.
    const tens = evaluatePokerHand(['H-10', 'D-10', 'S-2', 'C-5', 'D-7', 'H-3', 'S-9']);
    const nines = evaluatePokerHand(['H-9', 'D-9', 'S-2', 'C-5', 'D-7', 'H-3', 'S-10']);
    expect(tens.category).toBe(1);
    expect(nines.category).toBe(1);
    expect(tens.tiebreak[0]).toBeGreaterThan(nines.tiebreak[0]!);
  });

  test('evaluatePokerHand detects a flush', () => {
    const score = evaluatePokerHand(['H-2', 'H-5', 'H-8', 'H-J', 'H-K', 'D-3', 'S-4']);
    expect(score.category).toBe(5);
    expect(score.label).toBe('Flush');
  });

  test('evaluatePokerHand detects a straight and wheel', () => {
    const straight = evaluatePokerHand(['H-9', 'D-10', 'S-J', 'C-Q', 'D-K', 'H-2', 'S-3']);
    expect(straight.category).toBe(4);
    const wheel = evaluatePokerHand(['H-A', 'D-2', 'S-3', 'C-4', 'D-5', 'H-9', 'S-9']);
    expect(wheel.category).toBe(4);
    expect(wheel.tiebreak[0]).toBe(5);
  });

  test('poker flop/turn/river apply and deal into the communal zone', () => {
    const state = makeSession(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      'poker',
    );
    const rules = getGameRules('poker');
    const host = state.meta.hostId;

    const flop = rules.apply('flop', state, host)!;
    const flopDeals = flop.filter((e) => e.type === 'card/deal');
    expect(flopDeals).toHaveLength(3);
    for (const deal of flopDeals) expect(deal.toZoneId).toBe(communalZoneId(0));

    // Fold the whole flop sequence and verify the cards landed in community.
    const streetEv = flop.find((e) => e.type === 'game/street');
    const folded = foldEvents([
      {
        type: 'session/start',
        id: eventId(1),
        ts: Date.now(),
        actorId: 'system',
        seq: 1,
        meta: state.meta,
        config: state.config,
        players: state.players,
        zones: Object.values(state.zones),
      },
      ...flopDeals.map((deal, i) => ({
        type: 'card/deal' as const,
        id: eventId(i + 2),
        ts: Date.now(),
        actorId: 'system',
        seq: i + 2,
        cardId: deal.cardId!,
        toZoneId: deal.toZoneId!,
        face: 'up' as const,
      })),
      ...(streetEv
        ? [{
            type: 'game/street' as const,
            id: eventId(10),
            ts: Date.now(),
            actorId: 'system',
            seq: 10,
            street: (streetEv as { street?: number }).street ?? 1,
          }]
        : []),
    ]);
    const communal = folded.zones[communalZoneId(0)];
    expect(communal?.cardIds.length).toBe(3);
    expect(folded.game?.street).toBe(1);
  });
});

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
    // Winner is a real player id, or undefined on a push (dealer ties best).
    if (end.winnerId !== undefined) {
      expect(['dealer', 'p1']).toContain(end.winnerId);
    }
    // Fold the dealer draws, then assert the dealer played to >= 17 or busted.
    const deals = events.filter((e) => e.type === 'card/deal');
    const finalState = foldEvents([
      {
        type: 'session/start',
        id: eventId(1),
        ts: Date.now(),
        actorId: 'system',
        seq: 1,
        meta: state.meta,
        config: state.config,
        players: state.players,
        zones: Object.values(state.zones),
      },
      ...deals.map((deal, i) => ({
        type: 'card/deal' as const,
        id: eventId(i + 2),
        ts: Date.now(),
        actorId: 'system',
        seq: i + 2,
        cardId: deal.cardId!,
        toZoneId: deal.toZoneId!,
        face: 'up' as const,
      })),
    ]);
    const dealerValue = handValue(finalState, 'dealer');
    expect(dealerValue < 17 && !isBust(dealerValue)).toBe(false);
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

  test('solo: one player plus virtual house deals 2 up + dealer 1 up 1 down', () => {
    // Mirrors gameStore: blackjack appends a virtual house seat (last = dealer).
    const players = [
      { id: 'you', name: 'You', seat: 0, avatarSeed: 'you' },
      { id: 'house', name: 'House', seat: 1, avatarSeed: 'house' },
    ];
    const seed = makeSeed();
    const deckOrder = shuffleInPlace(
      buildDeck({ includeJokers: false }).map((c) => c.id),
      mulberry32(seed),
    );
    const setup = blackjackStylePreset.setup({
      players,
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
      deckOrder,
    });
    const youDeals = setup.initialDeals.filter((d) => d.toZoneId === handZoneId('you'));
    const houseDeals = setup.initialDeals.filter((d) => d.toZoneId === handZoneId('house'));
    expect(youDeals).toHaveLength(2);
    expect(youDeals.every((d) => d.face === 'up')).toBe(true);
    expect(houseDeals).toHaveLength(2);
    expect(houseDeals[0]!.face).toBe('up');
    expect(houseDeals[1]!.face).toBe('down');
  });

  test('solo: twist then stick hands the turn to the house, which auto-plays', () => {
    const players = [
      { id: 'you', name: 'You', seat: 0, avatarSeed: 'you' },
      { id: 'house', name: 'House', seat: 1, avatarSeed: 'house' },
    ];
    const seed = makeSeed();
    const deckOrder = shuffleInPlace(
      buildDeck({ includeJokers: false }).map((c) => c.id),
      mulberry32(seed),
    );
    const setup = blackjackStylePreset.setup({
      players,
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
      meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'solo', hostId: 'you' },
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
      players,
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
    let state = foldEvents(events);

    const rules = getGameRules('blackjack');
    // Player twists (takes a card), then sticks.
    const twist = rules.apply('twist', state, 'you');
    expect(twist).not.toBeNull();
    const twistDeal = twist!.find((e) => e.type === 'card/deal')!;
    events.push({
      type: 'card/deal',
      id: eventId(++seq),
      ts: Date.now(),
      actorId: 'you',
      seq,
      cardId: twistDeal.cardId!,
      toZoneId: twistDeal.toZoneId!,
      face: twistDeal.face ?? 'up',
    });
    state = foldEvents(events);

    const stick = rules.apply('stick', state, 'you');
    expect(stick).not.toBeNull();
    const turnEnd = stick!.find((e) => e.type === 'turn/end')!;
    events.push({
      type: 'turn/end',
      id: eventId(++seq),
      ts: Date.now(),
      actorId: 'you',
      seq,
      playerId: turnEnd.playerId!,
    });
    state = foldEvents(events);
    // Turn passes to the house (last seat).
    expect(state.currentPlayerId).toBe('house');

    // House auto-plays to 17+ or busts, ending the session.
    const dealerEvents = blackjackDealerPlay(state);
    const end = dealerEvents.find((e) => e.type === 'session/end');
    expect(end).toBeDefined();
    if (end!.winnerId !== undefined) {
      expect(['you', 'house']).toContain(end!.winnerId);
    }
  });
});
