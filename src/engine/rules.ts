import type {
  CardInstance,
  GameState,
  Player,
  PlayerId,
  PokerBettingState,
  ZoneId,
} from './types';
import type { Suit } from '@lib/types';
import {
  KLONDIKE_FOUNDATION_SUITS,
  ZONE_DRAW,
  ZONE_DISCARD,
  ZONE_MUCK,
  communalZoneId,
  handZoneId,
  klondikeFoundationZoneId,
  tableZoneId,
} from './types';
import { parseCardId } from './selectors';
import {
  PYRAMID_STOCK,
  PYRAMID_WASTE,
  PYRAMID_ZONE,
  ZONE_WASTE,
  canMoveCardToFoundation,
  canMoveRunToFreeCellColumn,
  canMoveRunToTableau,
  foundationZoneId,
  freeCellZoneId,
  freeCellTableauZoneId,
  isFreeCellWon,
  isKing,
  isKlondikeWon,
  isPyramidCardFree,
  isPyramidWon,
  pyramidPairMatches,
  tableauRun,
  tableauZoneId,
} from './solitaire';

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
  | 'recycle'
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
  | 'reveal'
  | 'pair'
  | 'cycleStock'
  | 'restart'
  | 'autoFoundation'
  | `move:${string}`
  | `play:${string}`
  | `flip:${string}`
  | `move:${string}`
  | `ask:${string}:${string}`;

export interface GameActionSpec {
  id: GameAction;
  label: string;
  hint: string;
  kind: 'table' | 'hand' | 'host' | 'bet';
}

export interface PrimitiveEvent {
  type: 'card/deal' | 'card/move' | 'card/flip' | 'card/reveal' | 'card/ask' | 'turn/set' | 'turn/end' | 'session/end' | 'game/street' | 'game/burn' | 'game/bet' | 'game/fold';
  cardId?: string;
  toZoneId?: ZoneId;
  face?: 'up' | 'down';
  playerId?: PlayerId;
  winnerId?: PlayerId;
  street?: number;
  targetPlayerId?: PlayerId;
  rank?: string;
  found?: boolean;
  transferredCount?: number;
  action?: 'blind' | 'check' | 'call' | 'raise' | 'fold';
  amount?: number;
  roundComplete?: boolean;
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

// ---------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------

const WAR_RANK_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14,
};

function warRank(cardId: string): number {
  const parsed = parseCardId(cardId);
  if (parsed) return WAR_RANK_ORDER[parsed.rank] ?? 0;
  // Optional jokers are high cards for the one-table preview variant.
  return cardId === 'JK-RED' || cardId === 'JK-BLACK' ? 15 : 0;
}

function warRemainingCards(state: GameState, playerId: PlayerId): number {
  // `card/move` removes each played top card from its private pile before the
  // rules inspect the result, so the zone count is already the true reserve.
  return state.zones[`table:${playerId}`]?.cardIds.length ?? 0;
}

function warCanContinue(state: GameState, currentPlayerId: PlayerId): boolean {
  return state.players.length === 2 && state.players.every((player) => {
    const currentCardStillInPile = player.id === currentPlayerId ? 1 : 0;
    return warRemainingCards(state, player.id) - currentCardStillInPile >= 4;
  });
}

function warWinnerByRemaining(state: GameState): PlayerId | undefined {
  const counts = state.players.map((player) => ({
    id: player.id,
    count: warRemainingCards(state, player.id),
  }));
  const highest = Math.max(...counts.map((entry) => entry.count));
  const winners = counts.filter((entry) => entry.count === highest);
  return winners.length === 1 ? winners[0]!.id : undefined;
}

function resolveWar(
  state: GameState,
  potIds: string[],
  winnerId: PlayerId,
  currentPlayerId: PlayerId,
): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = potIds.map((cardId) => ({
    type: 'card/move',
    cardId,
    toZoneId: `table:${winnerId}`,
    face: 'down',
  }));
  const loser = state.players.find((player) => player.id !== winnerId);
  const loserRemaining = loser
    ? warRemainingCards(state, loser.id) - (loser.id === currentPlayerId ? 1 : 0)
    : 0;
  events.push(
    { type: 'turn/set', playerId: winnerId },
    { type: 'game/street', street: 0 },
  );
  if (loser && loserRemaining === 0) {
    events.push({ type: 'session/end', winnerId });
  }
  return events;
}

function warActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const pile = state.zones[`table:${viewerId}`];
  if (!pile || pile.cardIds.length === 0) return [];
  const street = state.game?.street ?? 0;
  const isWarDown = street === 2 || street === 3;
  return [{
    id: 'flip',
    label: isWarDown ? 'DOWN CARD' : 'FLIP',
    hint: isWarDown ? 'Place one card face-down' : 'Play the top card',
    kind: 'table',
  }];
}

function warApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (action !== 'flip' || state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  if (state.players.length !== 2) return null;
  const pile = state.zones[`table:${viewerId}`];
  const cardId = pile?.cardIds[0];
  if (!cardId) return null;

  const street = state.game?.street ?? 0;
  const face = street === 2 || street === 3 ? 'down' : 'up';
  const events: PrimitiveEvent[] = [{
    type: 'card/move',
    cardId,
    toZoneId: communalZoneId(0),
    face,
  }];
  const currentIndex = state.players.findIndex((player) => player.id === viewerId);
  const nextPlayerId = state.players[(currentIndex + 1) % state.players.length]!.id;

  if (street === 0 || street === 2 || street === 4) {
    return [
      ...events,
      { type: 'turn/set', playerId: nextPlayerId },
      { type: 'game/street', street: street + 1 },
    ];
  }

  const community = state.zones[communalZoneId(0)]?.cardIds ?? [];
  const potIds = [...community, cardId];
  const battle = potIds.slice(-2);
  const firstRank = warRank(battle[0]!);
  const secondRank = warRank(battle[1]!);

  if (firstRank === secondRank) {
    if (!warCanContinue(state, viewerId)) {
      return [
        ...events,
        { type: 'session/end', winnerId: warWinnerByRemaining(state) },
      ];
    }
    return [
      ...events,
      { type: 'turn/set', playerId: state.players[0]!.id },
      { type: 'game/street', street: 2 },
    ];
  }

  const winnerId = firstRank > secondRank
    ? state.players[0]!.id
    : state.players[1]!.id;
  return [...events, ...resolveWar(state, potIds, winnerId, viewerId)];
}

function warReadout(state: GameState, playerId: PlayerId): string | null {
  const count = state.zones[`table:${playerId}`]?.cardIds.length ?? 0;
  return count > 0 ? `PILE ${count}` : 'OUT';
}

// ---------------------------------------------------------------------------
// Go Fish
// ---------------------------------------------------------------------------

function nextPlayerWithCards(state: GameState, playerId: PlayerId): Player | null {
  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const currentIndex = sorted.findIndex((player) => player.id === playerId);
  if (currentIndex < 0) return null;
  for (let offset = 1; offset < sorted.length; offset += 1) {
    const candidate = sorted[(currentIndex + offset) % sorted.length]!;
    const handSize = state.zones[handZoneId(candidate.id)]?.cardIds.length ?? 0;
    if (handSize > 0) return candidate;
  }
  return null;
}

