/**
 * Rebuild-baseline fixture regression check (Phase 0, R0).
 *
 * Read-only protection over the checked-in deterministic replay JSONs under
 * this directory. For each one it verifies:
 *   1. the checked-in file parses as JSON and matches the fixed schema shape;
 *   2. the file's recorded `events` fold back to its recorded `expected`
 *      summary (the Phase 2 regression contract) using the CURRENT engine;
 *   3. the checked-in file's stable JSON text is byte-identical to a fresh
 *      regeneration — any engine change that shifts replay behaviour fails
 *      this test.
 *
 * The suite NEVER writes the fixtures: a missing or drifted file fails here.
 * (Re)writing happens only via the explicit generator entry point
 * `writeFixturesToDisk` in ./generate — never from Jest setup.
 */

/// <reference types="node" />

import * as fs from 'fs';
import * as path from 'path';
import { foldEvents, handValue, type GameEvent, type GameState } from '../../index';
import { FIXTURE_DIR, fixtureJsonText, generateFixtures } from './generate';

interface ParsedFixture {
  text: string;
  parsed: Record<string, unknown>;
}

describe('rebuild-baseline fixtures (Phase 0 regression contract)', () => {
  const bundles = generateFixtures();

  // Read the checked-in artifacts once; no writes happen anywhere in the suite.
  const onDisk: Record<string, ParsedFixture> = {};
  beforeAll(() => {
    for (const file of Object.keys(bundles)) {
      const text = fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
      onDisk[file] = { text, parsed: JSON.parse(text) as Record<string, unknown> };
    }
  });

  for (const file of Object.keys(bundles)) {
    it(`${file} is valid JSON with the expected schema`, () => {
      const { parsed } = onDisk[file]!;

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

    it(`${file} folds its recorded events to the recorded expected summary with the current engine`, () => {
      const { parsed } = onDisk[file]!;
      const events = parsed.events as GameEvent[];
      const state = foldEvents(events);
      const expected = parsed.expected as Record<string, unknown>;

      expect(state.phase).toBe(expected.phase);
      expect(state.winnerId).toBe(expected.winnerId);
      expect(state.currentPlayerId).toBe(expected.currentPlayerId);
      expect(state.turn).toBe(expected.turn);
      expect(state.zones.draw?.cardIds.length ?? 0).toBe(expected.deckRemaining);
      expect(zoneCardIds(state)).toEqual(expected.zoneCardIds);

      if (parsed.preset === 'blackjack') {
        const handValues = expected.handValues as Record<string, number>;
        for (const player of state.players) {
          expect(handValue(state, player.id)).toBe(handValues[player.id]);
        }
      }
      if (parsed.preset === 'poker') {
        const poker = expected.poker as { pot: number; street: number; folded: string[]; stacks: Record<string, number> };
        expect(state.game?.pot).toBe(poker.pot);
        expect(state.game?.street).toBe(poker.street);
        expect(state.game?.folded).toEqual(poker.folded);
        expect(state.game?.betting?.stacks).toEqual(poker.stacks);
      }
    });

    it(`${file} is byte-stable under regeneration`, () => {
      const regenerated = fixtureJsonText(generateFixtures()[file]!);
      expect(regenerated).toBe(onDisk[file]!.text);
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
