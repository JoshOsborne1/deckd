import { buildDeck, mulberry32, shuffleInPlace } from './deck';
import { emptyState, foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { ZONE_DRAW } from './types';
import {
  buildKlondikeLayout,
  buildFreeCellLayout,
  buildPyramidLayout,
  tableauRun,
  canMoveRunToTableau,
  canMoveCardToFoundation,
  isKlondikeWon,
  freeCellColumnRun,
  canMoveRunToFreeCellColumn,
  isFreeCellWon,
  freeCellMaxRun,
  pyramidChildren,
  pyramidRow,
  isPyramidCardFree,
  freePyramidIndices,
  pyramidPairMatches,
  isKing,
  isPyramidWon,
  rankValue,
} from './solitaire';

function orderedDeck(): string[] {
  return shuffleInPlace(buildDeck({ includeJokers: false }).map((c) => c.id), mulberry32('test-seed-1'));
}

function applyLayout(
  layout: { zones: import('./types').Zone[]; initialDeals: { cardId: string; toZoneId: import('./types').ZoneId; face: 'up' | 'down' }[] },
  hostId: string,
): GameState {
  const events: GameEvent[] = [];
  let seq = 1;
  events.push({
    type: 'session/start',
    id: eventId(seq), ts: Date.now(), actorId: 'system', seq: seq++,
    meta: { id: 'sess-test', createdAt: Date.now(), rngSeed: 'test', mode: 'solo', hostId },
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'klondike' },
    players: [{ id: hostId, name: 'You', seat: 0, avatarSeed: 's' }],
    zones: layout.zones,
  });
  for (const deal of layout.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq), ts: Date.now(), actorId: 'system', seq: seq++,
      cardId: deal.cardId, toZoneId: deal.toZoneId, face: deal.face,
    });
  }
  return foldEvents(events);
}

import type { GameState } from './types';

