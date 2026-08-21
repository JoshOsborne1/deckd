import { buildDeck, mulberry32, shuffleInPlace } from './deck';
import { foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { ZONE_DRAW } from './types';
import { freeCellPreset, golfPreset, pyramidPreset } from './presets';
import { getGameRules, encodeMoveAction } from './rules';
import {
  PYRAMID_ZONE,
  PYRAMID_STOCK,
  PYRAMID_WASTE,
  freeCellTableauZoneId,
  freeCellZoneId,
  pyramidPairMatches,
  freePyramidIndices,
  GOLF_STOCK,
  GOLF_WASTE,
  golfTableauZoneId,
} from './solitaire';
import type { GameState } from './types';

function buildSolitaireEvents(presetId: 'freecell' | 'pyramid' | 'golf', seed = 'test-solitaire-seed'): { events: GameEvent[]; state: GameState } {
  const deckOrder = shuffleInPlace(
    buildDeck({ includeJokers: false }).map((c) => c.id),
    mulberry32(seed),
  );
  const playerObjs = [{ id: 'you', name: 'You', seat: 0, avatarSeed: 's' }];
  const preset = presetId === 'freecell' ? freeCellPreset : presetId === 'pyramid' ? pyramidPreset : golfPreset;
  const setup = preset.setup({
    players: playerObjs,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId },
    deckOrder,
  });

  const events: GameEvent[] = [];
  let seq = 1;
  events.push({
    type: 'session/start',
    id: eventId(seq), ts: Date.now(), actorId: 'system', seq: seq++,
    meta: { id: `sess-${seed}`, createdAt: Date.now(), rngSeed: seed, mode: 'solo', hostId: 'you' },
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId },
    players: playerObjs,
    zones: setup.zones,
  });
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq), ts: Date.now(), actorId: 'system', seq: seq++,
      cardId: deal.cardId, toZoneId: deal.toZoneId, face: deal.face,
    });
  }
  return { events, state: foldEvents(events) };
}

/** Apply primitive events to an existing (events, state) pair and return the new state. */
function applyEvents(prevEvents: GameEvent[], state: GameState, primitives: { type: 'card/move'; cardId: string; toZoneId: string; face: 'up' | 'down' }[]): GameState {
  let seq = prevEvents.length + 1;
  const next: GameEvent[] = primitives.map((p) => ({
    type: 'card/move',
    id: eventId(seq++), ts: Date.now(), actorId: 'system', seq: seq - 1,
    cardId: p.cardId, toZoneId: p.toZoneId as never, face: p.face,
  }));
  return foldEvents([...prevEvents, ...next]);
}

describe('FreeCell rules', () => {
  test('a single card can move to an empty free cell', () => {
    const { state } = buildSolitaireEvents('freecell');
    const rules = getGameRules('freecell');
    const col0Ids = state.zones[freeCellTableauZoneId(0)]!.cardIds;
    const topCard = col0Ids[col0Ids.length - 1]!;
    const move = encodeMoveAction(freeCellTableauZoneId(0), freeCellZoneId(0));
    const result = rules.apply(move, state, 'you');
    expect(result).not.toBeNull();
    expect(result![0]!.type).toBe('card/move');
    expect(result![0]!.cardId).toBe(topCard);
    expect(result![0]!.toZoneId).toBe(freeCellZoneId(0));
  });

  test('a free cell cannot receive more than one card', () => {
    const { state, events } = buildSolitaireEvents('freecell');
    const rules = getGameRules('freecell');
    const fillResult = rules.apply(encodeMoveAction(freeCellTableauZoneId(0), freeCellZoneId(0)), state, 'you')!;
    const stateAfter = applyEvents(events, state, [{ type: 'card/move', cardId: fillResult[0]!.cardId!, toZoneId: freeCellZoneId(0), face: 'up' }]);
    // The free cell is now occupied.
    expect(stateAfter.zones[freeCellZoneId(0)]!.cardIds).toHaveLength(1);
    // Try to move another card to the same free cell.
    const move = encodeMoveAction(freeCellTableauZoneId(1), freeCellZoneId(0));
    const result = rules.apply(move, stateAfter, 'you');
    expect(result).toBeNull();
  });

  test('end action returns null unless the game is won', () => {
    const { state } = buildSolitaireEvents('freecell');
    const rules = getGameRules('freecell');
    expect(rules.apply('end', state, 'you')).toBeNull();
  });

  test('freecell readout shows free cells and foundation count', () => {
    const { state } = buildSolitaireEvents('freecell');
    const rules = getGameRules('freecell');
    const readout = rules.readout!(state, 'you');
    expect(readout).toContain('FREE 4/4');
    expect(readout).toContain('FOUNDATION 0/52');
  });
});

