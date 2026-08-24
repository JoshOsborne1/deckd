/**
 * Rebuild-baseline fixture generator (Phase 0, R0).
 *
 * Produces deterministic seeded replay JSONs that freeze the CURRENT
 * event-sourced engine behaviour for the five baseline presets
 * (freeplay, deal-two-each, blackjack-style, poker-style, solo blackjack).
 * Phase 2 folds these logs with the same `foldEvents` and must reproduce
 * the `expected` summary; any drift fails the fold check in
 * rebuild-baseline.test.ts.
 *
 * Uses only existing engine APIs — buildDeck / mulberry32 / shuffleInPlace
 * / executeRecipe / foldEvents / getGameRules / blackjackDealerPlay /
 * handValue / eventId / findPreset — and mirrors the game store's
 * orderedDeckForPreset + createSession semantics: `sess-<seed>` session id,
 * `sess-<seed>:<seq>` event ids, host = first player, virtual house seat
 * appended for blackjack, store actor mapping per event type.
 *
 * Timestamps are frozen to a fixed epoch (ts = BASE_TS + seq) and the
 * generatedAt marker is a fixed string, so regeneration is byte-identical.
 */

/// <reference types="node" />

import * as fs from 'fs';
import * as path from 'path';

import type {
  CardId,
  GameAction,
  GameEvent,
  GameState,
  Player,
  PlayerId,
  PrimitiveEvent,
  SessionConfig,
} from '../../index';
import {
  blackjackDealerPlay,
  buildDeck,
  eventId,
  executeRecipe,
  findPreset,
  foldEvents,
  getGameRules,
  handValue,
  mulberry32,
  shuffleInPlace,
} from '../../index';

export const FIXTURE_DIR = __dirname;
export const FIXTURE_SCHEMA_VERSION = 1;
/** Fixed generation marker so regeneration is byte-identical. */
const FIXTURE_GENERATED_AT = '2026-08-24T00:00:00.000Z';
/** Fixed epoch; every event timestamp is BASE_TS + seq (stable + monotonic). */
const BASE_TS = 1787579000000;

type EventPayload = GameEvent extends infer E
  ? (E extends GameEvent ? Omit<E, 'id' | 'ts' | 'seq'> : never)
  : never;

export interface FixtureBundle {
  log: GameEvent[];
  nextSeq: number;
  state: GameState;
  sessionId: string;
}

/**
 * Replica of the store's internal orderedDeckForPreset semantics:
 * buildDeck (with old-maid joker / layout-fixed-52 handling), then a
 * mulberry32(seed) Fisher-Yates shuffle of the card ids.
 */
export function orderedDeckForPreset(
  seed: string,
  includeJokers: boolean,
  presetId?: string,
): CardId[] {
  const needsOldMaidJoker = presetId === 'old-maid';
  const layoutFixed52 = presetId === 'freecell' || presetId === 'pyramid' || presetId === 'golf';
  const deck = buildDeck({
    includeJokers: (includeJokers && !layoutFixed52) || needsOldMaidJoker,
  }).filter((card) => !needsOldMaidJoker || card.id !== 'JK-BLACK');
  const rng = mulberry32(seed);
  const order = deck.map((card) => card.id);
  return shuffleInPlace(order, rng);
}

function makeEvent(payload: EventPayload, seq: number, sessionId: string): GameEvent {
  return {
    ...(payload as unknown as GameEvent),
    id: eventId(seq, sessionId),
    ts: BASE_TS + seq,
    seq,
  };
}