function uniqueHandRanks(state: GameState, playerId: PlayerId): string[] {
  const ranks = new Set<string>();
  for (const cardId of state.zones[handZoneId(playerId)]?.cardIds ?? []) {
    const parsed = parseCardId(cardId);
    if (parsed) ranks.add(parsed.rank);
  }
  return [...ranks];
}

function bookCardIds(cardIds: string[]): string[] {
  const byRank = new Map<string, string[]>();
  for (const cardId of cardIds) {
    const parsed = parseCardId(cardId);
    if (!parsed) continue;
    const cards = byRank.get(parsed.rank) ?? [];
    cards.push(cardId);
    byRank.set(parsed.rank, cards);
  }
  return [...byRank.values()]
    .filter((cards) => cards.length >= 4)
    .flatMap((cards) => cards.slice(0, 4));
}

function goFishBooks(state: GameState, playerId: PlayerId): number {
  return Math.floor((state.zones[tableZoneId(playerId)]?.cardIds.length ?? 0) / 4);
}

function goFishWinner(state: GameState, extraBooksFor?: PlayerId, extraBooks = 0): PlayerId | undefined {
  let winner: PlayerId | undefined;
  let best = -1;
  for (const player of state.players) {
    const score = goFishBooks(state, player.id) + (player.id === extraBooksFor ? extraBooks : 0);
    if (score > best) {
      best = score;
      winner = player.id;
    }
  }
  return winner;
}

function parseAskAction(action: GameAction): { targetId: PlayerId; rank: string } | null {
  if (!action.startsWith('ask:')) return null;
  const payload = action.slice('ask:'.length);
  const divider = payload.lastIndexOf(':');
  if (divider <= 0 || divider >= payload.length - 1) return null;
  return {
    targetId: payload.slice(0, divider),
    rank: payload.slice(divider + 1),
  };
}

function projectedHandSizes(
  state: GameState,
  changes: Map<PlayerId, number>,
): Map<PlayerId, number> {
  return new Map(state.players.map((player) => [
    player.id,
    (state.zones[handZoneId(player.id)]?.cardIds.length ?? 0) + (changes.get(player.id) ?? 0),
  ]));
}

function nextActivePlayer(
  state: GameState,
  playerId: PlayerId,
  projected: Map<PlayerId, number>,
): Player | null {
  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const currentIndex = sorted.findIndex((player) => player.id === playerId);
  if (currentIndex < 0) return null;
  for (let offset = 1; offset < sorted.length; offset += 1) {
    const candidate = sorted[(currentIndex + offset) % sorted.length]!;
    if ((projected.get(candidate.id) ?? 0) > 0) return candidate;
  }
  return null;
}

function goFishActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const target = nextPlayerWithCards(state, viewerId);
  if (!target) {
    return [{ id: 'end', label: 'FINISH', hint: 'End the round and score the books', kind: 'table' }];
  }
  const ranks = uniqueHandRanks(state, viewerId);
  if (ranks.length === 0) {
    return state.zones[ZONE_DRAW]?.cardIds.length
      ? [{ id: 'draw', label: 'DRAW', hint: 'Draw a card to find a rank', kind: 'table' }]
      : [{ id: 'end', label: 'FINISH', hint: 'End the round and score the books', kind: 'table' }];
  }
  return ranks.map((rank) => ({
    id: `ask:${target.id}:${rank}` as GameAction,
    label: `ASK ${rank}`,
    hint: `Ask ${target.name} for ${rank}`,
    kind: 'table',
  }));
}

function goFishApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  if (action === 'end') return [{ type: 'session/end', winnerId: goFishWinner(state) }];

  const targetAndRank = parseAskAction(action);
  const target = targetAndRank
    ? state.players.find((player) => player.id === targetAndRank.targetId)
    : nextPlayerWithCards(state, viewerId);
  if (!target) return [{ type: 'session/end', winnerId: goFishWinner(state) }];

  const rank = targetAndRank?.rank;
  const targetHand = state.zones[handZoneId(target.id)]?.cardIds ?? [];
  const matching = rank
    ? targetHand.filter((cardId) => parseCardId(cardId)?.rank === rank)
    : [];
  const events: PrimitiveEvent[] = [{
    type: 'card/ask',
    targetPlayerId: target.id,
    rank: rank ?? 'any',
    found: matching.length > 0,
    transferredCount: matching.length,
  }];

  for (const cardId of matching) {
    events.push({ type: 'card/move', cardId, toZoneId: handZoneId(viewerId), face: 'down' });
  }

  let drawnCardId: string | undefined;
  if (matching.length === 0) {
    drawnCardId = state.zones[ZONE_DRAW]?.cardIds[0];
    if (drawnCardId) {
      events.push({ type: 'card/deal', cardId: drawnCardId, toZoneId: handZoneId(viewerId), face: 'down' });
    }
  }

  const currentHand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  const projectedHand = [...currentHand, ...matching, ...(drawnCardId ? [drawnCardId] : [])];
  const books = bookCardIds(projectedHand);
  for (const cardId of books) {
    events.push({ type: 'card/move', cardId, toZoneId: tableZoneId(viewerId), face: 'up' });
  }

  const changes = new Map<PlayerId, number>([
    [viewerId, matching.length + (drawnCardId ? 1 : 0) - books.length],
    [target.id, -matching.length],
  ]);
  const projected = projectedHandSizes(state, changes);
  const nonEmptyPlayers = [...projected.values()].filter((count) => count > 0).length;
  const drawRemaining = Math.max(0, (state.zones[ZONE_DRAW]?.cardIds.length ?? 0) - (drawnCardId ? 1 : 0));
  if (nonEmptyPlayers <= 1 || (drawRemaining === 0 && nonEmptyPlayers === 0)) {
    events.push({ type: 'session/end', winnerId: goFishWinner(state, viewerId, books.length / 4) });
    return events;
  }

  const drawMatched = drawnCardId !== undefined && parseCardId(drawnCardId)?.rank === rank;
  if (matching.length === 0 && !drawMatched) {
    events.push({ type: 'turn/end', playerId: viewerId });
  }
  return events;
}

function goFishReadout(state: GameState, playerId: PlayerId): string | null {
  const handSize = state.zones[handZoneId(playerId)]?.cardIds.length ?? 0;
  return `BOOKS ${goFishBooks(state, playerId)} · HAND ${handSize}`;
}

// ---------------------------------------------------------------------------
// Old Maid
// ---------------------------------------------------------------------------

function pairCardIds(cardIds: string[]): string[] {
  const byRank = new Map<string, string[]>();
  for (const cardId of cardIds) {
    const parsed = parseCardId(cardId);
    if (!parsed) continue;
    const cards = byRank.get(parsed.rank) ?? [];
    cards.push(cardId);
    byRank.set(parsed.rank, cards);
  }
  return [...byRank.values()].flatMap((cards) => cards.slice(0, cards.length - (cards.length % 2)));
}