describe('Pyramid rules', () => {
  test('cycleStock moves the top stock card to the waste face-up', () => {
    const { state } = buildSolitaireEvents('pyramid');
    const rules = getGameRules('pyramid');
    const stockBefore = state.zones[PYRAMID_STOCK]!.cardIds.length;
    const result = rules.apply('cycleStock', state, 'you');
    expect(result).toHaveLength(1);
    expect(result![0]!.type).toBe('card/move');
    expect(result![0]!.toZoneId).toBe(PYRAMID_WASTE);
    expect(result![0]!.face).toBe('up');
    expect(state.zones[PYRAMID_STOCK]!.cardIds.length).toBe(stockBefore); // pure: state unchanged
  });

  test('a King in the bottom row can be removed alone', () => {
    const { state, events } = buildSolitaireEvents('pyramid');
    void events;
    const rules = getGameRules('pyramid');
    const pyramid = state.zones[PYRAMID_ZONE]!;
    let kingIndex = -1;
    for (let i = 21; i <= 27; i += 1) {
      const cardId = pyramid.cardIds[i];
      if (cardId && cardId.endsWith('-K')) {
        kingIndex = i;
        break;
      }
    }
    if (kingIndex >= 0) {
      const play = `play:${kingIndex}:` as never;
      const result = rules.apply(play, state, 'you');
      expect(result).not.toBeNull();
      expect(result!.some((e) => e.cardId === pyramid.cardIds[kingIndex])).toBe(true);
      // All removed cards go to the muck.
      expect(result!.every((e) => e.type === 'card/move' && e.toZoneId === 'muck')).toBe(true);
    } else {
      // No free King in the bottom row for this seed — a non-King play returns null.
      const play = `play:27:` as never;
      const result = rules.apply(play, state, 'you');
      expect(result).toBeNull();
    }
  });

  test('end action returns null unless the pyramid is cleared', () => {
    const { state } = buildSolitaireEvents('pyramid');
    const rules = getGameRules('pyramid');
    expect(rules.apply('end', state, 'you')).toBeNull();
  });

  test('pyramid readout shows pyramid and stock counts', () => {
    const { state } = buildSolitaireEvents('pyramid');
    const rules = getGameRules('pyramid');
    const readout = rules.readout!(state, 'you');
    expect(readout).toContain('PYRAMID 28/28');
    expect(readout).toContain('STOCK 24');
  });

  test('REGRESSION: removing a pyramid card preserves stable indices (no filter shift)', () => {
    // The pyramid rules emit card/move to the muck zone. The state reducer MUST
    // leave an empty-string slot at the card's original index (NOT filter it out),
    // or every subsequent index shifts and the pyramid geometry corrupts.
    // This folds the returned events through the real reducer and checks.
    const { state, events } = buildSolitaireEvents('pyramid');
    const rules = getGameRules('pyramid');
    const pyramid = state.zones[PYRAMID_ZONE]!;

    // Find a free King in the bottom row (indices 21-27).
    let kingIdx = -1;
    for (let i = 21; i <= 27; i += 1) {
      const cardId = pyramid.cardIds[i];
      if (cardId && cardId.endsWith('-K')) { kingIdx = i; break; }
    }
    // If this seed has no free King, find any free pair instead.
    if (kingIdx < 0) {
      // Find two free bottom-row cards that pair to 13.
      let idxA = -1, idxB = -1;
      for (let i = 21; i <= 27 && idxA < 0; i += 1) {
        for (let j = i + 1; j <= 27; j += 1) {
          const a = pyramid.cardIds[i], b = pyramid.cardIds[j];
          if (a && b && pyramidPairMatches(a, b)) { idxA = i; idxB = j; break; }
        }
      }
      expect(idxA).toBeGreaterThanOrEqual(0);
      const play = `play:${idxA}:${idxB}` as never;
      const result = rules.apply(play, state, 'you');
      expect(result).not.toBeNull();
      const after = applyEvents(events, state, result!.filter((e) => e.type === 'card/move').map((e) => ({ type: 'card/move' as const, cardId: e.cardId!, toZoneId: e.toZoneId! as never, face: e.face ?? 'down' as const })));
      const afterPyramid = after.zones[PYRAMID_ZONE]!.cardIds;
      expect(afterPyramid.length).toBe(28); // length unchanged
      expect(afterPyramid[idxA]).toBeFalsy(); // slot A is empty
      expect(afterPyramid[idxB]).toBeFalsy(); // slot B is empty
      // The parent of idxA (row 5) should now be free IF both its children are gone.
      // At minimum, geometry is intact: freePyramidIndices returns valid indices.
      const free = freePyramidIndices(after);
      expect(free.every((idx) => idx >= 0 && idx < 28)).toBe(true);
      return;
    }

    const play = `play:${kingIdx}:` as never;
    const result = rules.apply(play, state, 'you');
    expect(result).not.toBeNull();
    const moveEvents = result!.filter((e) => e.type === 'card/move');
    const after = applyEvents(events, state, moveEvents.map((e) => ({ type: 'card/move' as const, cardId: e.cardId!, toZoneId: e.toZoneId! as never, face: e.face ?? 'down' as const })));
    const afterPyramid = after.zones[PYRAMID_ZONE]!.cardIds;
    expect(afterPyramid.length).toBe(28); // length unchanged — no filter shift
    expect(afterPyramid[kingIdx]).toBeFalsy(); // the King's slot is empty
    // The card is now in the muck.
    expect(after.zones['muck']!.cardIds).toContain(pyramid.cardIds[kingIdx]);
  });
});

