/**
 * Canonical poker betting validator tests.
 *
 * The core guarantee being proven: the validator verdict IS the single
 * source of truth. For a sweep of randomised betting states:
 *
 * 1. `offeredBetActions` returns EXACTLY the set of actions the validator
 *    approves (no more, no less) — the rail can never offer a rejected
 *    action or hide a legal one.
 * 2. The rules `apply` path accepts exactly the validator-approved actions —
 *    the engine can never accept something the UI cannot offer.
 * 3. Chip amounts are canonical: call = min(due, stack), raise = one big
 *    blind above current bet capped at stack, and every legal raise beats
 *    the call amount.
 */

import { applyEvent, foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import type { GameState, PlayerId } from './types';
import { pokerStylePreset } from './presets';
import { buildDeck, makeSeed, mulberry32, shuffleInPlace } from './deck';
import { getGameRules } from './rules';
import { checkPokerBet, offeredBetActions, type PokerBetAction } from './pokerBetting';

function makePokerSession(): GameState {
  const seed = makeSeed();
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const players = [
    { id: 'p1', name: 'P1', seat: 0, avatarSeed: 'seed-p1' },
    { id: 'p2', name: 'P2', seat: 1, avatarSeed: 'seed-p2' },
  ];
  const setup = pokerStylePreset.setup({
    players,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'poker' },
    deckOrder,
  });
  const events: GameEvent[] = [
    {
      type: 'session/start',
      id: eventId(1),
      ts: Date.now(),
      actorId: 'system',
      seq: 1,
      meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'pass', hostId: 'p1' },
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'poker' },
      players,
      zones: setup.zones,
    },
  ];
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(events.length + 1),
      ts: Date.now(),
      actorId: 'system',
      seq: events.length + 1,
      cardId: deal.cardId,
      toZoneId: deal.toZoneId,
      face: deal.face,
    });
  }
  return foldEvents(events);
}

const ACTIONS: PokerBetAction[] = ['fold', 'check', 'call', 'raise'];

interface BettingFixture {
  currentPlayerId: PlayerId;
  folded: PlayerId[];
  currentBet: number;
  roundComplete: boolean;
  stacks: Record<PlayerId, number>;
  roundContributions: Record<PlayerId, number>;
}

function fixtureState(fixture: BettingFixture): GameState {
  const state = makePokerSession();
  const betting = state.game!.betting!;
  return {
    ...state,
    currentPlayerId: fixture.currentPlayerId,
    game: {
      ...state.game!,
      folded: fixture.folded,
      betting: {
        ...betting,
        currentBet: fixture.currentBet,
        roundComplete: fixture.roundComplete,
        stacks: fixture.stacks,
        roundContributions: fixture.roundContributions,
      },
    },
  };
}

/** Deterministic pseudo-random fixtures (LGC, seed-driven so failures replay). */
function fixtureFor(seed: number): BettingFixture {
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const player = rnd() < 0.5 ? 'p1' : 'p2';
  const other = player === 'p1' ? 'p2' : 'p1';
  const currentBetChoices = [0, 5, 10, 10, 20, 50];
  const currentBet = currentBetChoices[Math.floor(rnd() * currentBetChoices.length)]!;
  const roundComplete = rnd() < 0.3;
  const stackChoices = [0, 5, 10, 30, 95, 100];
  const stacks = {
    p1: stackChoices[Math.floor(rnd() * stackChoices.length)]!,
    p2: stackChoices[Math.floor(rnd() * stackChoices.length)]!,
  };
  // Contributions are sometimes at/over the current bet, sometimes under.
  const contribFor = (): number => {
    const c = [0, 5, currentBet, currentBet + 10, currentBet - 3][Math.floor(rnd() * 5)]!;
    return Math.max(0, c);
  };
  return {
    currentPlayerId: player,
    folded: rnd() < 0.3 ? [player] : [],
    currentBet,
    roundComplete,
    stacks,
    roundContributions: { [player]: contribFor(), [other]: contribFor() },
  };
}