function oldMaidWinner(state: GameState, projected: Map<PlayerId, number>): PlayerId | undefined {
  return state.players.find((player) => (projected.get(player.id) ?? 0) === 0)?.id;
}

function oldMaidActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const hand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  if (pairCardIds(hand).length > 0) {
    return [{ id: 'pair', label: 'PAIR UP', hint: 'Lay down every matching pair', kind: 'table' }];
  }
  const target = nextPlayerWithCards(state, viewerId);
  if (!target) {
    return [{ id: 'end', label: 'FINISH', hint: 'End the round', kind: 'table' }];
  }
  return [{ id: 'draw', label: 'DRAW CARD', hint: `Take one card from ${target.name}`, kind: 'table' }];
}

function oldMaidApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  if (action === 'end') return [{ type: 'session/end', winnerId: state.players[0]?.id }];

  const currentHand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  const pairIds = action === 'pair' ? pairCardIds(currentHand) : [];
  if (action === 'pair' && pairIds.length === 0) return null;

  if (action === 'pair') {
    const events: PrimitiveEvent[] = pairIds.map((cardId) => ({
      type: 'card/move', cardId, toZoneId: tableZoneId(viewerId), face: 'up',
    }));
    const projected = projectedHandSizes(state, new Map([[viewerId, -pairIds.length]]));
    const nonEmptyPlayers = [...projected.values()].filter((count) => count > 0).length;
    if (nonEmptyPlayers <= 1) {
      events.push({ type: 'session/end', winnerId: oldMaidWinner(state, projected) });
      return events;
    }
    const next = nextActivePlayer(state, viewerId, projected);
    if (next) events.push({ type: 'turn/set', playerId: next.id });
    return events;
  }

  if (action !== 'draw') return null;
  const target = nextPlayerWithCards(state, viewerId);
  const cardId = target ? state.zones[handZoneId(target.id)]?.cardIds.at(-1) : undefined;
  if (!target || !cardId) return [{ type: 'session/end', winnerId: state.players[0]?.id }];
  const events: PrimitiveEvent[] = [{
    type: 'card/move', cardId, toZoneId: handZoneId(viewerId), face: 'down',
  }];
  const projected = projectedHandSizes(state, new Map([
    [viewerId, 1],
    [target.id, -1],
  ]));
  const nonEmptyPlayers = [...projected.values()].filter((count) => count > 0).length;
  if (nonEmptyPlayers <= 1) {
    events.push({ type: 'session/end', winnerId: oldMaidWinner(state, projected) });
    return events;
  }
  const next = nextActivePlayer(state, viewerId, projected);
  if (next) events.push({ type: 'turn/set', playerId: next.id });
  return events;
}

function oldMaidReadout(state: GameState, playerId: PlayerId): string | null {
  const handSize = state.zones[handZoneId(playerId)]?.cardIds.length ?? 0;
  const pairs = Math.floor((state.zones[tableZoneId(playerId)]?.cardIds.length ?? 0) / 2);
  return `PAIRS ${pairs} · HAND ${handSize}`;
}

// ---------------------------------------------------------------------------
// Crazy Eights
// ---------------------------------------------------------------------------

function discardTopId(state: GameState): string | null {
  const discard = state.zones['discard'];
  return discard?.cardIds.at(-1) ?? null;
}

function crazyEightPlayable(cardId: string, topCardId: string | null): boolean {
  if (!topCardId) return true;
  const card = parseCardId(cardId);
  const top = parseCardId(topCardId);
  if (!card || !top) return false;
  return card.rank === '8' || top.rank === '8' || card.rank === top.rank || card.suit === top.suit;
}

function crazyEightsActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const hand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  const topCardId = discardTopId(state);
  const playable = hand.filter((cardId) => crazyEightPlayable(cardId, topCardId));
  if (playable.length > 0) {
    return playable.map((cardId) => ({
      id: `play:${cardId}` as GameAction,
      label: `PLAY ${parseCardId(cardId)?.rank ?? 'CARD'}`,
      hint: 'Match the suit or rank, or play an eight',
      kind: 'table',
    }));
  }
  if ((state.zones[ZONE_DRAW]?.cardIds.length ?? 0) > 0) {
    return [{ id: 'draw', label: 'DRAW', hint: 'Draw one card; play it if it fits', kind: 'table' }];
  }
  return [{ id: 'end', label: 'FINISH', hint: 'The deck is empty; finish the round', kind: 'table' }];
}

function crazyEightsApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  const hand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  if (action === 'end') return [{ type: 'session/end', winnerId: viewerId }];
  if (action === 'draw') {
    const cardId = state.zones[ZONE_DRAW]?.cardIds[0];
    if (!cardId) return [{ type: 'session/end', winnerId: viewerId }];
    const events: PrimitiveEvent[] = [{
      type: 'card/deal', cardId, toZoneId: handZoneId(viewerId), face: 'down',
    }];
    if (!crazyEightPlayable(cardId, discardTopId(state))) {
      events.push({ type: 'turn/end', playerId: viewerId });
    }
    return events;
  }
  if (!action.startsWith('play:')) return null;
  const cardId = action.slice('play:'.length);
  if (!hand.includes(cardId) || !crazyEightPlayable(cardId, discardTopId(state))) return null;
  if (hand.length === 1) {
    return [
      { type: 'card/move', cardId, toZoneId: 'discard', face: 'up' },
      { type: 'session/end', winnerId: viewerId },
    ];
  }
  return [
    { type: 'card/move', cardId, toZoneId: 'discard', face: 'up' },
    { type: 'turn/end', playerId: viewerId },
  ];
}

function crazyEightsReadout(state: GameState, playerId: PlayerId): string | null {
  const handSize = state.zones[handZoneId(playerId)]?.cardIds.length ?? 0;
  const top = discardTopId(state);
  return `HAND ${handSize}${top ? ` · TOP ${parseCardId(top)?.rank ?? 'JOKER'}` : ''}`;
}

// ---------------------------------------------------------------------------
// Sevens
// ---------------------------------------------------------------------------

const SEVENS_RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function sevensPlayable(cardId: string, tableCardIds: string[]): boolean {
  const card = parseCardId(cardId);
  if (!card) return false;
  if (tableCardIds.length === 0) return card.rank === '7';
  const sameSuit = tableCardIds
    .map(parseCardId)
    .filter((parsed): parsed is NonNullable<ReturnType<typeof parseCardId>> => parsed?.suit === card.suit);
  if (sameSuit.length === 0) return card.rank === '7';
  const rankIndex = SEVENS_RANK_ORDER.indexOf(card.rank);
  const playedIndexes = sameSuit.map((parsed) => SEVENS_RANK_ORDER.indexOf(parsed.rank));
  const low = Math.min(...playedIndexes);
  const high = Math.max(...playedIndexes);
  return rankIndex === low - 1 || rankIndex === high + 1;
}

function sevensActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const hand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  const tableCards = state.zones[communalZoneId(0)]?.cardIds ?? [];
  const playable = hand.filter((cardId) => sevensPlayable(cardId, tableCards));
  if (playable.length > 0) {
    return playable.map((cardId) => ({
      id: `play:${cardId}` as GameAction,
      label: `PLAY ${parseCardId(cardId)?.rank ?? 'CARD'}`,
      hint: tableCards.length === 0 ? 'Open the table with a seven' : 'Play one card next to its suit run',
      kind: 'table',
    }));
  }
  if (hand.length === 0) return [{ id: 'end', label: 'FINISH', hint: 'You have played every card', kind: 'table' }];
  return [{ id: 'pass', label: 'PASS', hint: 'No legal card; pass to the next player', kind: 'table' }];
}

function sevensApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;
  const hand = state.zones[handZoneId(viewerId)]?.cardIds ?? [];
  const tableCards = state.zones[communalZoneId(0)]?.cardIds ?? [];
  if (action === 'end') return [{ type: 'session/end', winnerId: viewerId }];
  if (action === 'pass') return [{ type: 'turn/end', playerId: viewerId }];
  if (!action.startsWith('play:')) return null;
  const cardId = action.slice('play:'.length);
  if (!hand.includes(cardId) || !sevensPlayable(cardId, tableCards)) return null;
  const events: PrimitiveEvent[] = [{
    type: 'card/move', cardId, toZoneId: communalZoneId(0), face: 'up',
  }];
  if (hand.length === 1) {
    events.push({ type: 'session/end', winnerId: viewerId });
  } else {
    events.push({ type: 'turn/end', playerId: viewerId });
  }
  return events;
}