describe('Golf rules', () => {
  test('deals 35 tableau cards (7x5) and 17 stock through the preset path', () => {
    const { state } = buildSolitaireEvents('golf');
    let tableau = 0;
    for (let i = 0; i < 7; i += 1) {
      const zone = state.zones[golfTableauZoneId(i)]!;
      expect(zone.cardIds).toHaveLength(5);
      tableau += zone.cardIds.length;
    }
    expect(tableau).toBe(35);
    expect(state.zones[GOLF_STOCK]!.cardIds).toHaveLength(17);
    expect(state.zones[GOLF_WASTE]!.cardIds).toHaveLength(0);
  });

  test('draw moves the stock top to the waste face-up', () => {
    const { state } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    const stockBefore = state.zones[GOLF_STOCK]!.cardIds;
    const result = rules.apply('draw', state, 'you');
    expect(result).not.toBeNull();
    expect(result![0]!.type).toBe('card/move');
    expect(result![0]!.toZoneId).toBe(GOLF_WASTE);
    expect(result![0]!.face).toBe('up');
    expect(stockBefore).toHaveLength(17); // pure: state unchanged
  });

  test('a tableau card cannot open the waste (no legal play before first draw)', () => {
    const { state } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    const top0 = state.zones[golfTableauZoneId(0)]!.cardIds[4]!;
    const result = rules.apply(`play:0`, state, 'you');
    // If the top of column 0 happens to pair with itself's rank... it cannot:
    // the waste is empty, so golfPlaysOnWaste rejects every play.
    expect(result).toBeNull();
    expect(top0).toBeTruthy();
  });

  test('actions expose DRAW while stock remains, END TABLE only when stuck', () => {
    const { state } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    const actions = rules.actions(state, 'you');
    expect(actions.map((a) => a.id)).toContain('draw');
    expect(actions.map((a) => a.id)).not.toContain('end');
  });

  test('a legal adjacent-rank play moves the top card to the waste', () => {
    const { state, events } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    // Open the waste.
    const draw = rules.apply('draw', state, 'you')!;
    const afterDraw = foldEvents([...events, ...draw.map((p, i) => ({
      type: 'card/move' as const,
      id: eventId(events.length + i + 1),
      ts: Date.now(),
      actorId: 'system' as const,
      seq: events.length + i + 1,
      cardId: p.cardId!,
      toZoneId: p.toZoneId! as never,
      face: p.face ?? 'up' as const,
    }))]);
    const wasteTop = afterDraw.zones[GOLF_WASTE]!.cardIds[0]!;
    // Find a tableau top that plays onto it.
    let played = false;
    for (let i = 0; i < 7 && !played; i += 1) {
      const zone = afterDraw.zones[golfTableauZoneId(i)]!;
      const top = zone.cardIds[zone.cardIds.length - 1]!;
      const r1 = Number(top.split('-')[1]);
      const r2 = Number(wasteTop.split('-')[1]);
      const diff = Math.abs(r1 - r2);
      if ((diff === 1 || diff === 12) && r1 !== 13 && r2 !== 13) {
        const result = rules.apply(`play:${i}`, afterDraw, 'you');
        expect(result).not.toBeNull();
        expect(result![0]!.cardId).toBe(top);
        expect(result![0]!.toZoneId).toBe(GOLF_WASTE);
        played = true;
      }
    }
    expect(played).toBe(true); // seed must give at least one legal follow-up
  });

  test('Kings never play, including against an Ace', () => {
    const { state } = buildSolitaireEvents('golf');
    // Open the waste with a draw, then force the waste top to an Ace and a King.
    const rules = getGameRules('golf');
    // Craft a state directly: waste top = Ace of spades.
    const aceId = 'spades-A';
    const kingId = 'hearts-K';
    const withWaste: GameState = {
      ...state,
      zones: {
        ...state.zones,
        [GOLF_WASTE]: { ...state.zones[GOLF_WASTE]!, cardIds: [aceId] },
      },
    };
    // King onto Ace: rejected.
    expect(rules.apply(`play:0`, { ...withWaste, zones: { ...withWaste.zones, [golfTableauZoneId(0)]: { ...withWaste.zones[golfTableauZoneId(0)]!, cardIds: [kingId] } } }, 'you')).toBeNull();
    // King onto King waste: rejected.
    const withKingWaste: GameState = {
      ...state,
      zones: {
        ...state.zones,
        [GOLF_WASTE]: { ...state.zones[GOLF_WASTE]!, cardIds: [kingId] },
      },
    };
    expect(rules.apply(`play:0`, { ...withKingWaste, zones: { ...withKingWaste.zones, [golfTableauZoneId(0)]: { ...withKingWaste.zones[golfTableauZoneId(0)]!, cardIds: [kingId] } } }, 'you')).toBeNull();
  });

  test('end returns null when the tableau is not cleared and moves remain', () => {
    const { state } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    expect(rules.apply('end', state, 'you')).toBeNull();
  });

  test('readout reports tableau and stock counts', () => {
    const { state } = buildSolitaireEvents('golf');
    const rules = getGameRules('golf');
    const readout = rules.readout!(state, 'you');
    expect(readout).toContain('TABLEAU 35/35');
    expect(readout).toContain('STOCK 17');
  });
});