function buildSession(opts: {
  presetId: string;
  mode: GameState['meta']['mode'];
  players: { id: PlayerId; name: string; avatarSeed: string }[];
  seed: string;
  includeJokers?: boolean;
}): FixtureBundle {
  const preset = findPreset(opts.presetId);
  const config: SessionConfig = {
    includeJokers: opts.includeJokers ?? false,
    fanStyle: 'wide',
    autoReshuffleDiscard: true,
    presetId: preset.id,
  };
  const players: Player[] = opts.players.map((p, seat) => ({ ...p, seat }));
  // Blackjack: append the virtual house seat (mirrors createSession).
  if (preset.id === 'blackjack') {
    players.push({ id: 'house', name: 'House', avatarSeed: 'house', seat: players.length });
  }
  const hostId = players[0]!.id;
  const sessionId = `sess-${opts.seed}`;
  const deckOrder = orderedDeckForPreset(opts.seed, config.includeJokers, preset.id);
  const setup = executeRecipe(preset.recipe, { players, config, deckOrder });

  let seq = 1;
  const log: GameEvent[] = [];
  log.push(
    makeEvent(
      {
        type: 'session/start',
        actorId: 'system',
        meta: {
          id: sessionId,
          createdAt: BASE_TS,
          rngSeed: opts.seed,
          mode: opts.mode,
          hostId,
        },
        config,
        players,
        zones: setup.zones,
      },
      seq++,
      sessionId,
    ),
  );
  for (const deal of setup.initialDeals) {
    log.push(
      makeEvent(
        {
          type: 'card/deal',
          actorId: 'system',
          cardId: deal.cardId,
          toZoneId: deal.toZoneId,
          face: deal.face,
        },
        seq++,
        sessionId,
      ),
    );
  }
  return { log, nextSeq: seq, state: foldEvents(log), sessionId };
}

/** Store actor mapping: which actorId each primitive gets when dispatched. */
function storeActor(p: PrimitiveEvent, s: GameState): PlayerId | 'system' {
  switch (p.type) {
    case 'card/deal':
    case 'game/street':
    case 'session/end':
      return s.meta.hostId || 'system';
    case 'card/move':
    case 'card/flip':
    case 'card/reveal':
      return s.currentPlayerId || 'system';
    case 'turn/end':
    case 'turn/set':
    case 'game/bet':
    case 'game/burn':
    case 'game/fold':
      return p.playerId ?? s.currentPlayerId;
    default:
      return 'system';
  }
}

/** Append primitives one at a time, folding after each push (store dispatch order). */
function append(
  log: GameEvent[],
  primitives: PrimitiveEvent[],
  nextSeq: number,
  sessionId: string,
): FixtureBundle {
  let seq = nextSeq;
  const out = log.slice();
  let state = foldEvents(out);
  for (const p of primitives) {
    out.push({
      ...p,
      id: eventId(seq, sessionId),
      ts: BASE_TS + seq,
      actorId: storeActor(p, state),
      seq,
    } as unknown as GameEvent);
    seq += 1;
    state = foldEvents(out);
  }
  return { log: out, nextSeq: seq, state, sessionId };
}

function mustApply(
  rules: ReturnType<typeof getGameRules>,
  action: GameAction,
  state: GameState,
  viewerId: PlayerId,
): PrimitiveEvent[] {
  const prims = rules.apply(action, state, viewerId);
  if (!prims) {
    throw new Error(`fixture script invalid: rules.apply(${action}, ${viewerId}) returned null`);
  }
  return prims;
}

/** Blackjack players twist to 17+ (bust auto-ends their turn) then stick. */
function blackjackPlayerTurns(bundle: FixtureBundle, playerIds: PlayerId[]): FixtureBundle {
  const rules = getGameRules('blackjack');
  let { log, nextSeq, state } = bundle;
  for (const pid of playerIds) {
    while (state.currentPlayerId === pid && handValue(state, pid) < 17) {
      const prims = rules.apply('twist', state, pid);
      if (!prims) break;
      ({ log, nextSeq, state } = append(log, prims, nextSeq, bundle.sessionId));
    }
    if (state.currentPlayerId === pid) {
      const prims = rules.apply('stick', state, pid);
      if (!prims) throw new Error(`fixture script invalid: stick rejected for ${pid}`);
      ({ log, nextSeq, state } = append(log, prims, nextSeq, bundle.sessionId));
    }
  }
  return { log, nextSeq, state, sessionId: bundle.sessionId };
}

