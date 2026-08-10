import type { GameState, PlayerId, ZoneId } from './types';
import type { Suit } from '@lib/types';
import { ZONE_MUCK, communalZoneId, handZoneId } from './types';
import { parseCardId } from './selectors';

/**
 * Per-game rule systems.
 *
 * The core engine stays generic (zones, cards, turns). Each preset plugs in a
 * rules object that maps game-specific actions (twist, stick, burn, flop,
 * fold, raise...) onto those primitives, and exposes the action set the
 * table surface should render. Rules are pure: they read state and return
 * primitive events; the store dispatches them.
 */

export type GameAction =
  | 'draw'
  | 'flip'
  | 'discard'
  | 'reorder'
  | 'pass'
  | 'shuffle'
  | 'end'
  | 'twist'
  | 'stick'
  | 'stand'
  | 'burn'
  | 'flop'
  | 'turn'
  | 'river'
  | 'fold'
  | 'check'
  | 'call'
  | 'raise'
  | 'reveal';

export interface GameActionSpec {
  id: GameAction;
  label: string;
  hint: string;
  kind: 'table' | 'hand' | 'host' | 'bet';
}

export interface PrimitiveEvent {
  type: 'card/deal' | 'card/move' | 'card/flip' | 'card/reveal' | 'turn/end' | 'session/end' | 'game/street' | 'game/fold';
  cardId?: string;
  toZoneId?: ZoneId;
  face?: 'up' | 'down';
  playerId?: PlayerId;
  winnerId?: PlayerId;
  street?: number;
}

export interface GameRules {
  id: string;
  /** Actions available to `viewerId` right now, in display order. */
  actions: (state: GameState, viewerId: PlayerId) => GameActionSpec[];
  /** Translate a game action into primitive events. Returns null when illegal. */
  apply: (action: GameAction, state: GameState, viewerId: PlayerId) => PrimitiveEvent[] | null;
  /** Optional per-player numeric readout (blackjack hand value). */
  readout?: (state: GameState, playerId: PlayerId) => string | null;
}

// ---------------------------------------------------------------------------
// Card values
// ---------------------------------------------------------------------------

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 10, Q: 10, K: 10,
};

