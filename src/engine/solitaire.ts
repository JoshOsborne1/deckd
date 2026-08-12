/**
 * Shared solitaire engine — framework-free, deterministic, unit-tested.
 *
 * Solitaire games (Klondike, FreeCell, Pyramid, Golf) share a small set of
 * mechanics — piles, move validation, win detection — but each has a distinct
 * layout. The Deckd engine is event-sourced (zones + primitive events), so
 * this module stays as pure helpers that operate on GameState: setup, move
 * legality, win detection. The rules layer in rules.ts translates player taps
 * into primitive events; this module never touches the event log.
 *
 * Conventions:
 *   - A "column" is an ordered list of card IDs (index 0 = bottom / first dealt).
 *   - A "foundation" suit slot is 0-3 (hearts/diamonds/clubs/spades by convention).
 *   - All functions are pure: read inputs, return fresh arrays/objects.
 */

import type { GameState, PlayerId, ZoneId, Zone } from './types';
import {
  ZONE_DRAW,
  ZONE_MUCK,
  communalZoneId,
  handZoneId,
  tableZoneId,
} from './types';
import { parseCardId } from './selectors';
import type { Rank, Suit } from '@lib/types';

/**
 * Fold initial deals into their target zones so the zone layout returned to
 * the store already contains every card. `session/start` only creates card
 * instances for cards present in a zone's `cardIds`, so the deals must be
 * pre-populated (the same pattern recipes.ts uses via `applyDealsToZones`).
 * The store then also emits `card/deal` events to set each card's face.
 */
function applyDealsToZones(
  zones: Zone[],
  deals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[],
): Zone[] {
  const byZone = new Map<string, string[]>();
  for (const deal of deals) {
    const list = byZone.get(deal.toZoneId) ?? [];
    list.push(deal.cardId);
    byZone.set(deal.toZoneId, list);
  }
  return zones.map((zone) => {
    const dealtCards = byZone.get(zone.id);
    return dealtCards ? { ...zone, cardIds: [...zone.cardIds, ...dealtCards] } : zone;
  });
}

// ---------------------------------------------------------------------------
// Zone id helpers (solitaire-specific)
// ---------------------------------------------------------------------------

/** Klondike: 7 tableau columns indexed 0-6. */
export function tableauZoneId(index: number): ZoneId {
  return `tableau:${index}`;
}
/** Klondike: 4 foundation slots indexed 0-3. */
export function foundationZoneId(index: number): ZoneId {
  return `foundation:${index}`;
}
/** Klondike: the waste (face-up stock) pile. */
export const ZONE_WASTE: ZoneId = 'solitaire:waste';
/** Klondike: the stock (face-down draw) pile — reuses the core draw zone. */

/** FreeCell: 8 tableau columns indexed 0-7. */
export function freeCellTableauZoneId(index: number): ZoneId {
  return `fc-tableau:${index}`;
}
/** FreeCell: 4 free cells indexed 0-3. */
export function freeCellZoneId(index: number): ZoneId {
  return `free-cell:${index}`;
}
/** FreeCell: 4 foundations indexed 0-3 (shares foundation ids with Klondike). */

/** Pyramid: the 28-card pyramid layout (indices 0-27). */
export const PYRAMID_ZONE: ZoneId = 'pyramid:layout';
/** Pyramid: the stock pile. */
export const PYRAMID_STOCK: ZoneId = 'pyramid:stock';
/** Pyramid: the waste pile. */
export const PYRAMID_WASTE: ZoneId = 'pyramid:waste';

/** Golf: 7 tableau columns (each holds up to 5 cards). */
export const GOLF_TABLEAU_COUNT = 7;
/** Golf: cards per tableau column. */
export const GOLF_COLUMN_DEPTH = 5;
/** Golf: the stock pile. */
export const GOLF_STOCK: ZoneId = 'golf:stock';
/** Golf: the waste pile (cards are played onto this from the tableau). */
export const GOLF_WASTE: ZoneId = 'golf:waste';

/** Golf: tableau column zone id. */
export function golfTableauZoneId(index: number): ZoneId {
  return `golf-tableau:${index}`;
}

// ---------------------------------------------------------------------------
// Card values
// ---------------------------------------------------------------------------

const RANK_INDEX: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13,
};

/** Numeric rank value (A=1 ... K=13). */
export function rankValue(rank: Rank): number {
  return RANK_INDEX[rank] ?? 0;
}

const RED_SUITS: ReadonlySet<Suit> = new Set(['hearts', 'diamonds']);

export function isRedSuit(suit: Suit): boolean {
  return RED_SUITS.has(suit);
}