/** One full post-flop betting round: each listed player checks in order. */
function pokerChecks(bundle: FixtureBundle, playerIds: PlayerId[]): FixtureBundle {
  const rules = getGameRules('poker');
  let { log, nextSeq, state } = bundle;
  for (const pid of playerIds) {
    const prims = mustApply(rules, 'check', state, pid);
    ({ log, nextSeq, state } = append(log, prims, nextSeq, bundle.sessionId));
  }
  return { log, nextSeq, state, sessionId: bundle.sessionId };
}

function expectedSummary(state: GameState, presetId: string): Record<string, unknown> {
  const zoneCardIds: Record<string, string[]> = {};
  for (const zone of Object.values(state.zones)) {
    zoneCardIds[zone.id] = zone.cardIds.slice();
  }
  const summary: Record<string, unknown> = {
    phase: state.phase,
    winnerId: state.winnerId,
    currentPlayerId: state.currentPlayerId,
    turn: state.turn,
    deckRemaining: state.zones.draw?.cardIds.length ?? 0,
    zoneCardIds,
  };
  if (presetId === 'blackjack') {
    summary.handValues = Object.fromEntries(
      state.players.map((p) => [p.id, handValue(state, p.id)]),
    );
  }
  if (presetId === 'poker') {
    summary.poker = {
      pot: state.game?.pot ?? 0,
      street: state.game?.street ?? 0,
      folded: state.game?.folded ?? [],
      stacks: state.game?.betting ? { ...state.game.betting.stacks } : {},
    };
  }
  return summary;
}

function fixtureJson(
  id: string,
  description: string,
  mode: GameState['meta']['mode'],
  presetId: string,
  seed: string,
  config: SessionConfig,
  players: Player[],
  deckOrder: CardId[],
  log: GameEvent[],
  expected: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    generatedAt: FIXTURE_GENERATED_AT,
    fixture: { id, description },
    seed,
    sessionId: `sess-${seed}`,
    mode,
    preset: presetId,
    config,
    players,
    deckOrder,
    eventCount: log.length,
    events: log,
    expected,
  };
}

function freeplayFixture(): Record<string, unknown> {
  const seed = 'rebuild-baseline-freeplay-0001';
  let bundle = buildSession({
    presetId: 'freeplay',
    mode: 'pass',
    players: [
      { id: 'p1', name: 'Ava', avatarSeed: 'ava' },
      { id: 'p2', name: 'Ben', avatarSeed: 'ben' },
      { id: 'p3', name: 'Cara', avatarSeed: 'cara' },
    ],
    seed,
  });
  // p1: deal top draw card to hand (down), flip it, deal next to own table (up), pass.
  const p1Hand = bundle.state.zones.draw!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/deal', cardId: p1Hand, toZoneId: 'hand:p1', face: 'down' },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/flip', cardId: p1Hand },
  ], bundle.nextSeq, bundle.sessionId));
  const p1Table = bundle.state.zones.draw!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/deal', cardId: p1Table, toZoneId: 'table:p1', face: 'up' },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p1' },
  ], bundle.nextSeq, bundle.sessionId));
  // p2: deal one to hand (down), pass.
  const p2Hand = bundle.state.zones.draw!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/deal', cardId: p2Hand, toZoneId: 'hand:p2', face: 'down' },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p2' },
  ], bundle.nextSeq, bundle.sessionId));
  // p3: move one to own table (down), flip it, pass.
  const p3Table = bundle.state.zones.draw!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/move', cardId: p3Table, toZoneId: 'table:p3', face: 'down' },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/flip', cardId: p3Table },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p3' },
  ], bundle.nextSeq, bundle.sessionId));

  const preset = findPreset('freeplay');
  return fixtureJson(
    'freeplay',
    'Three-player hot-seat freeplay: shuffled 52-card draw, a few deals/flips/moves across turns.',
    'pass',
    'freeplay',
    seed,
    { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'freeplay' },
    bundle.state.players,
    orderedDeckForPreset(seed, false, preset.id),
    bundle.log,
    expectedSummary(bundle.state, 'freeplay'),
  );
}