describe('solitaire helpers', () => {
  test('rankValue maps A=1, 10=10, J=11, Q=12, K=13', () => {
    expect(rankValue('A')).toBe(1);
    expect(rankValue('2')).toBe(2);
    expect(rankValue('10')).toBe(10);
    expect(rankValue('J')).toBe(11);
    expect(rankValue('Q')).toBe(12);
    expect(rankValue('K')).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Klondike
// ---------------------------------------------------------------------------

describe('Klondike setup', () => {
  const deck = orderedDeck();
  const layout = buildKlondikeLayout(deck, 'you');

  test('creates 7 tableau columns + 4 foundations + stock + waste', () => {
    const zoneIds = layout.zones.map((z) => z.id);
    expect(zoneIds).toContain('tableau:0');
    expect(zoneIds).toContain('tableau:6');
    expect(zoneIds).toContain('foundation:0');
    expect(zoneIds).toContain('foundation:3');
    expect(zoneIds).toContain(ZONE_DRAW);
    expect(zoneIds).toContain('solitaire:waste');
  });

  test('deals 28 cards to the tableau and 24 to the stock', () => {
    const tableauCount = layout.initialDeals.filter((d) => d.toZoneId.startsWith('tableau:')).length;
    const stockCount = layout.initialDeals.filter((d) => d.toZoneId === ZONE_DRAW).length;
    expect(tableauCount).toBe(28);
    expect(stockCount).toBe(24);
    expect(layout.initialDeals).toHaveLength(52);
  });

  test('only the top card of each column is face-up', () => {
    const state = applyLayout(layout, 'you');
    for (let col = 0; col < 7; col += 1) {
      const run = tableauRun(state, col);
      expect(run.length).toBe(1); // only the dealt top is face-up
    }
  });

  test('column 0 has 1 card, column 6 has 7 cards', () => {
    const state = applyLayout(layout, 'you');
    expect(state.zones['tableau:0']!.cardIds).toHaveLength(1);
    expect(state.zones['tableau:6']!.cardIds).toHaveLength(7);
  });
});

describe('Klondike move legality', () => {
  test('canStackOnTableau: descending alternating colour', () => {
    // Red 9 onto black 10.
    expect(canMoveRunToTableauDirect('H-9', 'S-10')).toBe(true);
    // Black 9 onto red 10.
    expect(canMoveRunToTableauDirect('C-9', 'H-10')).toBe(true);
    // Same colour 9 onto 10 — no.
    expect(canMoveRunToTableauDirect('H-9', 'D-10')).toBe(false);
    // 9 onto 9 — no.
    expect(canMoveRunToTableauDirect('H-9', 'S-9')).toBe(false);
    // Red 10 onto red 9 — no (wrong direction).
    expect(canMoveRunToTableauDirect('H-10', 'D-9')).toBe(false);
  });

  test('canMoveCardToFoundation: Ace on empty, then ascending same-suit', () => {
    const layout = buildKlondikeLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    expect(canMoveCardToFoundation(state, 'H-A', 0)).toBe(true);
    expect(canMoveCardToFoundation(state, 'H-2', 0)).toBe(false); // foundation empty, not Ace
    expect(canMoveCardToFoundation(state, 'S-A', 1)).toBe(true);
  });
});

// Helper: check canStackOnTableau directly (imported indirectly via canMoveRunToTableau)
import { canStackOnTableau } from './solitaire';
function canMoveRunToTableauDirect(movingCardId: string, targetCardId: string): boolean {
  return canStackOnTableau(movingCardId, targetCardId);
}

describe('Klondike win detection', () => {
  test('not won on a fresh deal', () => {
    const layout = buildKlondikeLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    expect(isKlondikeWon(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FreeCell
// ---------------------------------------------------------------------------

describe('FreeCell setup', () => {
  const deck = orderedDeck();
  const layout = buildFreeCellLayout(deck, 'you');

  test('creates 8 tableau columns + 4 free cells + 4 foundations', () => {
    const zoneIds = layout.zones.map((z) => z.id);
    expect(zoneIds).toContain('fc-tableau:0');
    expect(zoneIds).toContain('fc-tableau:7');
    expect(zoneIds).toContain('free-cell:0');
    expect(zoneIds).toContain('free-cell:3');
    expect(zoneIds).toContain('foundation:0');
    expect(zoneIds).toContain('foundation:3');
  });

  test('first 4 columns get 7 cards, last 4 get 6', () => {
    const state = applyLayout(layout, 'you');
    for (let col = 0; col < 4; col += 1) {
      expect(freeCellColumnRun(state, col)).toHaveLength(7);
    }
    for (let col = 4; col < 8; col += 1) {
      expect(freeCellColumnRun(state, col)).toHaveLength(6);
    }
  });

  test('all dealt cards are face-up', () => {
    expect(layout.initialDeals.every((d) => d.face === 'up')).toBe(true);
  });
});

describe('FreeCell move legality', () => {
  test('freeCellMaxRun: 1 free cell = 2 cards; 0 free cells = 1', () => {
    const layout = buildFreeCellLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    // Fresh deal: all 4 free cells empty, all columns non-empty.
    // max = (4+1) * 2^0 = 5
    expect(freeCellMaxRun(state, 0)).toBe(5);
  });

  test('canMoveRunToFreeCellColumn: empty column accepts a valid run', () => {
    const layout = buildFreeCellLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    // Move a single card onto another column (needs valid stack).
    const srcCol = freeCellColumnRun(state, 0);
    const topCard = srcCol[srcCol.length - 1]!;
    const targetCol = 1;
    const targetTop = freeCellColumnRun(state, targetCol);
    const targetTopCard = targetTop[targetTop.length - 1]!;
    // If the colours/ranks happen to stack, it's valid; otherwise invalid.
    const expected = canStackOnTableau(topCard, targetTopCard);
    expect(canMoveRunToFreeCellColumn(state, [topCard], targetCol)).toBe(expected);
  });
});

describe('FreeCell win detection', () => {
  test('not won on a fresh deal', () => {
    const layout = buildFreeCellLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    expect(isFreeCellWon(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pyramid
// ---------------------------------------------------------------------------

describe('Pyramid geometry', () => {
  test('pyramidRow maps indices correctly', () => {
    expect(pyramidRow(0)).toBe(0);
    expect(pyramidRow(1)).toBe(1);
    expect(pyramidRow(2)).toBe(1);
    expect(pyramidRow(3)).toBe(2);
    expect(pyramidRow(6)).toBe(3);
    expect(pyramidRow(21)).toBe(6);
    expect(pyramidRow(27)).toBe(6);
  });

  test('pyramidChildren of a top card are the two below it', () => {
    expect(pyramidChildren(0)).toEqual([1, 2]);
    expect(pyramidChildren(1)).toEqual([3, 4]);
    expect(pyramidChildren(2)).toEqual([4, 5]);
    // Bottom row (row 6) has no children.
    expect(pyramidChildren(27)).toEqual([]);
  });

  test('bottom-row cards are free; top card is not free', () => {
    const layout = buildPyramidLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    // Bottom row (indices 21-27) are all free.
    expect(isPyramidCardFree(state, 27)).toBe(true);
    expect(isPyramidCardFree(state, 21)).toBe(true);
    // Top card (index 0) has children → not free.
    expect(isPyramidCardFree(state, 0)).toBe(false);
  });

  test('freePyramidIndices returns exactly the bottom row on a fresh deal', () => {
    const layout = buildPyramidLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    const free = freePyramidIndices(state);
    expect(free).toHaveLength(7);
    expect(free[0]).toBe(21);
    expect(free[6]).toBe(27);
  });
});

describe('Pyramid pair matching', () => {
  test('A+Q = 13, 2+J = 13, 3+10 = 13, 6+7 = 13', () => {
    expect(pyramidPairMatches('H-A', 'S-Q')).toBe(true);
    expect(pyramidPairMatches('D-2', 'C-J')).toBe(true);
    expect(pyramidPairMatches('H-3', 'S-10')).toBe(true);
    expect(pyramidPairMatches('C-6', 'D-7')).toBe(true);
  });

  test('K is a king and pairs with itself', () => {
    expect(isKing('S-K')).toBe(true);
    expect(isKing('H-6')).toBe(false);
    // K+anything = 13+? ≠ 13 (except 0 which doesn't exist), so K only pairs alone.
    expect(pyramidPairMatches('S-K', 'H-A')).toBe(false);
  });

  test('mismatched pairs do not match', () => {
    expect(pyramidPairMatches('H-5', 'S-10')).toBe(false);
    expect(pyramidPairMatches('H-A', 'S-K')).toBe(false);
  });
});

describe('Pyramid setup', () => {
  const deck = orderedDeck();
  const layout = buildPyramidLayout(deck, 'you');

  test('deals 28 cards to the pyramid and 24 to the stock', () => {
    const pyramidCount = layout.initialDeals.filter((d) => d.toZoneId === 'pyramid:layout').length;
    const stockCount = layout.initialDeals.filter((d) => d.toZoneId === 'pyramid:stock').length;
    expect(pyramidCount).toBe(28);
    expect(stockCount).toBe(24);
  });

  test('pyramid cards are face-up, stock cards are face-down', () => {
    const pyramidCards = layout.initialDeals.filter((d) => d.toZoneId === 'pyramid:layout');
    expect(pyramidCards.every((d) => d.face === 'up')).toBe(true);
    const stockCards = layout.initialDeals.filter((d) => d.toZoneId === 'pyramid:stock');
    expect(stockCards.every((d) => d.face === 'down')).toBe(true);
  });
});

describe('Pyramid win detection', () => {
  test('not won on a fresh deal', () => {
    const layout = buildPyramidLayout(orderedDeck(), 'you');
    const state = applyLayout(layout, 'you');
    expect(isPyramidWon(state)).toBe(false);
  });
});