/** Blackjack hand value. Aces count 11, demoted to 1 while over 21. */
export function handValue(state: GameState, playerId: PlayerId): number {
  const hand = state.zones[handZoneId(playerId)]?.cardIds ?? [];
  let total = 0;
  let aces = 0;
  for (const cid of hand) {
    const parsed = parseCardId(cid);
    if (!parsed) continue;
    if (parsed.rank === 'A') {
      aces += 1;
      total += 11;
    } else {
      total += RANK_VALUE[parsed.rank] ?? 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isBust(value: number): boolean {
  return value > 21;
}

// ---------------------------------------------------------------------------
// Blackjack
// ---------------------------------------------------------------------------

const BLACKJACK_ACTIONS: GameActionSpec[] = [
  { id: 'twist', label: 'TWIST', hint: 'Take another card', kind: 'table' },
  { id: 'stick', label: 'STICK', hint: 'Keep your hand, end your turn', kind: 'table' },
  { id: 'stand', label: 'STAND', hint: 'Keep your hand, end your turn', kind: 'table' },
];

function blackjackActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  if (state.currentPlayerId !== viewerId) return [];
  const dealer = state.players[state.players.length - 1];
  if (dealer && dealer.id === viewerId) return []; // dealer plays automatically
  const drawEmpty = (state.zones['draw']?.cardIds.length ?? 0) === 0;
  if (drawEmpty) {
    // No cards left to take; only STICK remains.
    return [BLACKJACK_ACTIONS[1]!];
  }
  return BLACKJACK_ACTIONS;
}

function blackjackApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  const dealer = state.players[state.players.length - 1];
  if (dealer && dealer.id === viewerId) return null;

  switch (action) {
    case 'twist': {
      const draw = state.zones['draw'];
      if (!draw || draw.cardIds.length === 0) return null;
      const top = draw.cardIds[0]!;
      const events: PrimitiveEvent[] = [
        { type: 'card/deal', cardId: top, toZoneId: handZoneId(viewerId), face: 'up' },
      ];
      // Bust or 21: end the turn automatically.
      const nextValue = handValue(
        { ...state, zones: { ...state.zones, [handZoneId(viewerId)]: { ...state.zones[handZoneId(viewerId)]!, cardIds: [...state.zones[handZoneId(viewerId)]!.cardIds, top] } } },
        viewerId,
      );
      if (nextValue >= 21) {
        events.push({ type: 'turn/end', playerId: viewerId });
      }
      return events;
    }
    case 'stick':
    case 'stand':
      return [{ type: 'turn/end', playerId: viewerId }];
    default:
      return null;
  }
}

function blackjackReadout(state: GameState, playerId: PlayerId): string | null {
  const hand = state.zones[handZoneId(playerId)]?.cardIds ?? [];
  if (hand.length === 0) return null;
  const value = handValue(state, playerId);
  return isBust(value) ? `HAND ${value} · BUST` : `HAND ${value}`;
}

/** Dealer plays to 17 after every player has stuck. Returns events. */
export function blackjackDealerPlay(state: GameState): PrimitiveEvent[] {
  const dealer = state.players[state.players.length - 1];
  if (!dealer) return [];
  const events: PrimitiveEvent[] = [];
  const dealerHand = state.zones[handZoneId(dealer.id)]?.cardIds ?? [];
  // Reveal the hole card (first face-down card in the dealer hand).
  for (const cid of dealerHand) {
    const card = state.cards[cid];
    if (card && card.face === 'down') {
      events.push({ type: 'card/reveal', cardId: cid });
    }
  }
  // Draw to 17. State is immutable here, so track how many cards we have
  // already drawn and index into the pile (re-reading cardIds[0] would deal
  // the same card every iteration).
  let value = handValue(state, dealer.id);
  const draw = state.zones['draw'];
  let drawn = 0;
  while (value < 17 && draw && draw.cardIds.length > drawn) {
    const cid = draw.cardIds[drawn]!;
    drawn += 1;
    events.push({ type: 'card/deal', cardId: cid, toZoneId: handZoneId(dealer.id), face: 'up' });
    // Recompute with the drawn cards appended.
    const nextHand = [...dealerHand, ...events.filter((e) => e.type === 'card/deal').map((e) => e.cardId!)];
    value = handValue(
      { ...state, zones: { ...state.zones, [handZoneId(dealer.id)]: { ...state.zones[handZoneId(dealer.id)]!, cardIds: nextHand } } },
      dealer.id,
    );
  }
  // Winner: best non-bust hand among non-dealer players; dealer wins ties.
  const dealerValue = value;
  let best: PlayerId | null = null;
  let bestValue = 0;
  for (const player of state.players) {
    if (player.id === dealer.id) continue;
    const v = handValue(state, player.id);
    if (isBust(v)) continue;
    if (v > bestValue) {
      bestValue = v;
      best = player.id;
    }
  }
  if (isBust(dealerValue)) {
    // Dealer busts: every non-bust player wins; nobody left → dealer takes it.
    events.push({ type: 'session/end', winnerId: best ?? dealer.id });
  } else if (best && bestValue > dealerValue) {
    events.push({ type: 'session/end', winnerId: best });
  } else if (best && bestValue === dealerValue) {
    events.push({ type: 'session/end' });
  } else {
    events.push({ type: 'session/end', winnerId: dealer.id });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Poker
// ---------------------------------------------------------------------------

const POKER_RANK_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14,
};

const POKER_HAND_LABELS = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush',
] as const;

export interface PokerHandScore {
  /** 0-9, higher is better. */
  category: number;
  /** Tiebreak values, most significant first. */
  tiebreak: number[];
  label: string;
}

/** Best 5-card hand from any set of cards (2 hole + 5 community = 7). */
export function evaluatePokerHand(cardIds: string[]): PokerHandScore {
  const cards: { rank: number; suit: Suit }[] = [];
  for (const cid of cardIds) {
    const parsed = parseCardId(cid);
    if (!parsed) continue;
    cards.push({ rank: POKER_RANK_ORDER[parsed.rank] ?? 0, suit: parsed.suit });
  }

  const best: PokerHandScore = { category: 0, tiebreak: [0, 0, 0, 0, 0], label: POKER_HAND_LABELS[0]! };

  const combos: number[][] = [];
  const n = cards.length;
  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      for (let c = b + 1; c < n; c += 1) {
        for (let d = c + 1; d < n; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            combos.push([a, b, c, d, e]);
          }
        }
      }
    }
  }

  for (const combo of combos) {
    const five = combo.map((i) => cards[i]!);
    const ranks = five.map((c) => c.rank).sort((x, y) => y - x);
    const suits = five.map((c) => c.suit);
    const isFlush = suits.every((s) => s === suits[0]);
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    const groups = [...rankCounts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
    const isStraight =
      ranks.length === 5 &&
      (ranks[0]! - ranks[4]! === 4 ||
        (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2));

    let category = 0;
    let tiebreak: number[] = ranks;
    if (isFlush && isStraight) {
      category = ranks[0] === 14 && ranks[1] === 13 ? 9 : 8;
      tiebreak = ranks[0] === 14 && ranks[1] === 5 ? [5] : ranks;
    } else if (groups[0]![1] === 4) {
      category = 7;
      tiebreak = [groups[0]![0], groups[1]![0]];
    } else if (groups[0]![1] === 3 && groups[1]![1] === 2) {
      category = 6;
      tiebreak = [groups[0]![0], groups[1]![0]];
    } else if (isFlush) {
      category = 5;
      tiebreak = ranks;
    } else if (isStraight) {
      category = 4;
      tiebreak = ranks[0] === 14 && ranks[1] === 5 ? [5] : ranks;
    } else if (groups[0]![1] === 3) {
      category = 3;
      tiebreak = [groups[0]![0], ...groups.slice(1).map((g) => g[0])];
    } else if (groups[0]![1] === 2 && groups[1]![1] === 2) {
      category = 2;
      tiebreak = [groups[0]![0], groups[1]![0], groups[2]![0]];
    } else if (groups[0]![1] === 2) {
      category = 1;
      tiebreak = [groups[0]![0], ...groups.slice(1).map((g) => g[0])];
    }

    if (category > best.category) {
      best.category = category;
      best.tiebreak = tiebreak;
      best.label = POKER_HAND_LABELS[category]!;
    }
  }
  return best;
}

