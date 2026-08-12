import { buildDeck, mulberry32, shuffleInPlace } from './deck';
import { eventId, type GameEvent } from './events';
import { foldEvents } from './state';
import { executeRecipe } from './recipes';
import { getGameRules, type GameAction, type PrimitiveEvent } from './rules';
import { crazyEightsPreset, goFishPreset, oldMaidPreset, sevensPreset } from './presets';
import { handZoneId, tableZoneId, ZONE_DRAW, type GameState, type Player, type SessionConfig } from './types';

const players: Player[] = [
  { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
  { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
];

const goFishConfig: SessionConfig = {
  includeJokers: false,
  fanStyle: 'wide',
  autoReshuffleDiscard: true,
  presetId: 'go-fish',
};

const oldMaidConfig: SessionConfig = {
  includeJokers: false,
  fanStyle: 'wide',
  autoReshuffleDiscard: true,
  presetId: 'old-maid',
};

function startSession(
  preset: typeof goFishPreset | typeof oldMaidPreset | typeof crazyEightsPreset | typeof sevensPreset,
  config: SessionConfig,
  deckOrder: string[],
  sessionPlayers: Player[] = players,
  seed = 'test',
): { state: GameState; events: GameEvent[]; nextSeq: number } {
  const setup = executeRecipe(preset.recipe, { players: sessionPlayers, config, deckOrder });
  const events: GameEvent[] = [{
    type: 'session/start',
    id: eventId(1),
    ts: 1,
    actorId: 'system',
    seq: 1,
    meta: { id: `test-${preset.id}`, createdAt: 1, rngSeed: seed, mode: 'pass', hostId: 'p1' },
    config,
    players: sessionPlayers,
    zones: setup.zones,
  }];
  let seq = 2;
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq),
      ts: seq,
      actorId: 'system',
      seq: seq++,
      cardId: deal.cardId,
      toZoneId: deal.toZoneId,
      face: deal.face,
    });
  }
  return { state: foldEvents(events), events, nextSeq: seq };
}

function appendPrimitives(
  log: GameEvent[],
  primitives: PrimitiveEvent[],
  actorId: string,
  nextSeq: number,
): { state: GameState; events: GameEvent[]; nextSeq: number } {
  const events = log.slice();
  let seq = nextSeq;
  for (const primitive of primitives) {
    events.push({
      ...primitive,
      id: eventId(seq),
      ts: seq,
      actorId,
      seq: seq++,
    } as unknown as GameEvent);
  }
  return { state: foldEvents(events), events, nextSeq: seq };
}

function orderedWithPrefix(prefix: string[], includeJoker = false): string[] {
  const deck = buildDeck({ includeJokers: includeJoker }).map((card) => card.id);
  const rest = deck.filter((cardId) => !prefix.includes(cardId));
  return [...prefix, ...rest];
}

describe('Go Fish recipe and rules', () => {
  it('deals five cards each and asks the next live player for a rank', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'D-A', 'S-A', 'C-A']);
    const started = startSession(goFishPreset, goFishConfig, deckOrder);
    const { state } = started;

    expect(started.events.filter((event) => event.type === 'card/deal')).toHaveLength(10);
    expect(state.zones[handZoneId('p1')]?.cardIds).toHaveLength(5);
    expect(state.zones[handZoneId('p2')]?.cardIds).toHaveLength(5);
    expect(getGameRules('go-fish').actions(state, 'p1').map((action) => action.id)).toContain('ask:p2:A');
  });

  it('moves matching cards, collects a book of four, and keeps the turn after a hit', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'D-A', 'S-A', 'C-A']);
    const started = startSession(goFishPreset, goFishConfig, deckOrder);
    const rules = getGameRules('go-fish');
    const primitives = rules.apply('ask:p2:A', started.state, 'p1');

    expect(primitives).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card/ask', targetPlayerId: 'p2', rank: 'A', found: true }),
      expect.objectContaining({ type: 'card/move', toZoneId: handZoneId('p1') }),
      expect.objectContaining({ type: 'card/move', toZoneId: tableZoneId('p1'), face: 'up' }),
    ]));

    const result = appendPrimitives(started.events, primitives ?? [], 'p1', started.nextSeq);
    expect(result.state.currentPlayerId).toBe('p1');
    expect(result.state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(4);
    expect(result.state.zones[handZoneId('p2')]?.cardIds).toHaveLength(3);
    expect(rules.readout?.(result.state, 'p1')).toContain('BOOKS 1');
  });
});