function sevensReadout(state: GameState, playerId: PlayerId): string | null {
  const handSize = state.zones[handZoneId(playerId)]?.cardIds.length ?? 0;
  const played = state.zones[communalZoneId(0)]?.cardIds.length ?? 0;
  return `PLAYED ${played} · HAND ${handSize}`;
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
// Texas Hold'em
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

    const candidate: PokerHandScore = {
      category,
      tiebreak,
      label: POKER_HAND_LABELS[category]!,
    };
    if (beats(candidate, best)) {
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

function pokerBetting(state: GameState): PokerBettingState | null {
  return state.game?.betting ?? null;
}

function pokerLivePlayers(state: GameState, folded: readonly PlayerId[] = state.game?.folded ?? []): Player[] {
  const foldedSet = new Set(folded);
  return state.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .filter((player) => !foldedSet.has(player.id));
}

function pokerNextActionablePlayer(
  state: GameState,
  playerId: PlayerId,
  betting: PokerBettingState,
  folded: readonly PlayerId[] = state.game?.folded ?? [],
): PlayerId | null {
  const live = pokerLivePlayers(state, folded);
  const currentIndex = live.findIndex((player) => player.id === playerId);
  if (currentIndex < 0) return live.find((player) => (betting.stacks[player.id] ?? 0) > 0)?.id ?? null;
  for (let offset = 1; offset <= live.length; offset += 1) {
    const candidate = live[(currentIndex + offset) % live.length];
    if (candidate && (betting.stacks[candidate.id] ?? 0) > 0) return candidate.id;
  }
  return null;
}

function pokerRoundComplete(
  state: GameState,
  betting: PokerBettingState,
  folded: readonly PlayerId[],
): boolean {
  const live = pokerLivePlayers(state, folded);
  const actionable = live.filter((player) => (betting.stacks[player.id] ?? 0) > 0);
  if (live.length <= 1 || actionable.length <= 1) return true;
  return actionable.every((player) =>
    (betting.roundContributions[player.id] ?? 0) === betting.currentBet &&
    betting.acted.includes(player.id),
  );
}

function pokerAdvanceAllowed(state: GameState, viewerId: PlayerId): boolean {
  // On one phone, the player holding the table advances the physical deal.
  // Online, the host remains the single street/deal authority.
  return state.meta.mode === 'pass'
    ? state.currentPlayerId === viewerId
    : state.meta.hostId === viewerId;
}

function pokerAmountForAction(
  action: Extract<GameAction, 'check' | 'call' | 'raise' | 'fold'>,
  betting: PokerBettingState,
  viewerId: PlayerId,
): number | null {
  const stack = betting.stacks[viewerId] ?? 0;
  const roundContribution = betting.roundContributions[viewerId] ?? 0;
  if (action === 'fold' || action === 'check') {
    if (action === 'check' && roundContribution !== betting.currentBet) return null;
    return 0;
  }
  if (stack <= 0) return null;
  if (action === 'call') {
    const due = betting.currentBet - roundContribution;
    if (due <= 0) return null;
    return Math.min(due, stack);
  }

  // The action rail is intentionally one-tap: a raise is one big blind above
  // the current bet, capped at the player's remaining stack (all-in).
  const target = Math.max(betting.currentBet + betting.bigBlind, betting.bigBlind);
  const amount = Math.min(target - roundContribution, stack);
  return amount > betting.currentBet - roundContribution ? amount : null;
}

function pokerActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  const betting = pokerBetting(state);
  if (!betting) return [];
  const specs: GameActionSpec[] = [];
  const isCurrent = state.currentPlayerId === viewerId;
  const street = (state.game?.street ?? 0) as number;
  const drawEmpty = (state.zones['draw']?.cardIds.length ?? 0) === 0;
  const folded = state.game?.folded ?? [];
  const isFolded = folded.includes(viewerId);

  if (!betting.roundComplete && isCurrent && !isFolded && (betting.stacks[viewerId] ?? 0) > 0) {
    specs.push({ id: 'fold', label: 'FOLD', hint: 'Leave the hand; the live players continue', kind: 'bet' });
    const roundContribution = betting.roundContributions[viewerId] ?? 0;
    const callAmount = pokerAmountForAction('call', betting, viewerId);
    const raiseAmount = pokerAmountForAction('raise', betting, viewerId);
    if (roundContribution === betting.currentBet) {
      specs.push({ id: 'check', label: 'CHECK', hint: 'Pass without adding chips', kind: 'bet' });
    } else if (callAmount !== null) {
      specs.push({ id: 'call', label: 'CALL', hint: `Match ${callAmount} chip${callAmount === 1 ? '' : 's'}`, kind: 'bet' });
    }
    if (raiseAmount !== null) {
      const raiseTo = roundContribution + raiseAmount;
      specs.push({ id: 'raise', label: 'RAISE', hint: `Raise to ${raiseTo} chips`, kind: 'bet' });
    }
  }

  if (betting.roundComplete && pokerAdvanceAllowed(state, viewerId)) {
    if (street <= 2 && !drawEmpty) {
      if (betting.burnedStreet !== street) {
        specs.push({ id: 'burn', label: 'BURN', hint: 'Remove the top card before the next street', kind: 'host' });
      } else {
        if (street === 0) specs.push({ id: 'flop', label: 'FLOP', hint: 'Deal three community cards', kind: 'host' });
        if (street === 1) specs.push({ id: 'turn', label: 'TURN', hint: 'Deal the fourth community card', kind: 'host' });
        if (street === 2) specs.push({ id: 'river', label: 'RIVER', hint: 'Deal the fifth community card', kind: 'host' });
      }
    }
    if (street === 3) {
      specs.push({ id: 'reveal', label: 'SHOWDOWN', hint: 'Reveal live hands and award the pot', kind: 'host' });
    }
  }
  return specs;
}

function pokerApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing') return null;
  const betting = pokerBetting(state);
  if (!betting) return null;
  const isCurrent = state.currentPlayerId === viewerId;
  const street = (state.game?.street ?? 0) as number;
  const draw = state.zones['draw'];
  const top = (): string | null => (draw && draw.cardIds.length > 0 ? draw.cardIds[0]! : null);
  const folded = state.game?.folded ?? [];

  switch (action) {
    case 'burn': {
      if (!pokerAdvanceAllowed(state, viewerId) || !betting.roundComplete || street > 2 || betting.burnedStreet === street) return null;
      const cid = top();
      if (!cid) return null;
      return [
        { type: 'card/move', cardId: cid, toZoneId: ZONE_MUCK, face: 'down' },
        { type: 'game/burn', street },
      ];
    }
    case 'flop': {
      if (!pokerAdvanceAllowed(state, viewerId) || !betting.roundComplete || street !== 0 || betting.burnedStreet !== street) return null;
      if (!draw || draw.cardIds.length < 3) return null;
      const events: PrimitiveEvent[] = [];
      for (let i = 0; i < 3; i += 1) {
        // Rules are pure: state never mutates, so index into the draw pile
        // instead of re-reading cardIds[0] (which would deal the same card
        // three times).
        const cid = draw && draw.cardIds[i] ? draw.cardIds[i]! : null;
        if (!cid) break;
        events.push({ type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' });
      }
      events.push(
        { type: 'game/street', street: 1 },
        { type: 'turn/set', playerId: betting.firstPostflopPlayerId },
      );
      return events;
    }
    case 'turn': {
      if (!pokerAdvanceAllowed(state, viewerId) || !betting.roundComplete || street !== 1 || betting.burnedStreet !== street) return null;
      const cid = top();
      if (!cid) return null;
      return [
        { type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' },
        { type: 'game/street', street: 2 },
        { type: 'turn/set', playerId: betting.firstPostflopPlayerId },
      ];
    }
    case 'river': {
      if (!pokerAdvanceAllowed(state, viewerId) || !betting.roundComplete || street !== 2 || betting.burnedStreet !== street) return null;
      const cid = top();
      if (!cid) return null;
      return [
        { type: 'card/deal', cardId: cid, toZoneId: communalZoneId(0), face: 'up' },
        { type: 'game/street', street: 3 },
        { type: 'turn/set', playerId: betting.firstPostflopPlayerId },
      ];
    }
    case 'reveal': {
      if (!pokerAdvanceAllowed(state, viewerId) || !betting.roundComplete || street !== 3) return null;
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
      if (!isCurrent || betting.roundComplete || folded.includes(viewerId)) return null;
      const amount = pokerAmountForAction('fold', betting, viewerId);
      if (amount === null) return null;
      const projectedFolded = [...folded, viewerId];
      const projectedBetting = {
        ...betting,
        acted: Array.from(new Set([...betting.acted, viewerId])),
      };
      const liveAfterFold = pokerLivePlayers(state, projectedFolded);
      const roundComplete = pokerRoundComplete(state, projectedBetting, projectedFolded);
      const events: PrimitiveEvent[] = [
        { type: 'game/bet', playerId: viewerId, action: 'fold', amount, roundComplete },
      ];
      for (const cid of state.zones[handZoneId(viewerId)]?.cardIds ?? []) {
        events.push({ type: 'card/move', cardId: cid, toZoneId: ZONE_MUCK, face: 'down' });
      }
      events.push({ type: 'game/fold', playerId: viewerId });
      if (liveAfterFold.length === 1) {
        events.push({ type: 'session/end', winnerId: liveAfterFold[0]!.id });
      } else {
        const nextPlayerId = pokerNextActionablePlayer(state, viewerId, projectedBetting, projectedFolded);
        if (nextPlayerId && !roundComplete) events.push({ type: 'turn/set', playerId: nextPlayerId });
      }
      return events;
    }
    case 'check':
    case 'call':
    case 'raise': {
      if (!isCurrent || betting.roundComplete || folded.includes(viewerId)) return null;
      const amount = pokerAmountForAction(action, betting, viewerId);
      if (amount === null) return null;
      const roundContribution = (betting.roundContributions[viewerId] ?? 0) + amount;
      const currentBet = action === 'raise'
        ? Math.max(betting.currentBet, roundContribution)
        : betting.currentBet;
      const projectedBetting: PokerBettingState = {
        ...betting,
        currentBet,
        roundContributions: { ...betting.roundContributions, [viewerId]: roundContribution },
        stacks: { ...betting.stacks, [viewerId]: (betting.stacks[viewerId] ?? 0) - amount },
        acted: action === 'raise'
          ? [viewerId]
          : Array.from(new Set([...betting.acted, viewerId])),
      };
      const roundComplete = pokerRoundComplete(state, projectedBetting, folded);
      const events: PrimitiveEvent[] = [{
        type: 'game/bet',
        playerId: viewerId,
        action,
        amount,
        roundComplete,
      }];
      if (!roundComplete) {
        const nextPlayerId = pokerNextActionablePlayer(state, viewerId, projectedBetting, folded);
        if (nextPlayerId) events.push({ type: 'turn/set', playerId: nextPlayerId });
      }
      return events;
    }
    default:
      return null;
  }
}

function pokerReadout(state: GameState, playerId: PlayerId): string | null {
  const betting = pokerBetting(state);
  if (!betting) return null;
  return `POT ${state.game?.pot ?? 0} · STACK ${betting.stacks[playerId] ?? 0}`;
}

// ---------------------------------------------------------------------------
// Freeplay / generic
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Klondike (draw one)
// ---------------------------------------------------------------------------

const KLONDIKE_RANK_ORDER: Record<string, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

function klondikeRank(cardId: string): number {
  const parsed = parseCardId(cardId);
  return parsed ? KLONDIKE_RANK_ORDER[parsed.rank] ?? 0 : 0;
}

function klondikeIsRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

function klondikeDescendingAlternating(upperId: string, lowerId: string): boolean {
  const upper = parseCardId(upperId);
  const lower = parseCardId(lowerId);
  if (!upper || !lower) return false;
  return (
    klondikeRank(upperId) === klondikeRank(lowerId) + 1 &&
    klondikeIsRed(upper.suit) !== klondikeIsRed(lower.suit)
  );
}

interface KlondikeRun {
  sourceZone: GameState['zones'][string];
  startIndex: number;
  cards: CardInstance[];
}

/**
 * Resolve the selected card and the face-up tail it carries. Tableau moves
 * may carry a valid alternating-colour run; waste/foundation moves are
 * intentionally single-card. This keeps the event stream primitive while
 * retaining standard Klondike's useful stack movement.
 */
function klondikeRun(state: GameState, cardId: string): KlondikeRun | null {
  const card = state.cards[cardId];
  if (!card || card.face !== 'up') return null;
  const sourceZone = state.zones[card.zoneId];
  if (!sourceZone) return null;
  const startIndex = sourceZone.cardIds.indexOf(cardId);
  if (startIndex < 0) return null;

  if (!sourceZone.id.startsWith('tableau:')) {
    if (sourceZone.id !== ZONE_DISCARD && !sourceZone.id.startsWith('foundation:')) return null;
    return { sourceZone, startIndex, cards: [card] };
  }

  const ids = sourceZone.cardIds.slice(startIndex);
  const cards: CardInstance[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const next = state.cards[ids[index]!];
    if (!next || next.face !== 'up') return null;
    if (index > 0 && !klondikeDescendingAlternating(ids[index - 1]!, ids[index]!)) return null;
    cards.push(next);
  }
  return { sourceZone, startIndex, cards };
}

function klondikeActions(state: GameState, viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return [];
  const stock = state.zones[ZONE_DRAW];
  const waste = state.zones['discard'];
  if (stock && stock.cardIds.length > 0) {
    return [{ id: 'draw', label: 'DRAW STOCK', hint: 'Turn one card into the waste', kind: 'table' }];
  }
  if (waste && waste.cardIds.length > 0) {
    return [{ id: 'recycle', label: 'RECYCLE WASTE', hint: 'Return the waste to the stock', kind: 'table' }];
  }
  return [];
}

function klondikeApply(
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] | null {
  if (state.phase !== 'playing' || state.currentPlayerId !== viewerId) return null;

  if (action === 'draw') {
    const cardId = state.zones[ZONE_DRAW]?.cardIds[0];
    if (!cardId) return null;
    return [{ type: 'card/move', cardId, toZoneId: 'discard', face: 'up' }];
  }

  if (action === 'recycle') {
    const waste = state.zones['discard'];
    if (!waste || waste.cardIds.length === 0 || (state.zones[ZONE_DRAW]?.cardIds.length ?? 0) > 0) return null;
    return waste.cardIds
      .slice()
      .reverse()
      .map((cardId) => ({ type: 'card/move' as const, cardId, toZoneId: ZONE_DRAW, face: 'down' as const }));
  }

  if (action.startsWith('flip:')) {
    const cardId = action.slice('flip:'.length);
    const card = state.cards[cardId];
    const zone = card ? state.zones[card.zoneId] : undefined;
    if (!card || card.face !== 'down' || !zone || !card.zoneId.startsWith('tableau:')) return null;
    if (zone.cardIds[zone.cardIds.length - 1] !== cardId) return null;
    return [{ type: 'card/flip', cardId }];
  }

  if (!action.startsWith('move:')) return null;
  const payload = action.slice('move:'.length);
  const divider = payload.indexOf('|');
  if (divider <= 0) return null;
  const cardId = payload.slice(0, divider);
  const targetZoneId = payload.slice(divider + 1);
  const run = klondikeRun(state, cardId);
  const sourceZone = run?.sourceZone;
  const targetZone = state.zones[targetZoneId];
  if (!run || !targetZone || !sourceZone || targetZoneId === sourceZone.id) return null;
  if (!targetZoneId.startsWith('tableau:') && !targetZoneId.startsWith('foundation:')) return null;

  const firstCard = run.cards[0]!;
  const parsed = parseCardId(firstCard.id);
  if (!parsed) return null;
  const rank = klondikeRank(firstCard.id);
  const targetTopId = targetZone.cardIds[targetZone.cardIds.length - 1];

  if (targetZoneId.startsWith('foundation:')) {
    if (run.cards.length !== 1) return null;
    const suit = targetZoneId.slice('foundation:'.length) as Suit;
    if (!KLONDIKE_FOUNDATION_SUITS.includes(suit as (typeof KLONDIKE_FOUNDATION_SUITS)[number])) return null;
    if (parsed.suit !== suit || rank !== targetZone.cardIds.length + 1) return null;
  } else if (targetTopId) {
    if (!klondikeDescendingAlternating(targetTopId, firstCard.id)) return null;
  } else if (parsed.rank !== 'K') {
    return null;
  }

  const events: PrimitiveEvent[] = run.cards.map((cardInRun) => ({
    type: 'card/move' as const,
    cardId: cardInRun.id,
    toZoneId: targetZoneId,
    face: 'up' as const,
  }));
  if (sourceZone.id.startsWith('tableau:')) {
    const exposedId = sourceZone.cardIds[run.startIndex - 1];
    if (exposedId && state.cards[exposedId]?.face === 'down') events.push({ type: 'card/flip', cardId: exposedId });
  }

  const foundationCount = KLONDIKE_FOUNDATION_SUITS.reduce(
    (total, suit) => total + (state.zones[klondikeFoundationZoneId(suit)]?.cardIds.length ?? 0),
    0,
  );
  if (targetZoneId.startsWith('foundation:') && foundationCount + run.cards.length === 52) {
    events.push({ type: 'session/end', winnerId: viewerId });
  }
  return events;
}

function klondikeReadout(state: GameState, _playerId: PlayerId): string | null {
  const foundationCount = KLONDIKE_FOUNDATION_SUITS.reduce(
    (total, suit) => total + (state.zones[klondikeFoundationZoneId(suit)]?.cardIds.length ?? 0),
    0,
  );
  const stockCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  return `FOUNDATION ${foundationCount}/52 · STOCK ${stockCount}`;
}

/** Generic presets keep the existing table UI (draw pile, flip, PASS TURN). */
function noActions(): GameActionSpec[] {
  return [];
}

// ---------------------------------------------------------------------------
// Klondike solitaire
// ---------------------------------------------------------------------------

/**
 * Move action encoding: `move:<from>:<to>` where from/to are zone ids. The UI
 * builds these from tap-to-move selection; the rules layer validates each.
 */
function parseMoveAction(
  action: GameAction,
): { from: string; to: string } | null {
  if (typeof action !== 'string' || !action.startsWith('move:')) return null;
  const rest = action.slice('move:'.length);
  const divider = rest.indexOf(':to:');
  if (divider < 0) return null;
  return { from: rest.slice(0, divider), to: rest.slice(divider + 4) };
}

/** Exported so the UI can build tap-to-move actions from zone ids. */
export function encodeMoveAction(from: string, to: string): GameAction {
  return `move:${from}:to:${to}` as GameAction;
}

/** Returns the card ids that would move from `from` zone (a single run or card). */
function movableCardIds(state: GameState, from: string): { ids: string[]; isTopOnly: boolean } | null {
  if (from === ZONE_WASTE) {
    const zone = state.zones[ZONE_WASTE];
    const top = zone?.cardIds[zone.cardIds.length - 1];
    return top ? { ids: [top], isTopOnly: true } : null;
  }
  if (from.startsWith('tableau:')) {
    const col = Number(from.slice('tableau:'.length));
    if (Number.isNaN(col)) return null;
    const run = tableauRun(state, col);
    return run.length > 0 ? { ids: run, isTopOnly: false } : null;
  }
  if (from.startsWith('fc-tableau:')) {
    const col = Number(from.slice('fc-tableau:'.length));
    if (Number.isNaN(col)) return null;
    const zone = state.zones[freeCellTableauZoneId(col)];
    const top = zone?.cardIds[zone.cardIds.length - 1];
    return top ? { ids: [top], isTopOnly: true } : null;
  }
  if (from.startsWith('free-cell:')) {
    const idx = Number(from.slice('free-cell:'.length));
    if (Number.isNaN(idx)) return null;
    const zone = state.zones[freeCellZoneId(idx)];
    const top = zone?.cardIds[zone.cardIds.length - 1];
    return top ? { ids: [top], isTopOnly: true } : null;
  }
  return null;
}

function klondikeActions(state: GameState, _viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  const specs: GameActionSpec[] = [];
  const stockCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  if (stockCount > 0) {
    specs.push({ id: 'cycleStock', label: 'DRAW', hint: 'Flip cards from the stock', kind: 'table' });
  } else if ((state.zones[ZONE_WASTE]?.cardIds.length ?? 0) > 0) {
    specs.push({ id: 'cycleStock', label: 'RECYCLE', hint: 'Turn the waste back into the stock', kind: 'table' });
  }
  if (isKlondikeWon(state)) {
    specs.push({ id: 'end', label: 'FINISH', hint: 'You cleared the board', kind: 'table' });
  }
  return specs;
}

function klondikeApply(action: GameAction, state: GameState, viewerId: PlayerId): PrimitiveEvent[] | null {
  if (state.phase !== 'playing') return null;
  if (action === 'end') {
    return isKlondikeWon(state)
      ? [{ type: 'session/end', winnerId: viewerId }]
      : null;
  }
  if (action === 'cycleStock') {
    const stock = state.zones[ZONE_DRAW];
    const waste = state.zones[ZONE_WASTE];
    if (stock && stock.cardIds.length > 0) {
      // Draw 1 (draw-3 is a variant; default to 1 for clarity).
      const top = stock.cardIds[stock.cardIds.length - 1]!;
      return [{ type: 'card/move', cardId: top, toZoneId: ZONE_WASTE, face: 'up' }];
    }
    // Recycle waste → stock (face-down, reversed).
    if (waste && waste.cardIds.length > 0) {
      const events: PrimitiveEvent[] = [];
      // Move waste cards back to stock in reverse (last-in becomes first-out).
      const reversed = [...waste.cardIds].reverse();
      for (const cardId of reversed) {
        events.push({ type: 'card/move', cardId, toZoneId: ZONE_DRAW, face: 'down' });
      }
      return events;
    }
    return null;
  }
  const move = parseMoveAction(action);
  if (!move) return null;
  return resolveMove(state, move.from, move.to);
}

/** Shared move resolver for Klondike and FreeCell. */
function resolveMove(state: GameState, from: string, to: string): PrimitiveEvent[] | null {
  const movable = movableCardIds(state, from);
  if (!movable) return null;
  const ids = movable.ids;
  if (ids.length === 0) return null;

  // Foundation moves: only a single card can go to a foundation.
  if (to.startsWith('foundation:')) {
    const fIdx = Number(to.slice('foundation:'.length));
    if (Number.isNaN(fIdx) || ids.length > 1) return null;
    const cardId = ids[0]!;
    if (!canMoveCardToFoundation(state, cardId, fIdx)) return null;
    return [{ type: 'card/move', cardId, toZoneId: foundationZoneId(fIdx), face: 'up' }];
  }

  // Tableau moves (Klondike).
  if (to.startsWith('tableau:')) {
    const col = Number(to.slice('tableau:'.length));
    if (Number.isNaN(col)) return null;
    if (!canMoveRunToTableau(state, ids, col)) return null;
    return ids.map((cardId) => ({ type: 'card/move' as const, cardId, toZoneId: tableauZoneId(col), face: 'up' as const }));
  }

  // FreeCell column moves.
  if (to.startsWith('fc-tableau:')) {
    const col = Number(to.slice('fc-tableau:'.length));
    if (Number.isNaN(col)) return null;
    if (!canMoveRunToFreeCellColumn(state, ids, col)) return null;
    return ids.map((cardId) => ({ type: 'card/move' as const, cardId, toZoneId: freeCellTableauZoneId(col), face: 'up' as const }));
  }

  // Free cell moves: only a single card.
  if (to.startsWith('free-cell:')) {
    const idx = Number(to.slice('free-cell:'.length));
    if (Number.isNaN(idx) || ids.length > 1) return null;
    const zone = state.zones[freeCellZoneId(idx)];
    if (!zone || zone.cardIds.length > 0) return null; // free cell holds 1 card
    return [{ type: 'card/move', cardId: ids[0]!, toZoneId: freeCellZoneId(idx), face: 'up' }];
  }

  return null;
}

function klondikeReadout(state: GameState, _playerId: PlayerId): string | null {
  const stock = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  const waste = state.zones[ZONE_WASTE]?.cardIds.length ?? 0;
  let foundationCount = 0;
  for (let i = 0; i < 4; i += 1) {
    foundationCount += state.zones[foundationZoneId(i)]?.cardIds.length ?? 0;
  }
  return `STOCK ${stock + waste} · FOUNDATION ${foundationCount}/52`;
}

// ---------------------------------------------------------------------------
// FreeCell solitaire
// ---------------------------------------------------------------------------

function freeCellActions(state: GameState, _viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  const specs: GameActionSpec[] = [];
  if (isFreeCellWon(state)) {
    specs.push({ id: 'end', label: 'FINISH', hint: 'You cleared the board', kind: 'table' });
  }
  return specs;
}

function freeCellApply(action: GameAction, state: GameState, viewerId: PlayerId): PrimitiveEvent[] | null {
  if (state.phase !== 'playing') return null;
  if (action === 'end') {
    return isFreeCellWon(state)
      ? [{ type: 'session/end', winnerId: viewerId }]
      : null;
  }
  const move = parseMoveAction(action);
  if (!move) return null;
  return resolveMove(state, move.from, move.to);
}

function freeCellReadout(state: GameState, _playerId: PlayerId): string | null {
  let free = 0;
  for (let i = 0; i < 4; i += 1) {
    if ((state.zones[freeCellZoneId(i)]?.cardIds.length ?? 0) === 0) free += 1;
  }
  let foundationCount = 0;
  for (let i = 0; i < 4; i += 1) {
    foundationCount += state.zones[foundationZoneId(i)]?.cardIds.length ?? 0;
  }
  return `FREE ${free}/4 · FOUNDATION ${foundationCount}/52`;
}

// ---------------------------------------------------------------------------
// Pyramid solitaire
// ---------------------------------------------------------------------------

/**
 * Pyramid play action: `play:<indexA>:<indexB>` where indices reference either
 * pyramid positions (0-27) or special tokens `stock` / `waste`.
 */
function parsePyramidPlay(
  action: GameAction,
): { a: string; b: string } | null {
  if (typeof action !== 'string' || !action.startsWith('play:')) return null;
  const rest = action.slice('play:'.length);
  const divider = rest.indexOf(':');
  if (divider < 0) return null;
  return { a: rest.slice(0, divider), b: rest.slice(divider + 1) };
}

function pyramidCardId(state: GameState, token: string): string | null {
  if (token === 'stock') {
    return state.zones[PYRAMID_STOCK]?.cardIds[state.zones[PYRAMID_STOCK]!.cardIds.length - 1] ?? null;
  }
  if (token === 'waste') {
    return state.zones[PYRAMID_WASTE]?.cardIds[state.zones[PYRAMID_WASTE]!.cardIds.length - 1] ?? null;
  }
  const idx = Number(token);
  if (Number.isNaN(idx)) return null;
  return state.zones[PYRAMID_ZONE]?.cardIds[idx] ?? null;
}

function pyramidActions(state: GameState, _viewerId: PlayerId): GameActionSpec[] {
  if (state.phase !== 'playing') return [];
  const specs: GameActionSpec[] = [];
  const stockCount = state.zones[PYRAMID_STOCK]?.cardIds.length ?? 0;
  if (stockCount > 0) {
    specs.push({ id: 'cycleStock', label: 'DRAW', hint: 'Flip a card to the waste', kind: 'table' });
  }
  if (isPyramidWon(state)) {
    specs.push({ id: 'end', label: 'FINISH', hint: 'You cleared the pyramid', kind: 'table' });
  }
  return specs;
}

function pyramidApply(action: GameAction, state: GameState, viewerId: PlayerId): PrimitiveEvent[] | null {
  if (state.phase !== 'playing') return null;
  if (action === 'end') {
    return isPyramidWon(state)
      ? [{ type: 'session/end', winnerId: viewerId }]
      : null;
  }
  if (action === 'cycleStock') {
    const stock = state.zones[PYRAMID_STOCK];
    if (!stock || stock.cardIds.length === 0) return null;
    const top = stock.cardIds[stock.cardIds.length - 1]!;
    return [{ type: 'card/move', cardId: top, toZoneId: PYRAMID_WASTE, face: 'up' }];
  }
  if (action === 'restart') {
    // No-op here; restart is handled by the store's startNextHand.
    return null;
  }
  const play = parsePyramidPlay(action);
  if (!play) return null;
  const cardA = pyramidCardId(state, play.a);
  const cardB = pyramidCardId(state, play.b);
  if (!cardA) return null;

  const events: PrimitiveEvent[] = [];

  // Single King removal.
  if (isKing(cardA) && (play.b === '' || play.b === cardA || play.b === play.a)) {
    if (play.a !== 'stock' && play.a !== 'waste') {
      const idx = Number(play.a);
      if (!isPyramidCardFree(state, idx)) return null;
    }
    events.push({ type: 'card/move', cardId: cardA, toZoneId: ZONE_MUCK, face: 'down' });
    if (isPyramidWon({ ...state, zones: { ...state.zones, [PYRAMID_ZONE]: { ...state.zones[PYRAMID_ZONE]!, cardIds: state.zones[PYRAMID_ZONE]!.cardIds.map((id) => (id === cardA ? '' : id)) } } })) {
      events.push({ type: 'session/end', winnerId: viewerId });
    }
    return events;
  }

  if (!cardB) return null;
  if (!pyramidPairMatches(cardA, cardB)) return null;

  // Validate freedom: pyramid cards must be free; stock/waste are always accessible.
  if (play.a !== 'stock' && play.a !== 'waste') {
    const idxA = Number(play.a);
    if (!Number.isNaN(idxA) && !isPyramidCardFree(state, idxA)) return null;
  }
  if (play.b !== 'stock' && play.b !== 'waste') {
    const idxB = Number(play.b);
    if (!Number.isNaN(idxB) && !isPyramidCardFree(state, idxB)) return null;
  }

  events.push({ type: 'card/move', cardId: cardA, toZoneId: ZONE_MUCK, face: 'down' });
  events.push({ type: 'card/move', cardId: cardB, toZoneId: ZONE_MUCK, face: 'down' });

  // Check win after removal.
  const pyramidAfter = state.zones[PYRAMID_ZONE]!.cardIds.map((id) =>
    (id === cardA || id === cardB) ? '' : id,
  );
  if (isPyramidWon({ ...state, zones: { ...state.zones, [PYRAMID_ZONE]: { ...state.zones[PYRAMID_ZONE]!, cardIds: pyramidAfter } } })) {
    events.push({ type: 'session/end', winnerId: viewerId });
  }
  return events;
}

function pyramidReadout(state: GameState, _playerId: PlayerId): string | null {
  const pyramidCount = state.zones[PYRAMID_ZONE]?.cardIds.filter((id) => id).length ?? 0;
  const stock = state.zones[PYRAMID_STOCK]?.cardIds.length ?? 0;
  const waste = state.zones[PYRAMID_WASTE]?.cardIds.length ?? 0;
  return `PYRAMID ${pyramidCount}/28 · STOCK ${stock + waste}`;
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
  war: {
    id: 'war',
    actions: warActions,
    apply: warApply,
    readout: warReadout,
  },
  'go-fish': {
    id: 'go-fish',
    actions: goFishActions,
    apply: goFishApply,
    readout: goFishReadout,
  },
  'old-maid': {
    id: 'old-maid',
    actions: oldMaidActions,
    apply: oldMaidApply,
    readout: oldMaidReadout,
  },
  'crazy-eights': {
    id: 'crazy-eights',
    actions: crazyEightsActions,
    apply: crazyEightsApply,
    readout: crazyEightsReadout,
  },
  sevens: {
    id: 'sevens',
    actions: sevensActions,
    apply: sevensApply,
    readout: sevensReadout,
  },
  klondike: {
    id: 'klondike',
    actions: klondikeActions,
    apply: klondikeApply,
    readout: klondikeReadout,
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
    readout: pokerReadout,
  },
  klondike: {
    id: 'klondike',
    actions: klondikeActions,
    apply: klondikeApply,
    readout: klondikeReadout,
  },
  freecell: {
    id: 'freecell',
    actions: freeCellActions,
    apply: freeCellApply,
    readout: freeCellReadout,
  },
  pyramid: {
    id: 'pyramid',
    actions: pyramidActions,
    apply: pyramidApply,
    readout: pyramidReadout,
  },
};

export function getGameRules(presetId: string | null | undefined): GameRules {
  return GAME_RULES[presetId ?? 'freeplay'] ?? GAME_RULES.freeplay!;
}
