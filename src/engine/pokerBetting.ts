/**
 * Canonical Hold'em betting validation.
 *
 * Single source of truth for what a bet action MAY do at any moment. Both
 * the action rail (what buttons we offer) and the rules apply path (what
 * events we emit) must agree with this module, so a UI bug can never show
 * an action the engine rejects, and the engine can never accept something
 * the UI cannot offer.
 *
 * Pure and framework-free: reads GameState, returns a verdict + the
 * canonical chip amounts. Fully unit-testable without a socket or store.
 */

import type { GameState, PlayerId, PokerBettingState } from './types';

export type PokerBetAction = 'fold' | 'check' | 'call' | 'raise';

export type PokerBetReject =
  | 'not_active_turn'
  | 'round_complete'
  | 'player_folded'
  | 'zero_stack'
  | 'check_facing_bet'
  | 'call_nothing_due'
  | 'raise_below_minimum'
  | 'amount_exceeds_stack'
  | 'amount_non_integer'
  | 'amount_negative';

export interface PokerBetCheck {
  ok: boolean;
  reason?: PokerBetReject;
  /** Canonical chips this action moves (0 for check/fold). */
  amount: number;
  /** For a raise: the total the player's round contribution becomes. */
  raiseTo?: number;
}

function bettingOf(state: GameState): PokerBettingState | null {
  return state.game?.betting ?? null;
}

function roundContribution(betting: PokerBettingState, playerId: PlayerId): number {
  return betting.roundContributions[playerId] ?? 0;
}

function stackOf(betting: PokerBettingState, playerId: PlayerId): number {
  return betting.stacks[playerId] ?? 0;
}

/**
 * Verdict for a bet action from `viewerId`'s perspective right now.
 *
 * `requestedAmount` is optional and used by programmatic paths; the UI rail
 * calls without it and gets the canonical one-tap amount.
 */
export function checkPokerBet(
  state: GameState,
  viewerId: PlayerId,
  action: PokerBetAction,
  requestedAmount?: number,
): PokerBetCheck {
  const betting = bettingOf(state);
  if (state.phase !== 'playing' || !betting) {
    return { ok: false, reason: 'round_complete', amount: 0 };
  }
  if (betting.roundComplete) {
    return { ok: false, reason: 'round_complete', amount: 0 };
  }
  if (state.currentPlayerId !== viewerId) {
    return { ok: false, reason: 'not_active_turn', amount: 0 };
  }
  if ((state.game?.folded ?? []).includes(viewerId)) {
    return { ok: false, reason: 'player_folded', amount: 0 };
  }
  const stack = stackOf(betting, viewerId);
  if (stack <= 0) {
    return { ok: false, reason: 'zero_stack', amount: 0 };
  }

  const contributed = roundContribution(betting, viewerId);

  if (action === 'fold') {
    return { ok: true, amount: 0 };
  }
  if (action === 'check') {
    if (contributed !== betting.currentBet) {
      return { ok: false, reason: 'check_facing_bet', amount: 0 };
    }
    return { ok: true, amount: 0 };
  }
  if (action === 'call') {
    const due = betting.currentBet - contributed;
    if (due <= 0) {
      return { ok: false, reason: 'call_nothing_due', amount: 0 };
    }
    const amount = Math.min(due, stack);
    if (amount < 0) return { ok: false, reason: 'amount_negative', amount: 0 };
    return { ok: true, amount };
  }

  // Raise: one big blind above the current bet, capped at the remaining
  // stack (all-in). A raise that cannot exceed the call amount is a
  // raise-below-minimum and must not be offered.
  const target = Math.max(betting.currentBet + betting.bigBlind, betting.bigBlind);
  const canonical = Math.min(target - contributed, stack);
  const minimumValid = betting.currentBet - contributed;
  if (canonical <= minimumValid) {
    return { ok: false, reason: 'raise_below_minimum', amount: 0 };
  }

  if (requestedAmount !== undefined) {
    if (!Number.isInteger(requestedAmount)) {
      return { ok: false, reason: 'amount_non_integer', amount: 0 };
    }
    if (requestedAmount < 0) {
      return { ok: false, reason: 'amount_negative', amount: 0 };
    }
    if (requestedAmount > stack) {
      return { ok: false, reason: 'amount_exceeds_stack', amount: 0 };
    }
    if (requestedAmount <= minimumValid) {
      return { ok: false, reason: 'raise_below_minimum', amount: 0 };
    }
    return { ok: true, amount: requestedAmount, raiseTo: contributed + requestedAmount };
  }

  return { ok: true, amount: canonical, raiseTo: contributed + canonical };
}

/**
 * The three bet actions currently legal for `viewerId`, in rail order.
 * Fold is always legal when a bet round is open and the player can act.
 */
export function offeredBetActions(state: GameState, viewerId: PlayerId): PokerBetAction[] {
  const actions: PokerBetAction[] = [];
  const fold = checkPokerBet(state, viewerId, 'fold');
  if (fold.ok) actions.push('fold');
  const check = checkPokerBet(state, viewerId, 'check');
  if (check.ok) actions.push('check');
  const call = checkPokerBet(state, viewerId, 'call');
  if (call.ok) actions.push('call');
  const raise = checkPokerBet(state, viewerId, 'raise');
  if (raise.ok) actions.push('raise');
  return actions;
}