function dealTwoEachFixture(): Record<string, unknown> {
  const seed = 'rebuild-baseline-deal-two-each-0001';
  let bundle = buildSession({
    presetId: 'deal-two-each',
    mode: 'pass',
    players: [
      { id: 'p1', name: 'Ava', avatarSeed: 'ava' },
      { id: 'p2', name: 'Ben', avatarSeed: 'ben' },
      { id: 'p3', name: 'Cara', avatarSeed: 'cara' },
      { id: 'p4', name: 'Dan', avatarSeed: 'dan' },
    ],
    seed,
  });
  // p1: peek at one of their face-down cards, pass.
  const p1Card = bundle.state.zones['hand:p1']!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/flip', cardId: p1Card },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p1' },
  ], bundle.nextSeq, bundle.sessionId));
  // p2: draw a third card into the hand, pass.
  const p2Card = bundle.state.zones.draw!.cardIds[0]!;
  ({ ...bundle } = append(bundle.log, [
    { type: 'card/deal', cardId: p2Card, toZoneId: 'hand:p2', face: 'down' },
  ], bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p2' },
  ], bundle.nextSeq, bundle.sessionId));
  // p3: pass.
  ({ ...bundle } = append(bundle.log, [
    { type: 'turn/end', playerId: 'p3' },
  ], bundle.nextSeq, bundle.sessionId));

  const preset = findPreset('deal-two-each');
  return fixtureJson(
    'deal-two-each',
    'Four-player deal-2-each: two face-down rounds dealt, one flip, one extra draw, three passes.',
    'pass',
    'deal-two-each',
    seed,
    { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'deal-two-each' },
    bundle.state.players,
    orderedDeckForPreset(seed, false, preset.id),
    bundle.log,
    expectedSummary(bundle.state, 'deal-two-each'),
  );
}

function blackjackStyleFixture(): Record<string, unknown> {
  const seed = 'rebuild-baseline-blackjack-style-0001';
  let bundle = buildSession({
    presetId: 'blackjack',
    mode: 'pass',
    players: [
      { id: 'p1', name: 'Ava', avatarSeed: 'ava' },
      { id: 'p2', name: 'Ben', avatarSeed: 'ben' },
    ],
    seed,
  });
  bundle = blackjackPlayerTurns(bundle, ['p1', 'p2']);
  // House auto-plays to 17 and ends the session.
  const dealerPrims = blackjackDealerPlay(bundle.state);
  bundle = append(bundle.log, dealerPrims, bundle.nextSeq, bundle.sessionId);

  const preset = findPreset('blackjack');
  return fixtureJson(
    'blackjack-style',
    'Two players + house blackjack-style: up/down deal, twists to 17+, sticks, dealer reveal + draw to 17, showdown.',
    'pass',
    'blackjack',
    seed,
    { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
    bundle.state.players,
    orderedDeckForPreset(seed, false, preset.id),
    bundle.log,
    expectedSummary(bundle.state, 'blackjack'),
  );
}

function pokerStyleFixture(): Record<string, unknown> {
  const seed = 'rebuild-baseline-poker-style-0001';
  let bundle = buildSession({
    presetId: 'poker',
    mode: 'pass',
    players: [
      { id: 'p1', name: 'Ava', avatarSeed: 'ava' },
      { id: 'p2', name: 'Ben', avatarSeed: 'ben' },
      { id: 'p3', name: 'Cara', avatarSeed: 'cara' },
    ],
    seed,
  });
  const rules = getGameRules('poker');
  // Preflop: p1 calls the big blind, p2 raises one big blind, p3 + p1 call.
  for (const [pid, action] of [
    ['p1', 'call'],
    ['p2', 'raise'],
    ['p3', 'call'],
    ['p1', 'call'],
  ] as const) {
    const prims = mustApply(rules, action, bundle.state, pid);
    ({ ...bundle } = append(bundle.log, prims, bundle.nextSeq, bundle.sessionId));
  }
  // Flop street: burn + flop, then three checks.
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'burn', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'flop', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  bundle = pokerChecks(bundle, ['p2', 'p3', 'p1']);
  // Turn street: burn + turn, then three checks.
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'burn', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'turn', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  bundle = pokerChecks(bundle, ['p2', 'p3', 'p1']);
  // River street: burn + river, then three checks.
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'burn', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'river', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));
  bundle = pokerChecks(bundle, ['p2', 'p3', 'p1']);
  // Showdown: reveal all hole cards and award the pot.
  ({ ...bundle } = append(bundle.log, mustApply(rules, 'reveal', bundle.state, 'p1'), bundle.nextSeq, bundle.sessionId));

  const preset = findPreset('poker');
  return fixtureJson(
    'poker-style',
    'Three-player hold\'em-style: blinds + call/raise/call preflop, burn/flop/turn/river with check rounds, showdown.',
    'pass',
    'poker',
    seed,
    { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'poker' },
    bundle.state.players,
    orderedDeckForPreset(seed, false, preset.id),
    bundle.log,
    expectedSummary(bundle.state, 'poker'),
  );
}

