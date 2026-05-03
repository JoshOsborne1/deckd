import type { Rank, Suit } from '@lib/types';
import type {
  CardFace,
  CardId,
  CardInstance,
  GameState,
  JokerColor,
  Player,
  PlayerId,
} from './types';
import { ZONE_DISCARD, ZONE_DRAW, handZoneId } from './types';
import { visibleCardsForPlayer } from './state';

const GLYPH_TO_SUIT: Record<string, Suit> = {
  H: 'hearts',
  D: 'diamonds',
  S: 'spades',
  C: 'clubs',
};

/**
 * Parse a standard card ID (e.g. `"H-A"`, `"S-10"`) into rank + suit.
 * Returns `null` for jokers or unrecognised IDs.
 */
export function parseCardId(cardId: CardId): { rank: Rank; suit: Suit } | null {
  const dash = cardId.indexOf('-');
  if (dash < 1) return null;
  const glyph = cardId.slice(0, dash);
  const rank = cardId.slice(dash + 1);
  const suit = GLYPH_TO_SUIT[glyph];
  if (!suit) return null;
  return { rank: rank as Rank, suit };
}

/**
 * Parse joker card IDs (`JK-RED`, `JK-BLACK`). Returns `null` for standard cards.
 */
export function parseJokerId(cardId: CardId): JokerColor | null {
  if (cardId === 'JK-RED') return 'red';
  if (cardId === 'JK-BLACK') return 'black';
  return null;
}

/**
 * Number of cards remaining in the draw pile.
 */
export function selectDrawPileCount(state: GameState): number {
  const zone = state.zones[ZONE_DRAW];
  return zone ? zone.cardIds.length : 0;
}

/**
 * The top (last) card on the discard pile, or `null` if empty.
 */
export function selectDiscardTopCard(state: GameState): CardInstance | null {
  const zone = state.zones[ZONE_DISCARD];
  if (!zone || zone.cardIds.length === 0) return null;
  const topId = zone.cardIds[zone.cardIds.length - 1]!;
  return state.cards[topId] ?? null;
}

/**
 * All players except `localPlayerId`, in stable seat order starting
 * from the seat after local and wrapping around.
 */
export function selectOpponents(state: GameState, localPlayerId: PlayerId): Player[] {
  const local = state.players.find((p) => p.id === localPlayerId);
  if (!local) return state.players.filter((p) => p.id !== localPlayerId);

  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const localIdx = sorted.findIndex((p) => p.id === localPlayerId);
  const after = sorted.slice(localIdx + 1);
  const before = sorted.slice(0, localIdx);
  return [...after, ...before];
}

/**
 * Number of cards in a given player's hand zone.
 */
export function selectOpponentHandSize(state: GameState, playerId: PlayerId): number {
  const zone = state.zones[handZoneId(playerId)];
  return zone ? zone.cardIds.length : 0;
}

/**
 * Card instances in the local player's hand, in hand-zone order.
 */
export function selectLocalHand(state: GameState, localPlayerId: PlayerId): CardInstance[] {
  const zone = state.zones[handZoneId(localPlayerId)];
  if (!zone) return [];
  const result: CardInstance[] = [];
  for (const cid of zone.cardIds) {
    const card = state.cards[cid];
    if (card) result.push(card);
  }
  return result;
}

/**
 * Cards on the table in front of the local player.
 */
export function selectMyTableCards(state: GameState, localPlayerId: PlayerId): CardInstance[] {
  const zoneId = `table:${localPlayerId}`;
  const zone = state.zones[zoneId];
  if (!zone) return [];
  const result: CardInstance[] = [];
  for (const cid of zone.cardIds) {
    const card = state.cards[cid];
    if (card) result.push(card);
  }
  return result;
}

/**
 * The player whose turn it currently is.
 */
export function selectCurrentPlayerId(state: GameState): PlayerId | null {
  return state.currentPlayerId || null;
}

/**
 * Current session phase (idle, playing, paused, ended).
 */
export function selectSessionPhase(state: GameState): GameState['phase'] {
  return state.phase;
}

/**
 * Whether the session has ended.
 */
export function selectIsSessionEnded(state: GameState): boolean {
  return state.phase === 'ended';
}

/**
 * Whether it is the local player's turn.
 */
export function selectIsMyTurn(state: GameState, localPlayerId: PlayerId): boolean {
  return state.currentPlayerId === localPlayerId;
}

/**
 * The next player in seat order after the current player (wraparound).
 * Returns `null` if there are fewer than 2 players.
 */
export function selectNextPlayerId(state: GameState): PlayerId | null {
  if (state.players.length < 2) return null;
  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const idx = sorted.findIndex((p) => p.id === state.currentPlayerId);
  if (idx < 0) return sorted[0]?.id ?? null;
  const next = sorted[(idx + 1) % sorted.length]!;
  return next.id;
}

/**
 * Whether a card should show face-up to the given viewer.
 * Returns `'up'` if the card is visible per zone privacy + card face rules,
 * otherwise `'down'`.
 */
export function selectCardFace(
  state: GameState,
  cardId: CardId,
  viewerId: PlayerId | null,
): CardFace {
  if (!viewerId) return 'down';
  const visible = visibleCardsForPlayer(state, viewerId);
  return visible.has(cardId) ? 'up' : 'down';
}

/**
 * The first card id in the draw pile (top of deck), or `null`.
 */
export function selectDrawTopCardId(state: GameState): CardId | null {
  const zone = state.zones[ZONE_DRAW];
  if (!zone || zone.cardIds.length === 0) return null;
  return zone.cardIds[0] ?? null;
}