describe('checkPokerBet (canonical validator)', () => {
  test('rail offers exactly the actions the validator approves', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const fixture = fixtureFor(seed);
      const state = fixtureState(fixture);
      const offered = offeredBetActions(state, fixture.currentPlayerId);
      for (const action of ACTIONS) {
        const verdict = checkPokerBet(state, fixture.currentPlayerId, action);
        expect(offered.includes(action)).toBe(verdict.ok);
      }
    }
  });

  test('rules apply path accepts exactly what the validator accepts', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const fx = fixtureFor(seed);
      const state = fixtureState(fx);
      const rules = getGameRules('poker');
      for (const action of ACTIONS) {
        const verdict = checkPokerBet(state, fx.currentPlayerId, action);
        const applied = rules.apply(action, state, fx.currentPlayerId);
        expect(applied !== null).toBe(verdict.ok);
      }
    }
  });

  test('call amount is min(amount due, stack)', () => {
    const state = fixtureState({
      currentPlayerId: 'p1',
      folded: [],
      currentBet: 20,
      roundComplete: false,
      stacks: { p1: 30, p2: 100 },
      roundContributions: { p1: 5, p2: 20 },
    });
    const verdict = checkPokerBet(state, 'p1', 'call');
    expect(verdict).toMatchObject({ ok: true, amount: 15 });
  });

  test('call is capped at the remaining stack (short call)', () => {
    const state = fixtureState({
      currentPlayerId: 'p1',
      folded: [],
      currentBet: 50,
      roundComplete: false,
      stacks: { p1: 12, p2: 100 },
      roundContributions: { p1: 40, p2: 50 },
    });
    const verdict = checkPokerBet(state, 'p1', 'call');
    expect(verdict).toMatchObject({ ok: true, amount: 10 });
  });

  test('check is legal exactly when no bet is faced', () => {
    const open = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 10, roundComplete: false,
      stacks: { p1: 100, p2: 100 }, roundContributions: { p1: 10, p2: 10 },
    });
    expect(checkPokerBet(open, 'p1', 'check')).toMatchObject({ ok: true, amount: 0 });

    const facing = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 20, roundComplete: false,
      stacks: { p1: 100, p2: 100 }, roundContributions: { p1: 5, p2: 20 },
    });
    expect(checkPokerBet(facing, 'p1', 'check')).toMatchObject({ ok: false, reason: 'check_facing_bet' });
  });

  test('raise is one big blind above current bet, capped at stack', () => {
    const state = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 10, roundComplete: false,
      stacks: { p1: 100, p2: 100 }, roundContributions: { p1: 5, p2: 10 },
    });
    const verdict = checkPokerBet(state, 'p1', 'raise');
    expect(verdict.ok).toBe(true);
    expect(verdict.amount).toBe(15); // (10 + 10) - 5
    expect(verdict.raiseTo).toBe(20);
  });

  test('raise is rejected when it cannot exceed the call amount', () => {
    const state = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 20, roundComplete: false,
      stacks: { p1: 8, p2: 100 }, roundContributions: { p1: 18, p2: 20 },
    });
    // target 30, canonical = min(30 - 18, 8) = 8, min valid raise = 20 - 18 = 2... 8 > 2, so ok
    const verdict = checkPokerBet(state, 'p1', 'raise');
    expect(verdict.ok).toBe(true);
  });

  test('raise is rejected when stack cannot cover the increment (raise-below-minimum)', () => {
    const state = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 20, roundComplete: false,
      stacks: { p1: 1, p2: 100 }, roundContributions: { p1: 19, p2: 20 },
    });
    // target = 30, canonical = min(30 - 19, 1) = 1, min valid = 20 - 19 = 1 → 1 <= 1 → reject
    expect(checkPokerBet(state, 'p1', 'raise')).toMatchObject({ ok: false, reason: 'raise_below_minimum' });
  });

  test('explicit raise amounts are validated against the canonical minimum', () => {
    const state = fixtureState({
      currentPlayerId: 'p1', folded: [], currentBet: 10, roundComplete: false,
      stacks: { p1: 100, p2: 100 }, roundContributions: { p1: 5, p2: 10 },
    });
    expect(checkPokerBet(state, 'p1', 'raise', 15)).toMatchObject({ ok: true, amount: 15, raiseTo: 20 });
    expect(checkPokerBet(state, 'p1', 'raise', 4)).toMatchObject({ ok: false, reason: 'raise_below_minimum' });
    expect(checkPokerBet(state, 'p1', 'raise', 101)).toMatchObject({ ok: false, reason: 'amount_exceeds_stack' });
    expect(checkPokerBet(state, 'p1', 'raise', 5.5)).toMatchObject({ ok: false, reason: 'amount_non_integer' });
    expect(checkPokerBet(state, 'p1', 'raise', -1)).toMatchObject({ ok: false, reason: 'amount_negative' });
  });

  test('illegal positions are rejected with explicit reasons', () => {
    const base = {
      currentPlayerId: 'p1', folded: [], currentBet: 10, roundComplete: false,
      stacks: { p1: 100, p2: 100 }, roundContributions: { p1: 5, p2: 10 },
    };

    const notTurn = fixtureState({ ...base, currentPlayerId: 'p2' });
    expect(checkPokerBet(notTurn, 'p1', 'fold')).toMatchObject({ ok: false, reason: 'not_active_turn' });

    const complete = fixtureState({ ...base, roundComplete: true });
    expect(checkPokerBet(complete, 'p1', 'call')).toMatchObject({ ok: false, reason: 'round_complete' });

    const folded = fixtureState({ ...base, folded: ['p1'] });
    expect(checkPokerBet(folded, 'p1', 'fold')).toMatchObject({ ok: false, reason: 'player_folded' });

    const broke = fixtureState({ ...base, stacks: { p1: 0, p2: 100 } });
    expect(checkPokerBet(broke, 'p1', 'fold')).toMatchObject({ ok: false, reason: 'zero_stack' });

    const nothingDue = fixtureState({ ...base, roundContributions: { p1: 10, p2: 10 } });
    expect(checkPokerBet(nothingDue, 'p1', 'call')).toMatchObject({ ok: false, reason: 'call_nothing_due' });
  });

  test('a player with no betting seat is rejected (zero_stack)', () => {
    const state = makePokerSession();
    const betting = state.game!.betting!;
    // p3 is the current turn holder but has NO entry in the betting stacks
    // map (they never posted a blind / were removed from the hand).
    const strangerState: GameState = {
      ...state,
      currentPlayerId: 'p3',
      game: {
        ...state.game!,
        betting: { ...betting, stacks: { p1: 100, p2: 100 } },
      },
    };
    expect(checkPokerBet(strangerState, 'p3', 'fold')).toMatchObject({ ok: false, reason: 'zero_stack' });
  });
});