/** Klondike/tableau stacking: descending rank, alternating colour. */
export function canStackOnTableau(movingCardId: string, targetCardId: string): boolean {
  const moving = parseCardId(movingCardId);
  const target = parseCardId(targetCardId);
  if (!moving || !target) return false;
  if (rankValue(moving.rank) !== rankValue(target.rank) - 1) return false;
  return isRedSuit(moving.suit) !== isRedSuit(target.suit);
}

// ---------------------------------------------------------------------------
// Klondike setup
// ---------------------------------------------------------------------------

export interface KlondikeLayout {
  zones: Zone[];
  /** The initial card/deal list consumed by executeRecipe-style setup. */
  initialDeals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[];
}

/**
 * Build the Klondike layout from a deck order.
 *
 * Deal pattern: column i gets (i+1) cards; only the top card is face-up.
 * The remaining 24 cards become the stock (draw pile).
 *
 * The function does NOT take a player list — Klondike is strictly solo and
 * the rules layer enforces a single-seat session.
 */
export function buildKlondikeLayout(deckOrder: string[], playerId: PlayerId): KlondikeLayout {
  const zones: Zone[] = [
    // Stock = the core draw zone (the store reuses ZONE_DRAW for shuffling).
    { id: ZONE_DRAW, label: 'Stock', visibility: { kind: 'hidden' }, cardIds: [] },
    // Waste.
    { id: ZONE_WASTE, label: 'Waste', visibility: { kind: 'public' }, cardIds: [] },
    // Hand zone for the single player (kept for consistency with engine invariants).
    { id: handZoneId(playerId), label: 'Your hand', visibility: { kind: 'private', ownerId: playerId }, ownerId: playerId, cardIds: [] },
    { id: tableZoneId(playerId), label: 'Your table', visibility: { kind: 'public' }, ownerId: playerId, cardIds: [] },
    { id: communalZoneId(0), label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
  ];
  for (let i = 0; i < 7; i += 1) {
    zones.push({
      id: tableauZoneId(i),
      label: `Tableau ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }
  for (let i = 0; i < 4; i += 1) {
    zones.push({
      id: foundationZoneId(i),
      label: `Foundation ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }

  const initialDeals: KlondikeLayout['initialDeals'] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const cardId = deckOrder[cursor++];
      if (!cardId) continue;
      const isTop = row === col;
      initialDeals.push({
        cardId,
        toZoneId: tableauZoneId(col),
        face: isTop ? 'up' : 'down',
      });
    }
  }
  // Remaining 24 cards become the stock.
  while (cursor < deckOrder.length) {
    const cardId = deckOrder[cursor++];
    if (!cardId) continue;
    initialDeals.push({ cardId, toZoneId: ZONE_DRAW, face: 'down' });
  }

  return { zones: applyDealsToZones(zones, initialDeals), initialDeals };
}

// ---------------------------------------------------------------------------
// Klondike win detection
// ---------------------------------------------------------------------------

/** Klondike is won when all 4 foundations have 13 cards. */
export function isKlondikeWon(state: GameState): boolean {
  for (let i = 0; i < 4; i += 1) {
    const zone = state.zones[foundationZoneId(i)];
    if (!zone || zone.cardIds.length !== 13) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Klondike move legality (tap-to-move source selection)
// ---------------------------------------------------------------------------

/**
 * The face-up run of cards on top of a tableau column (the movable sequence).
 * Returns the card ids from the first face-up card to the top, in order.
 */
export function tableauRun(state: GameState, columnIndex: number): string[] {
  const zone = state.zones[tableauZoneId(columnIndex)];
  if (!zone) return [];
  const cardIds = zone.cardIds;
  let start = cardIds.length;
  for (let i = cardIds.length - 1; i >= 0; i -= 1) {
    const card = state.cards[cardIds[i]!];
    if (!card || card.face !== 'up') break;
    start = i;
  }
  return cardIds.slice(start);
}

/** Can the given run of cards be moved onto tableau column `targetColumn`? */
export function canMoveRunToTableau(
  state: GameState,
  run: string[],
  targetColumn: number,
): boolean {
  if (run.length === 0) return false;
  const targetZone = state.zones[tableauZoneId(targetColumn)];
  if (!targetZone) return false;
  const bottomCardId = run[0]!;
  if (targetZone.cardIds.length === 0) {
    // Empty column: only a King (or a run starting with a King) may move.
    const parsed = parseCardId(bottomCardId);
    return parsed?.rank === 'K';
  }
  const topCardId = targetZone.cardIds[targetZone.cardIds.length - 1]!;
  return canStackOnTableau(bottomCardId, topCardId);
}

/** Can `cardId` be placed on foundation `foundationIndex`? */
export function canMoveCardToFoundation(
  state: GameState,
  cardId: string,
  foundationIndex: number,
): boolean {
  const parsed = parseCardId(cardId);
  if (!parsed) return false;
  const zone = state.zones[foundationZoneId(foundationIndex)];
  if (!zone) return false;
  if (zone.cardIds.length === 0) return parsed.rank === 'A';
  const topCardId = zone.cardIds[zone.cardIds.length - 1]!;
  const top = parseCardId(topCardId);
  if (!top) return false;
  return top.suit === parsed.suit && rankValue(parsed.rank) === rankValue(top.rank) + 1;
}

// ---------------------------------------------------------------------------
// FreeCell setup
// ---------------------------------------------------------------------------

export interface FreeCellLayout {
  zones: Zone[];
  initialDeals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[];
}

/**
 * Build the FreeCell layout. 8 columns: the first 4 get 7 cards, the last 4
 * get 6 cards (52 total). All cards are face-up.
 */
export function buildFreeCellLayout(deckOrder: string[], playerId: PlayerId): FreeCellLayout {
  const zones: Zone[] = [
    { id: handZoneId(playerId), label: 'Your hand', visibility: { kind: 'private', ownerId: playerId }, ownerId: playerId, cardIds: [] },
    { id: tableZoneId(playerId), label: 'Your table', visibility: { kind: 'public' }, ownerId: playerId, cardIds: [] },
    { id: communalZoneId(0), label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_DRAW, label: 'Draw', visibility: { kind: 'hidden' }, cardIds: [] },
  ];
  for (let i = 0; i < 8; i += 1) {
    zones.push({
      id: freeCellTableauZoneId(i),
      label: `Column ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }
  for (let i = 0; i < 4; i += 1) {
    zones.push({
      id: freeCellZoneId(i),
      label: `Free cell ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }
  for (let i = 0; i < 4; i += 1) {
    zones.push({
      id: foundationZoneId(i),
      label: `Foundation ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }

  const initialDeals: FreeCellLayout['initialDeals'] = [];
  let cursor = 0;
  for (let col = 0; col < 8; col += 1) {
    const count = col < 4 ? 7 : 6;
    for (let row = 0; row < count; row += 1) {
      const cardId = deckOrder[cursor++];
      if (!cardId) continue;
      initialDeals.push({ cardId, toZoneId: freeCellTableauZoneId(col), face: 'up' });
    }
  }
  return { zones: applyDealsToZones(zones, initialDeals), initialDeals };
}

// ---------------------------------------------------------------------------
// FreeCell move legality
// ---------------------------------------------------------------------------

/**
 * Max movable run size in FreeCell. Doubled by empty columns as a common
 * optimisation: (free cells + 1) * 2^(empty target columns). We use the
 * standard (free cells + 1) formula for the base, then multiply by 2 for each
 * empty column that is not the destination.
 */
export function freeCellMaxRun(state: GameState, targetColumn: number): number {
  let freeCells = 0;
  for (let i = 0; i < 4; i += 1) {
    const zone = state.zones[freeCellZoneId(i)];
    if (zone && zone.cardIds.length === 0) freeCells += 1;
  }
  let emptyColumns = 0;
  for (let i = 0; i < 8; i += 1) {
    if (i === targetColumn) continue;
    const zone = state.zones[freeCellTableauZoneId(i)];
    if (zone && zone.cardIds.length === 0) emptyColumns += 1;
  }
  return (freeCells + 1) * 2 ** emptyColumns;
}

/** Can a run of cards be moved onto FreeCell column `targetColumn`? */
export function canMoveRunToFreeCellColumn(
  state: GameState,
  run: string[],
  targetColumn: number,
): boolean {
  if (run.length === 0) return false;
  const targetZone = state.zones[freeCellTableauZoneId(targetColumn)];
  if (!targetZone) return false;
  if (run.length > freeCellMaxRun(state, targetColumn)) return false;
  // The run must itself be a valid descending alternating sequence.
  for (let i = 0; i < run.length - 1; i += 1) {
    if (!canStackOnTableau(run[i + 1]!, run[i]!)) return false;
  }
  const bottomCardId = run[0]!;
  if (targetZone.cardIds.length === 0) return true; // empty accepts anything
  const topCardId = targetZone.cardIds[targetZone.cardIds.length - 1]!;
  return canStackOnTableau(bottomCardId, topCardId);
}

/** The full face-up run of a FreeCell column (all cards are face-up). */
export function freeCellColumnRun(state: GameState, columnIndex: number): string[] {
  const zone = state.zones[freeCellTableauZoneId(columnIndex)];
  return zone ? zone.cardIds.slice() : [];
}

// ---------------------------------------------------------------------------
// FreeCell win detection
// ---------------------------------------------------------------------------

export function isFreeCellWon(state: GameState): boolean {
  for (let i = 0; i < 4; i += 1) {
    const zone = state.zones[foundationZoneId(i)];
    if (!zone || zone.cardIds.length !== 13) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pyramid setup
// ---------------------------------------------------------------------------

export interface PyramidLayout {
  zones: Zone[];
  initialDeals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[];
}

/**
 * Build the Pyramid layout. 28 cards in a 7-row pyramid (rows 1-7), the
 * remaining 24 cards form the stock. All pyramid cards are face-up.
 */
export function buildPyramidLayout(deckOrder: string[], playerId: PlayerId): PyramidLayout {
  const zones: Zone[] = [
    { id: handZoneId(playerId), label: 'Your hand', visibility: { kind: 'private', ownerId: playerId }, ownerId: playerId, cardIds: [] },
    { id: tableZoneId(playerId), label: 'Your table', visibility: { kind: 'public' }, ownerId: playerId, cardIds: [] },
    { id: communalZoneId(0), label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_DRAW, label: 'Draw', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: PYRAMID_ZONE, label: 'Pyramid', visibility: { kind: 'public' }, cardIds: [] },
    { id: PYRAMID_STOCK, label: 'Stock', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: PYRAMID_WASTE, label: 'Waste', visibility: { kind: 'public' }, cardIds: [] },
    // Muck (removed cards). The pyramid rules move paired/removed cards here;
    // `canApplyEvent` requires the target zone to exist or the move silently no-ops.
    { id: ZONE_MUCK, label: 'Muck', visibility: { kind: 'hidden' }, cardIds: [] },
  ];

  const initialDeals: PyramidLayout['initialDeals'] = [];
  let cursor = 0;
  for (let i = 0; i < 28; i += 1) {
    const cardId = deckOrder[cursor++];
    if (!cardId) continue;
    initialDeals.push({ cardId, toZoneId: PYRAMID_ZONE, face: 'up' });
  }
  while (cursor < deckOrder.length) {
    const cardId = deckOrder[cursor++];
    if (!cardId) continue;
    initialDeals.push({ cardId, toZoneId: PYRAMID_STOCK, face: 'down' });
  }
  return { zones: applyDealsToZones(zones, initialDeals), initialDeals };
}

// ---------------------------------------------------------------------------
// Pyramid geometry
// ---------------------------------------------------------------------------

/**
 * Pyramid index layout (0-based, row-major):
 *   row 0: index 0
 *   row 1: indices 1, 2
 *   row 2: indices 3, 4, 5
 *   ...
 *   row 6: indices 21..27
 *
 * A card is "free" (removable) when no card is directly on top of it. The two
 * children of card at index i (in row r) are at row r+1: left child and right
 * child. Specifically, row r starts at index r*(r+1)/2, and card i's children
 * are at (i + rowStartOfNextRow) and (i + rowStartOfNextRow + 1) where
 * rowStartOfNextRow = (r+1)*(r+2)/2.
 */

/** Row that contains pyramid index i (0-based). */
export function pyramidRow(index: number): number {
  return Math.floor((Math.sqrt(8 * index + 1) - 1) / 2);
}

/** First index of a given row (0-based row). */
function rowStart(row: number): number {
  return (row * (row + 1)) / 2;
}

/** The two child indices of pyramid card `index`, or [] if it's in the bottom row. */
export function pyramidChildren(index: number): number[] {
  const row = pyramidRow(index);
  const nextRowStart = rowStart(row + 1);
  if (row >= 6) return [];
  return [nextRowStart + (index - rowStart(row)), nextRowStart + (index - rowStart(row)) + 1];
}

/** Whether the pyramid card at `index` is free (both children removed/absent). */
export function isPyramidCardFree(state: GameState, index: number): boolean {
  const zone = state.zones[PYRAMID_ZONE];
  if (!zone) return false;
  if (index >= zone.cardIds.length) return false;
  const children = pyramidChildren(index);
  if (children.length === 0) return true;
  return children.every((childIndex) => {
    const cardId = zone.cardIds[childIndex];
    return !cardId; // removed cards are absent from the zone
  });
}

/** Indices of all currently-free pyramid cards. */
export function freePyramidIndices(state: GameState): number[] {
  const zone = state.zones[PYRAMID_ZONE];
  if (!zone) return [];
  const free: number[] = [];
  for (let i = 0; i < zone.cardIds.length; i += 1) {
    if (zone.cardIds[i] && isPyramidCardFree(state, i)) free.push(i);
  }
  return free;
}

/** Pyramid card-value (A=1 ... J=11, Q=12, K=13). */
function pyramidCardValue(cardId: string): number {
  const parsed = parseCardId(cardId);
  if (!parsed) return 0;
  return rankValue(parsed.rank);
}

/** Do two cards sum to 13? (Kings = 13 alone, so a single King is a valid pair.) */
export function pyramidPairMatches(cardIdA: string, cardIdB: string): boolean {
  return pyramidCardValue(cardIdA) + pyramidCardValue(cardIdB) === 13;
}

/** A King pairs with itself (value 13) — removed alone. */
export function isKing(cardId: string): boolean {
  return pyramidCardValue(cardId) === 13;
}

// ---------------------------------------------------------------------------
// Pyramid win detection
// ---------------------------------------------------------------------------

/** Pyramid is won when the pyramid zone is empty. */
export function isPyramidWon(state: GameState): boolean {
  const zone = state.zones[PYRAMID_ZONE];
  return !zone || zone.cardIds.every((id) => !id);
}

// ---------------------------------------------------------------------------
// Golf setup
// ---------------------------------------------------------------------------

export interface GolfLayout {
  zones: Zone[];
  initialDeals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[];
}

/**
 * Build the Golf layout. 35 cards in a 7x5 face-up tableau, the remaining
 * 17 cards form the face-down stock. The waste starts empty.
 */
export function buildGolfLayout(deckOrder: string[], playerId: PlayerId): GolfLayout {
  const zones: Zone[] = [
    { id: handZoneId(playerId), label: 'Your hand', visibility: { kind: 'private', ownerId: playerId }, ownerId: playerId, cardIds: [] },
    { id: tableZoneId(playerId), label: 'Your table', visibility: { kind: 'public' }, ownerId: playerId, cardIds: [] },
    { id: communalZoneId(0), label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_DRAW, label: 'Draw', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: GOLF_STOCK, label: 'Stock', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: GOLF_WASTE, label: 'Waste', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_MUCK, label: 'Muck', visibility: { kind: 'hidden' }, cardIds: [] },
  ];
  for (let i = 0; i < GOLF_TABLEAU_COUNT; i += 1) {
    zones.push({
      id: golfTableauZoneId(i),
      label: `Column ${i + 1}`,
      visibility: { kind: 'public' },
      cardIds: [],
    });
  }

  const initialDeals: GolfLayout['initialDeals'] = [];
  let cursor = 0;
  for (let col = 0; col < GOLF_TABLEAU_COUNT; col += 1) {
    for (let row = 0; row < GOLF_COLUMN_DEPTH; row += 1) {
      const cardId = deckOrder[cursor++];
      if (!cardId) continue;
      initialDeals.push({ cardId, toZoneId: golfTableauZoneId(col), face: 'up' });
    }
  }
  while (cursor < deckOrder.length) {
    const cardId = deckOrder[cursor++];
    if (!cardId) continue;
    initialDeals.push({ cardId, toZoneId: GOLF_STOCK, face: 'down' });
  }
  return { zones: applyDealsToZones(zones, initialDeals), initialDeals };
}

// ---------------------------------------------------------------------------
// Golf win detection + move legality
// ---------------------------------------------------------------------------

/** Golf is won when every tableau column is empty. */
export function isGolfWon(state: GameState): boolean {
  for (let i = 0; i < GOLF_TABLEAU_COUNT; i += 1) {
    const zone = state.zones[golfTableauZoneId(i)];
    if (!zone || zone.cardIds.length > 0) return false;
  }
  return true;
}

/** Golf card-value (A=1 ... Q=12, K=13). */
function golfCardValue(cardId: string): number {
  const parsed = parseCardId(cardId);
  if (!parsed) return 0;
  return rankValue(parsed.rank);
}

/** Can `cardId` play onto the current waste top? Adjacent rank, with A-K wrap. */
export function golfPlaysOnWaste(cardId: string, wasteTopId: string | undefined): boolean {
  if (!wasteTopId) return false; // the waste must be opened by a stock draw
  const card = golfCardValue(cardId);
  const top = golfCardValue(wasteTopId);
  if (card === 0 || top === 0) return false;
  if (card === 13 || top === 13) return false; // Kings never play
  const diff = Math.abs(card - top);
  return diff === 1 || diff === 12; // adjacent, or A-K wrap
}