function soloBlackjackFixture(): Record<string, unknown> {
  const seed = 'rebuild-baseline-solo-blackjack-0001';
  let bundle = buildSession({
    presetId: 'blackjack',
    mode: 'solo',
    players: [{ id: 'p1', name: 'Ava', avatarSeed: 'ava' }],
    seed,
  });
  bundle = blackjackPlayerTurns(bundle, ['p1']);
  const dealerPrims = blackjackDealerPlay(bundle.state);
  bundle = append(bundle.log, dealerPrims, bundle.nextSeq, bundle.sessionId);

  const preset = findPreset('blackjack');
  return fixtureJson(
    'solo-blackjack',
    'Solo blackjack (single player + house): up/down deal, twist to 17+, stick, dealer reveal + draw to 17, showdown.',
    'solo',
    'blackjack',
    seed,
    { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: 'blackjack' },
    bundle.state.players,
    orderedDeckForPreset(seed, false, preset.id),
    bundle.log,
    expectedSummary(bundle.state, 'blackjack'),
  );
}

/** Deterministic fixture bundle keyed by the JSON file name. */
export function generateFixtures(): Record<string, Record<string, unknown>> {
  return {
    'freeplay.json': freeplayFixture(),
    'deal-two-each.json': dealTwoEachFixture(),
    'blackjack-style.json': blackjackStyleFixture(),
    'poker-style.json': pokerStyleFixture(),
    'solo-blackjack.json': soloBlackjackFixture(),
  };
}

/** Canonical stable JSON text for a fixture (2-space pretty + trailing LF). */
export function fixtureJsonText(fixture: Record<string, unknown>): string {
  return JSON.stringify(fixture, null, 2) + '\n';
}

/**
 * GENERATOR-ONLY entry point: writes all five fixture JSONs under FIXTURE_DIR.
 *
 * Deliberately NOT exported to the Jest test path — the regression suite in
 * rebuild-baseline.test.ts is read-only and must fail (not rewrite) when a
 * checked-in fixture drifts from current engine behaviour. Run this explicitly
 * (e.g. `npx ts-node .../generate.ts`) only when a new baseline is intended.
 */
export function writeFixturesToDisk(): string[] {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const written: string[] = [];
  for (const [file, fixture] of Object.entries(generateFixtures())) {
    const target = path.join(FIXTURE_DIR, file);
    fs.writeFileSync(target, fixtureJsonText(fixture));
    written.push(target);
  }
  return written;
}
