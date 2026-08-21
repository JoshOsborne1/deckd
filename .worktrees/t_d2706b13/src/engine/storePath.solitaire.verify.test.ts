import { buildDeck, mulberry32, shuffleInPlace } from './deck';
import { foldEvents } from './state';
import { eventId } from './events';
import type { GameEvent } from './events';
import { freeCellPreset, golfPreset, pyramidPreset } from './presets';
import { getGameRules } from './rules';
import { freeCellTableauZoneId, freeCellZoneId, PYRAMID_ZONE, PYRAMID_STOCK, GOLF_STOCK, golfTableauZoneId } from './solitaire';

describe('store-path solitaire verification (rejection fix)', () => {
  // Mirrors gameStore.createSession: preset.setup -> executeRecipe(preset.recipe).
  // The 2026-08-11 rejection was: lanes overrode setup with builders the store
  // never calls, so real sessions built core zones only (unplayable boards).
  function storePathSession(preset: typeof freeCellPreset) {
    const deckOrder = shuffleInPlace(
      buildDeck({ includeJokers: false }).map((c) => c.id),
      mulberry32('verify'),
    );
    const players = [{ id: 'you', name: 'You', seat: 0, avatarSeed: 's' }];
    const config = { includeJokers: false, fanStyle: 'wide' as const, autoReshuffleDiscard: true, presetId: preset.id };
    const setup = preset.setup({ players, config, deckOrder });
    const events: GameEvent[] = [{
      type: 'session/start', id: eventId(1), ts: Date.now(), actorId: 'system', seq: 1,
      meta: { id: 'sess-v', createdAt: Date.now(), rngSeed: 'verify', mode: 'solo' as const, hostId: 'you' },
      config, players, zones: setup.zones,
    }];
    let seq = 2;
    for (const deal of setup.initialDeals) {
      events.push({ type: 'card/deal', id: eventId(seq), ts: Date.now(), actorId: 'system', seq: seq++, cardId: deal.cardId, toZoneId: deal.toZoneId, face: deal.face });
    }
    return foldEvents(events);
  }

  test('FreeCell deals all 52 cards through the store path', () => {
    const state = storePathSession(freeCellPreset);
    const cols = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => state.zones[freeCellTableauZoneId(i)]?.cardIds.length ?? 0);
    const total = cols.reduce((a, b) => a + b, 0);
    expect(cols).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(total).toBe(52);
    const rules = getGameRules('freecell');
    // FreeCell is tap-to-move: the action bar is empty until won (FINISH).
    // Playability comes from move actions, not bar buttons.
    expect(rules.readout!(state, 'you')).toContain('FOUNDATION 0/52');
  });

  test('Pyramid deals 28 pyramid + 24 stock through the store path', () => {
    const state = storePathSession(pyramidPreset);
    const pyr = state.zones[PYRAMID_ZONE]?.cardIds.length ?? 0;
    const stock = state.zones[PYRAMID_STOCK]?.cardIds.length ?? 0;
    expect(pyr).toBe(28);
    expect(stock).toBe(24);
    const rules = getGameRules('pyramid');
    expect(rules.actions(state, 'you').length).toBeGreaterThan(0);
  });

  test('FreeCell free cells start empty (zone exists)', () => {
    const state = storePathSession(freeCellPreset);
    for (let i = 0; i < 4; i += 1) {
      expect(state.zones[freeCellZoneId(i)]).toBeDefined();
      expect(state.zones[freeCellZoneId(i)]!.cardIds).toHaveLength(0);
    }
  });

  test('Golf deals 35 tableau + 17 stock through the store path', () => {
    const state = storePathSession(golfPreset);
    const cols = [0, 1, 2, 3, 4, 5, 6].map((i) => state.zones[golfTableauZoneId(i)]?.cardIds.length ?? 0);
    expect(cols).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(state.zones[GOLF_STOCK]!.cardIds).toHaveLength(17);
    const rules = getGameRules('golf');
    expect(rules.actions(state, 'you').map((a) => a.id)).toContain('draw');
    expect(rules.readout!(state, 'you')).toContain('TABLEAU 35/35');
  });
});
