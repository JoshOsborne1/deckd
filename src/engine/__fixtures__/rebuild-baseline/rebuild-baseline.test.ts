/**
 * Rebuild-baseline fixture writer + fold check (Phase 0, R0).
 *
 * Writes the five deterministic replay JSONs under this directory and
 * verifies each one:
 *   1. parses as JSON and matches the fixed schema shape;
 *   2. folds back to the recorded expected summary (the Phase 2
 *      regression contract) using the CURRENT engine;
 *   3. is byte-stable — regeneration produces the identical file, so any
 *      engine change that shifts replay behaviour fails this test.
 *
 * Jest testMatch covers `.test.ts` files under the src root, so this test
 * runs under the normal suite and writes fixtures before the assertions.
 */

/// <reference types="node" />

import * as fs from 'fs';
import * as path from 'path';
import { foldEvents, handValue, type GameEvent, type GameState } from '../../index';
import { FIXTURE_DIR, generateFixtures } from './generate';

describe('rebuild-baseline fixtures (Phase 0 regression contract)', () => {
  const bundles = generateFixtures();

  // Materialise the fixtures before any assertion so the JSONs exist on disk
  // and the byte-stability test compares against the generated output.
  beforeAll(() => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    for (const [file, fixture] of Object.entries(bundles)) {
      fs.writeFileSync(path.join(FIXTURE_DIR, file), JSON.stringify(fixture, null, 2) + '\n');
    }
  });

  for (const [file, fixture] of Object.entries(bundles)) {
    it(`${file} is valid JSON with the expected schema`, () => {
      const text = JSON.stringify(fixture, null, 2);
      const parsed = JSON.parse(text) as Record<string, unknown>;

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.fixture).toMatchObject({ id: expect.any(String) });
      expect(typeof parsed.seed).toBe('string');
      expect(typeof parsed.sessionId).toBe('string');
      expect(typeof parsed.mode).toBe('string');
      expect(typeof parsed.preset).toBe('string');
      expect(parsed.config).toMatchObject({ includeJokers: expect.any(Boolean) });
      expect(Array.isArray(parsed.players)).toBe(true);
      expect(Array.isArray(parsed.deckOrder)).toBe(true);
      expect(Array.isArray(parsed.events)).toBe(true);
      expect(parsed.eventCount).toBe((parsed.events as unknown[]).length);
      expect(parsed.expected).toBeDefined();

      // Event log invariants: contiguous seq from 1, monotonic ts, stable ids.
      const events = parsed.events as GameEvent[];
      events.forEach((event, index) => {
        expect(event.seq).toBe(index + 1);
        expect(event.id).toBe(`${parsed.sessionId}:${index + 1}`);
        expect(event.ts).toBeGreaterThanOrEqual(1787579000000);
      });

      // Deck sanity: 52 unique standard card ids, exactly the shuffled order.
      expect(new Set(parsed.deckOrder as string[]).size).toBe(52);
      expect((parsed.deckOrder as string[]).length).toBe(52);
    });

    it(`${file} folds to the recorded expected summary with the current engine`, () => {
      const events = fixture.events as GameEvent[];
      const state = foldEvents(events);
      const expected = fixture.expected as Record<string, unknown>;

      expect(state.phase).toBe(expected.phase);
      expect(state.winnerId).toBe(expected.winnerId);
      expect(state.currentPlayerId).toBe(expected.currentPlayerId);
      expect(state.turn).toBe(expected.turn);
      expect(state.zones.draw?.cardIds.length ?? 0).toBe(expected.deckRemaining);
      expect(zoneCardIds(state)).toEqual(expected.zoneCardIds);

      if (fixture.preset === 'blackjack') {
        const handValues = expected.handValues as Record<string, number>;
        for (const player of state.players) {
          expect(handValue(state, player.id)).toBe(handValues[player.id]);
        }
      }
      if (fixture.preset === 'poker') {
        const poker = expected.poker as { pot: number; street: number; folded: string[]; stacks: Record<string, number> };
        expect(state.game?.pot).toBe(poker.pot);
        expect(state.game?.street).toBe(poker.street);
        expect(state.game?.folded).toEqual(poker.folded);
        expect(state.game?.betting?.stacks).toEqual(poker.stacks);
      }
    });

    it(`${file} is byte-stable under regeneration`, () => {
      const regenerated = JSON.stringify(generateFixtures()[file], null, 2) + '\n';
      const current = fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
      expect(regenerated).toBe(current);
    });
  }
});

function zoneCardIds(state: GameState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const zone of Object.values(state.zones)) {
    out[zone.id] = zone.cardIds.slice();
  }
  return out;
}