describe('Go Fish empty draw pile', () => {
  /**
   * Craft a two-player session where the 10-card deal exhausts the deck
   * (draw pile empty) with hand contents chosen per test.
   * Deck order: round-robin 5 rounds, so p1 takes indices 0,2,4,6,8 and
   * p2 takes 1,3,5,7,9.
   */
  function craftHands(p1Cards: string[], p2Cards: string[]) {
    const order: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      order.push(p1Cards[i]!, p2Cards[i]!);
    }
    const started = startSession(goFishPreset, goFishConfig, order);
    expect(started.state.zones[ZONE_DRAW]?.cardIds).toHaveLength(0);
    return started;
  }

  it('ends the round on a miss when the draw pile is empty instead of cycling the turn', () => {
    // p1 holds four aces plus a two; p2 holds kings plus a three and a four.
    // No rank in p1's hand exists in p2's hand, so the ask must miss and the
    // draw pile is already empty: the round ends (classic Go Fish).
    const started = craftHands(['H-A', 'D-A', 'S-A', 'C-A', 'D-2'], ['H-K', 'D-K', 'S-K', 'C-K', 'H-3']);
    const rules = getGameRules('go-fish');
    expect(rules.actions(started.state, 'p1').map((action) => action.id)).toContain('ask:p2:A');

    const result = appendPrimitives(
      started.events,
      rules.apply('ask:p2:A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );

    expect(result.events.some((event) => event.type === 'turn/end')).toBe(false);
    expect(result.state.phase).toBe('ended');
    expect(result.state.winnerId).toBe('p1');
  });

  it('still ends the round when the only legal ask misses with an empty deck', () => {
    // p1 holds a single queen; p2 holds distinct ranks. With the deck empty
    // the round must not deadlock.
    const started = craftHands(['H-Q', 'D-Q', 'S-Q', 'C-Q', 'H-2'], ['H-K', 'D-K', 'S-K', 'C-K', 'H-3']);
    const rules = getGameRules('go-fish');
    const result = appendPrimitives(
      started.events,
      rules.apply('ask:p2:Q', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );

    expect(result.state.phase).toBe('ended');
    expect(result.state.winnerId).toBeDefined();
  });

  it('keeps the turn on a hit with an empty deck and lays the book on the felt', () => {
    // p1 holds three aces plus two fillers; p2 holds the fourth ace. The hit
    // makes four aces, lays the book, and p1 keeps the turn even though the
    // draw pile is empty.
    const started = craftHands(['H-A', 'D-A', 'S-A', 'D-2', 'D-3'], ['C-A', 'H-K', 'D-K', 'S-K', 'C-K']);
    const rules = getGameRules('go-fish');
    const result = appendPrimitives(
      started.events,
      rules.apply('ask:p2:A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );

    expect(result.state.phase).toBe('playing');
    expect(result.state.currentPlayerId).toBe('p1');
    expect(result.state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(4);
    expect(result.state.zones[handZoneId('p1')]?.cardIds).toHaveLength(2);
  });
});

describe('Old Maid recipe and rules', () => {
  it('deals a standard deck plus one maid joker without exposing hands', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'H-K', 'D-A', 'D-K'], true)
      .filter((cardId) => cardId !== 'JK-BLACK');
    const started = startSession(oldMaidPreset, oldMaidConfig, deckOrder);
    const state = started.state;

    expect(started.events.filter((event) => event.type === 'card/deal')).toHaveLength(53);
    expect(state.zones[handZoneId('p1')]?.cardIds).toHaveLength(27);
    expect(state.zones[handZoneId('p2')]?.cardIds).toHaveLength(26);
    expect(state.zones[handZoneId('p1')]?.visibility).toEqual({ kind: 'private', ownerId: 'p1' });
    expect(state.zones[handZoneId('p2')]?.visibility).toEqual({ kind: 'private', ownerId: 'p2' });
    expect(Object.keys(state.cards).filter((cardId) => cardId.startsWith('JK-'))).toEqual(['JK-RED']);
  });

  it('lays down pairs, skips empty players, and draws from the next live hand', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'H-K', 'D-A', 'D-K'], true)
      .filter((cardId) => cardId !== 'JK-BLACK');
    const started = startSession(oldMaidPreset, oldMaidConfig, deckOrder);
    const rules = getGameRules('old-maid');
    const pairAction = rules.actions(started.state, 'p1').find((action) => action.id === 'pair');
    expect(pairAction).toBeDefined();

    const paired = appendPrimitives(
      started.events,
      rules.apply('pair', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(paired.state.zones[tableZoneId('p1')]?.cardIds.length).toBeGreaterThan(0);
    expect(paired.state.currentPlayerId).toBe('p2');

    const p2Before = paired.state.zones[handZoneId('p2')]?.cardIds.length ?? 0;
    const p1Before = paired.state.zones[handZoneId('p1')]?.cardIds.length ?? 0;
    const drawn = appendPrimitives(
      paired.events,
      rules.apply('draw', paired.state, 'p2') ?? [],
      'p2',
      paired.nextSeq,
    );
    expect(drawn.state.zones[handZoneId('p2')]?.cardIds.length).toBe(p2Before + 1);
    expect(drawn.state.zones[handZoneId('p1')]?.cardIds.length).toBe(p1Before - 1);
    expect(drawn.state.currentPlayerId).toBe('p1');
  });

  it('declares the player who just emptied as winner, not an earlier-emptied seat', () => {
    // Three players. p1's 18 cards are 9 pairs, p2's 18 are 9 pairs, p3's 17
    // are 8 pairs plus the maid joker. p1 pairs first and empties (game
    // continues, p2 and p3 still hold cards); p2 pairs next and empties,
    // which ends the round. The winner must be p2 — the player who just
    // emptied — not p1, who emptied earlier and sits first in seat order.
    const p1Cards = ['H-A', 'D-A', 'H-2', 'D-2', 'H-3', 'D-3', 'H-4', 'D-4', 'H-5', 'D-5', 'H-6', 'D-6', 'H-7', 'D-7', 'H-8', 'D-8', 'H-9', 'D-9'];
    const p2Cards = ['C-10', 'S-10', 'C-J', 'S-J', 'C-Q', 'S-Q', 'C-K', 'S-K', 'C-A', 'S-A', 'C-2', 'S-2', 'C-3', 'S-3', 'C-4', 'S-4', 'C-5', 'S-5'];
    const p3Cards = ['C-6', 'S-6', 'C-7', 'S-7', 'C-8', 'S-8', 'C-9', 'S-9', 'H-10', 'D-10', 'H-J', 'D-J', 'H-Q', 'D-Q', 'H-K', 'D-K', 'JK-RED'];
    const order: string[] = [];
    for (let i = 0; i < 17; i += 1) order.push(p1Cards[i]!, p2Cards[i]!, p3Cards[i]!);
    order.push(p1Cards[17]!, p2Cards[17]!);

    const threePlayers: Player[] = [
      { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
      { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
      { id: 'p3', name: 'Three', seat: 2, avatarSeed: 'three' },
    ];
    const started = startSession(oldMaidPreset, oldMaidConfig, order, threePlayers);
    const rules = getGameRules('old-maid');

    const p1Paired = appendPrimitives(
      started.events,
      rules.apply('pair', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(p1Paired.state.zones[handZoneId('p1')]?.cardIds).toHaveLength(0);
    expect(p1Paired.state.phase).toBe('playing');
    expect(p1Paired.state.currentPlayerId).toBe('p2');

    const p2Paired = appendPrimitives(
      p1Paired.events,
      rules.apply('pair', p1Paired.state, 'p2') ?? [],
      'p2',
      p1Paired.nextSeq,
    );
    expect(p2Paired.state.phase).toBe('ended');
    expect(p2Paired.state.winnerId).toBe('p2');
  });

  it('declares the draw target as winner when the draw empties their hand', () => {
    // Two players. p1 holds 8 pairs plus [H-9, JK-RED]; p2 holds 8 pairs plus
    // [H-10]. p1 pairs (2 left), p2 pairs (1 left), then p1 draws p2's last
    // card — the draw empties p2, so p2 wins (the target of the emptying
    // draw), not the drawer.
    const p1Cards = ['H-A', 'D-A', 'H-2', 'D-2', 'H-3', 'D-3', 'H-4', 'D-4', 'H-5', 'D-5', 'H-6', 'D-6', 'H-7', 'D-7', 'H-8', 'D-8', 'H-9', 'JK-RED'];
    const p2Cards = ['S-A', 'C-A', 'S-2', 'C-2', 'S-3', 'C-3', 'S-4', 'C-4', 'S-5', 'C-5', 'S-6', 'C-6', 'S-7', 'C-7', 'S-8', 'C-8', 'H-10'];
    const order: string[] = [];
    for (let i = 0; i < 17; i += 1) order.push(p1Cards[i]!, p2Cards[i]!);
    order.push(p1Cards[17]!);

    const started = startSession(oldMaidPreset, oldMaidConfig, order);
    const rules = getGameRules('old-maid');

    const p1Paired = appendPrimitives(
      started.events,
      rules.apply('pair', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(p1Paired.state.zones[handZoneId('p1')]?.cardIds).toEqual(['H-9', 'JK-RED']);
    expect(p1Paired.state.currentPlayerId).toBe('p2');

    const p2Paired = appendPrimitives(
      p1Paired.events,
      rules.apply('pair', p1Paired.state, 'p2') ?? [],
      'p2',
      p1Paired.nextSeq,
    );
    expect(p2Paired.state.zones[handZoneId('p2')]?.cardIds).toEqual(['H-10']);
    expect(p2Paired.state.currentPlayerId).toBe('p1');

    const p1Drew = appendPrimitives(
      p2Paired.events,
      rules.apply('draw', p2Paired.state, 'p1') ?? [],
      'p1',
      p2Paired.nextSeq,
    );
    expect(p1Drew.state.zones[handZoneId('p2')]?.cardIds).toHaveLength(0);
    expect(p1Drew.state.phase).toBe('ended');
    expect(p1Drew.state.winnerId).toBe('p2');
  });

  it('ends with the other player winning when the current player holds the maid', () => {
    // p1 holds only the maid joker; p2 is empty. The FINISH action must end
    // the round with p2 as winner (p1 is stuck with the maid).
    const pairs: string[] = [];
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
      pairs.push(`H-${rank}`, `S-${rank}`, `D-${rank}`, `C-${rank}`);
    }
    const order = [...pairs, 'JK-RED'];
    const started = startSession(oldMaidPreset, oldMaidConfig, order);
    const rules = getGameRules('old-maid');

    const p1Paired = appendPrimitives(
      started.events,
      rules.apply('pair', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(p1Paired.state.zones[handZoneId('p1')]?.cardIds).toEqual(['JK-RED']);
    const p2Paired = appendPrimitives(
      p1Paired.events,
      rules.apply('pair', p1Paired.state, 'p2') ?? [],
      'p2',
      p1Paired.nextSeq,
    );
    expect(p2Paired.state.zones[handZoneId('p2')]?.cardIds).toHaveLength(0);

    const finished = appendPrimitives(
      p2Paired.events,
      rules.apply('end', p2Paired.state, 'p1') ?? [],
      'p1',
      p2Paired.nextSeq,
    );
    expect(finished.state.phase).toBe('ended');
    expect(finished.state.winnerId).toBe('p2');
  });

  it('terminates: a full 2-player game with greedy play never deadlocks', () => {
    // Regression: the draw used to always take the target's LAST card. The
    // drawn card lands at the end of the drawer's hand, so in 2-player games
    // the same card bounced back and forth forever (observed live: C-J
    // oscillated between hands, hands never emptied). Deterministic picks
    // (last card, seeded index, composition hash) all cycle on some seeds —
    // the state space is finite, so a deterministic map repeats. The fix is a
    // random fan draw plus a maid-only endgame rule: a player holding only
    // the joker is stuck with the maid and the round ends (the 3-card
    // endgame — joker + one pair — otherwise bounces the joker forever).
    // Math.random is mocked with a seeded sequence for determinism.
    const seeds = ['test', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota'];
    for (const seed of seeds) {
      const deckOrder = buildDeck({ includeJokers: true })
        .filter((card) => card.id !== 'JK-BLACK')
        .map((card) => card.id);
      const rng = mulberry32(seed);
      shuffleInPlace(deckOrder, rng);
      const drawRng = mulberry32(`${seed}:draws`);
      const realRandom = Math.random;
      Math.random = () => drawRng();
      try {
        let { state, events, nextSeq } = startSession(oldMaidPreset, oldMaidConfig, deckOrder, players, seed);
        const rules = getGameRules('old-maid');
        let turns = 0;
        const maxTurns = 2000;
        while (state.phase === 'playing' && turns < maxTurns) {
          const current = state.currentPlayerId;
          const actions = rules.actions(state, current);
          const action = actions.find((a) => a.id === 'pair') ?? actions[0];
          if (!action) break;
          const applied = appendPrimitives(events, rules.apply(action.id, state, current) ?? [], current, nextSeq);
          state = applied.state;
          events = applied.events;
          nextSeq = applied.nextSeq;
          turns += 1;
        }
        expect(state.phase).toBe('ended');
        expect(turns).toBeLessThan(maxTurns);
        expect(state.winnerId).toBeDefined();
      } finally {
        Math.random = realRandom;
      }
    }
  });
});

describe('Crazy Eights and Sevens recipe and rules', () => {
  it('plays matching cards to the Crazy Eights discard', () => {
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, orderedWithPrefix(['H-A', 'H-2', 'H-3', 'H-4']));
    const rules = getGameRules('crazy-eights');

    expect(rules.actions(started.state, 'p1').map((action) => action.id)).toContain('play:H-A');
    const first = appendPrimitives(
      started.events,
      rules.apply('play:H-A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(first.state.currentPlayerId).toBe('p2');
    expect(first.state.zones.discard?.cardIds).toEqual(['H-A']);

    const second = appendPrimitives(
      first.events,
      rules.apply('play:H-2', first.state, 'p2') ?? [],
      'p2',
      first.nextSeq,
    );
    expect(second.state.zones.discard?.cardIds).toEqual(['H-A', 'H-2']);
    expect(second.state.zones[handZoneId('p1')]?.cardIds).toHaveLength(4);
  });

  it('keeps the turn when the drawn card fits and offers the new play', () => {
    // Alternating deal: p1 gets 5 hearts, p2 gets 5 spades (no eights — an
    // eight is wild and would always be playable). p1 opens with H-A; p2
    // cannot match, so the rail offers DRAW; the drawn H-K matches hearts,
    // so the turn stays with p2 and the new card becomes playable.
    const deckOrder = orderedWithPrefix(['H-A', 'S-9', 'H-2', 'S-10', 'H-3', 'S-J', 'H-4', 'S-Q', 'H-5', 'S-K', 'H-K']);
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, deckOrder);
    const rules = getGameRules('crazy-eights');

    const p1Played = appendPrimitives(
      started.events,
      rules.apply('play:H-A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(p1Played.state.currentPlayerId).toBe('p2');
    expect(rules.actions(p1Played.state, 'p2').map((action) => action.id)).toEqual(['draw']);

    const p2Drew = appendPrimitives(
      p1Played.events,
      rules.apply('draw', p1Played.state, 'p2') ?? [],
      'p2',
      p1Played.nextSeq,
    );
    expect(p2Drew.state.zones[handZoneId('p2')]?.cardIds).toContain('H-K');
    expect(p2Drew.state.currentPlayerId).toBe('p2');
    expect(rules.actions(p2Drew.state, 'p2').map((action) => action.id)).toContain('play:H-K');
  });

  it('passes the turn when the drawn card does not fit', () => {
    // Same alternating deal; p2 draws D-2 which matches neither the H-A top
    // nor any rank, so the turn passes back to p1.
    const deckOrder = orderedWithPrefix(['H-A', 'S-9', 'H-2', 'S-10', 'H-3', 'S-J', 'H-4', 'S-Q', 'H-5', 'S-K', 'D-2']);
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, deckOrder);
    const rules = getGameRules('crazy-eights');

    const p1Played = appendPrimitives(
      started.events,
      rules.apply('play:H-A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    const p2Drew = appendPrimitives(
      p1Played.events,
      rules.apply('draw', p1Played.state, 'p2') ?? [],
      'p2',
      p1Played.nextSeq,
    );
    expect(p2Drew.state.zones[handZoneId('p2')]?.cardIds).toContain('D-2');
    expect(p2Drew.state.currentPlayerId).toBe('p1');
  });

  it('ends with the player who plays their last card winning', () => {
    // Alternating deal; p2 can never match hearts (no eights — wild), so
    // every p2 turn is a miss-draw that passes back. p1 plays down to the
    // final heart and the last-card play must end the round with p1 as
    // winner.
    const deckOrder = ['H-A', 'S-9', 'H-2', 'S-10', 'H-3', 'S-J', 'H-4', 'S-Q', 'H-5', 'S-K', 'D-2', 'D-3', 'D-4', 'D-5'];
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, deckOrder);
    const rules = getGameRules('crazy-eights');

    let { state, events, nextSeq } = started;
    const hearts = ['H-A', 'H-2', 'H-3', 'H-4', 'H-5'];
    const misses = ['D-2', 'D-3', 'D-4', 'D-5'];
    for (let index = 0; index < hearts.length; index += 1) {
      const applied = appendPrimitives(events, rules.apply(`play:${hearts[index]}`, state, 'p1') ?? [], 'p1', nextSeq);
      state = applied.state;
      events = applied.events;
      nextSeq = applied.nextSeq;
      if (index < hearts.length - 1) {
        // p2 cannot match; draws a diamond that does not fit and passes back.
        const p2Turn = appendPrimitives(events, rules.apply('draw', state, 'p2') ?? [], 'p2', nextSeq);
        state = p2Turn.state;
        events = p2Turn.events;
        nextSeq = p2Turn.nextSeq;
        expect(state.zones[handZoneId('p2')]?.cardIds).toContain(misses[index]);
        expect(state.currentPlayerId).toBe('p1');
      }
    }
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p1');
  });

  it('crowns the fewest-cards player when the deck empties, not the stuck current player', () => {
    // Regression: FINISH used to end with winnerId = the CURRENT player even
    // though they were stuck with 7 cards while p1 held 2. Classic Crazy
    // Eights ends with the fewest-cards player winning.
    // Alternating deal: p1 five hearts, p2 five spades (no eights — wild),
    // draw D-2 + D-4. p2's drawn cards never match the hearts p1 keeps
    // playing, so when the pile empties p2 (7 cards) must lose to p1 (2
    // cards).
    const deckOrder = ['H-A', 'S-9', 'H-2', 'S-10', 'H-3', 'S-J', 'H-4', 'S-Q', 'H-5', 'S-K', 'D-2', 'D-4'];
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, deckOrder);
    const rules = getGameRules('crazy-eights');
    expect(started.state.zones['draw']?.cardIds).toEqual(['D-2', 'D-4']);

    // p1 opens with H-A; p2 draws D-2 (miss) -> p1; p1 plays H-2; p2 draws
    // D-4 (miss) -> p1; p1 plays H-3. Draw pile is now empty and p2 is stuck.
    let { state, events, nextSeq } = started;
    const plays: [GameAction, string, string][] = [
      ['play:H-A', 'p1', 'p2'],
      ['draw', 'p2', 'p1'],
      ['play:H-2', 'p1', 'p2'],
      ['draw', 'p2', 'p1'],
      ['play:H-3', 'p1', 'p2'],
    ];
    for (const [action, actor, nextPlayer] of plays) {
      const applied = appendPrimitives(events, rules.apply(action, state, actor) ?? [], actor, nextSeq);
      state = applied.state;
      events = applied.events;
      nextSeq = applied.nextSeq;
      expect(state.currentPlayerId).toBe(nextPlayer);
    }
    expect(state.zones['draw']?.cardIds).toHaveLength(0);
    expect(state.zones[handZoneId('p1')]?.cardIds).toHaveLength(2);
    expect(state.zones[handZoneId('p2')]?.cardIds).toHaveLength(7);
    expect(rules.actions(state, 'p2').map((action) => action.id)).toEqual(['end']);

    const finished = appendPrimitives(events, rules.apply('end', state, 'p2') ?? [], 'p2', nextSeq);
    expect(finished.state.phase).toBe('ended');
    expect(finished.state.winnerId).toBe('p1');
  });

  it('terminates: a full 2-player Crazy Eights game with greedy play never deadlocks', () => {
    // Greedy policy: play the first matching card, else draw from the pile,
    // else FINISH. Every play shrinks a hand and every draw shrinks the
    // pile, so the game must end with a defined winner on every seed.
    const seeds = ['test', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota'];
    for (const seed of seeds) {
      const deckOrder = buildDeck({ includeJokers: false }).map((card) => card.id);
      const rng = mulberry32(seed);
      shuffleInPlace(deckOrder, rng);
      const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
      let { state, events, nextSeq } = startSession(crazyEightsPreset, config, deckOrder, players, seed);
      const rules = getGameRules('crazy-eights');
      let turns = 0;
      const maxTurns = 1000;
      while (state.phase === 'playing' && turns < maxTurns) {
        const current = state.currentPlayerId;
        const actions = rules.actions(state, current);
        const action = actions.find((a) => a.id.startsWith('play:')) ?? actions.find((a) => a.id === 'draw') ?? actions[0];
        if (!action) break;
        const applied = appendPrimitives(events, rules.apply(action.id, state, current) ?? [], current, nextSeq);
        state = applied.state;
        events = applied.events;
        nextSeq = applied.nextSeq;
        turns += 1;
      }
      expect(state.phase).toBe('ended');
      expect(turns).toBeLessThan(maxTurns);
      expect(state.winnerId).toBeDefined();
    }
  });

  it('surfaces the draw count in the Crazy Eights readout', () => {
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, orderedWithPrefix(['H-A', 'H-2']));
    const rules = getGameRules('crazy-eights');
    const readout = rules.readout?.(started.state, 'p1');
    expect(readout).toContain('HAND 5');
    expect(readout).toContain('DRAW 42');
  });

  it('opens Sevens with a seven and grows the same-suit run', () => {
    const config: SessionConfig = { ...goFishConfig, presetId: 'sevens' };
    const started = startSession(sevensPreset, config, orderedWithPrefix(['H-7', 'H-8', 'S-7', 'C-7']));
    const rules = getGameRules('sevens');

    expect(rules.actions(started.state, 'p1').map((action) => action.id)).toContain('play:H-7');
    const first = appendPrimitives(
      started.events,
      rules.apply('play:H-7', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(first.state.currentPlayerId).toBe('p2');
    expect(rules.actions(first.state, 'p2').map((action) => action.id)).toContain('play:H-8');

    const second = appendPrimitives(
      first.events,
      rules.apply('play:H-8', first.state, 'p2') ?? [],
      'p2',
      first.nextSeq,
    );
    expect(second.state.zones['communal:0']?.cardIds).toEqual(['H-7', 'H-8']);
    expect(second.state.currentPlayerId).toBe('p1');
  });
});