/** Numeric element-wise tiebreak: [10,9] beats [9,11] as numbers, not strings. */
function beats(a: PokerHandScore, b: PokerHandScore): boolean {
  if (a.category !== b.category) return a.category > b.category;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

function pokerActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  const specs: GameActionSpec[] = [];
  const isHost = state.meta.hostId === viewerId;
  const isCurrent = state.currentPlayerId === viewerId;
  const street = (state.game?.street ?? 0) as number;
  const drawEmpty = (state.zones['draw']?.cardIds.length ?? 0) === 0;

  if (isHost) {
    if (street === 0 && !drawEmpty) specs.push({ id: 'burn', label: 'BURN', hint: 'Burn the top card', kind: 'host' });
    if (street === 0 && !drawEmpty) specs.push({ id: 'flop', label: 'FLOP', hint: 'Deal the flop (3 cards)', kind: 'host' });
    if (street === 1 && !drawEmpty) specs.push({ id: 'turn', label: 'TURN', hint: 'Deal the turn', kind: 'host' });
    if (street === 2 && !drawEmpty) specs.push({ id: 'river', label: 'RIVER', hint: 'Deal the river', kind: 'host' });
    if (street === 3) specs.push({ id: 'reveal', label: 'SHOWDOWN', hint: 'Reveal all hands', kind: 'host' });
  }
  if (isCurrent) {
    specs.push({ id: 'fold', label: 'FOLD', hint: 'Fold your hand', kind: 'bet' });
    specs.push({ id: 'check', label: 'CHECK', hint: 'Pass without betting', kind: 'bet' });
    specs.push({ id: 'call', label: 'CALL', hint: 'Match the current bet', kind: 'bet' });
    specs.push({ id: 'raise', label: 'RAISE', hint: 'Double the current bet', kind: 'bet' });
  }
  return specs;
}

function pokerApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing') return null;
  const isHost = state.meta.hostId === viewerId;
  const isCurrent = state.currentPlayerId === viewerId;
  const street = (state.game?.street ?? 0) as number;
  const draw = state.zones['draw'];
  const top = (): string | null => (draw && draw.cardIds.length > 0 ? draw.cardIds[0]! : null);

  switch (action) {
    case 'burn': {
      if (!isHost || street !== 0) return null;
      const cid = top();
      if (!cid) return null;
      return [{ type: 'card/move', cardId: cid, toZoneId: ZONE_MUCK, face: 'down' }];
    }
    case 'flop': {
      if (!isHost || street !== 0) return null;
      const events: PrimitiveEvent[] = [];
      for (let i = 0; i < 3; i += 1) {
        // Rules are pure: state never mutates, so index into the draw pile
        // instead of re-reading cardIds[0] (which would deal the same card
        // three times).
        const cid = draw && draw.cardIds[i] ? draw.cardIds[i]! : null;
        if (!cid) break;
        events.push({ type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' });
      }
      events.push({ type: 'game/street', street: 1 });
      return events;
    }
    case 'turn': {
      if (!isHost || street !== 1) return null;
      const cid = top();
      if (!cid) return null;
      return [
        { type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' },
        { type: 'game/street', street: 2 },
      ];
    }
    case 'river': {
      if (!isHost || street !== 2) return null;
      const cid = top();
      if (!cid) return null;
      return [
        { type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' },
        { type: 'game/street', street: 3 },
      ];
    }
    case 'reveal': {
      if (!isHost || street !== 3) return null;
      const events: PrimitiveEvent[] = [];
      for (const player of state.players) {
        for (const cid of state.zones[handZoneId(player.id)]?.cardIds ?? []) {
          const card = state.cards[cid];
          if (card && card.face === 'down') events.push({ type: 'card/reveal', cardId: cid });
        }
      }
      // Winner: best hand among non-folded players.
      const folded = (state.game?.folded ?? []) as string[];
      let bestPlayer: PlayerId | null = null;
      let bestScore: PokerHandScore | null = null;
      for (const player of state.players) {
        if (folded.includes(player.id)) continue;
        const hand = state.zones[handZoneId(player.id)]?.cardIds ?? [];
        const community = state.zones[communalZoneId(0)]?.cardIds ?? [];
        const score = evaluatePokerHand([...hand, ...community]);
        if (!bestScore || beats(score, bestScore)) {
          bestScore = score;
          bestPlayer = player.id;
        }
      }
      events.push({ type: 'session/end', winnerId: bestPlayer ?? undefined });
      return events;
    }
    case 'fold': {
      if (!isCurrent) return null;
      const events: PrimitiveEvent[] = [];
      for (const cid of state.zones[handZoneId(viewerId)]?.cardIds ?? []) {
        events.push({ type: 'card/move', cardId: cid, toZoneId: ZONE_MUCK, face: 'down' });
      }
      events.push({ type: 'game/fold', playerId: viewerId });
      events.push({ type: 'turn/end', playerId: viewerId });
      return events;
    }
    case 'check': {
      if (!isCurrent) return null;
      return [{ type: 'turn/end', playerId: viewerId }];
    }
    case 'call': {
      if (!isCurrent) return null;
      return [{ type: 'turn/end', playerId: viewerId }];
    }
    case 'raise': {
      if (!isCurrent) return null;
      return [{ type: 'turn/end', playerId: viewerId }];
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Freeplay / generic
// ---------------------------------------------------------------------------

/** Generic presets keep the existing table UI (draw pile, flip, PASS TURN). */
function noActions(): GameActionSpec[] {
  return [];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GAME_RULES: Record<string, GameRules> = {
  freeplay: {
    id: 'freeplay',
    actions: noActions,
    apply: () => null,
  },
  'deal-two-each': {
    id: 'deal-two-each',
    actions: noActions,
    apply: () => null,
  },
  blackjack: {
    id: 'blackjack',
    actions: blackjackActions,
    apply: blackjackApply,
    readout: blackjackReadout,
  },
  poker: {
    id: 'poker',
    actions: pokerActions,
    apply: pokerApply,
  },
};

export function getGameRules(presetId: string | null | undefined): GameRules {
  return GAME_RULES[presetId ?? 'freeplay'] ?? GAME_RULES.freeplay!;
}
