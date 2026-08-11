import { buildDeck } from './deck';
import { eventId, type GameEvent } from './events';
import { foldEvents } from './state';
import { executeRecipe } from './recipes';
import { getGameRules, type PrimitiveEvent } from './rules';
import { crazyEightsPreset, goFishPreset, oldMaidPreset, sevensPreset } from './presets';
import { handZoneId, tableZoneId, type GameState, type Player, type SessionConfig } from './types';

const players: Player[] = [
  { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
  { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
];

const goFishConfig: SessionConfig = {
  includeJokers: false,
  fanStyle: 'wide',
  autoReshuffleDiscard: true,
  presetId: 'go-fish',
};

const oldMaidConfig: SessionConfig = {
  includeJokers: false,
  fanStyle: 'wide',
  autoReshuffleDiscard: true,
  presetId: 'old-maid',
};

function startSession(
  preset: typeof goFishPreset | typeof oldMaidPreset | typeof crazyEightsPreset | typeof sevensPreset,
  config: SessionConfig,
  deckOrder: string[],
): { state: GameState; events: GameEvent[]; nextSeq: number } {
  const setup = executeRecipe(preset.recipe, { players, config, deckOrder });
  const events: GameEvent[] = [{
    type: 'session/start',
    id: eventId(1),
    ts: 1,
    actorId: 'system',
    seq: 1,
    meta: { id: `test-${preset.id}`, createdAt: 1, rngSeed: 'test', mode: 'pass', hostId: 'p1' },
    config,
    players,
    zones: setup.zones,
  }];
  let seq = 2;
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq),
      ts: seq,
      actorId: 'system',
      seq: seq++,
      cardId: deal.cardId,
      toZoneId: deal.toZoneId,
      face: deal.face,
    });
  }
  return { state: foldEvents(events), events, nextSeq: seq };
}

function appendPrimitives(
  log: GameEvent[],
  primitives: PrimitiveEvent[],
  actorId: string,
  nextSeq: number,
): { state: GameState; events: GameEvent[]; nextSeq: number } {
  const events = log.slice();
  let seq = nextSeq;
  for (const primitive of primitives) {
    events.push({
      ...primitive,
      id: eventId(seq),
      ts: seq,
      actorId,
      seq: seq++,
    } as unknown as GameEvent);
  }
  return { state: foldEvents(events), events, nextSeq: seq };
}

function orderedWithPrefix(prefix: string[], includeJoker = false): string[] {
  const deck = buildDeck({ includeJokers: includeJoker }).map((card) => card.id);
  const rest = deck.filter((cardId) => !prefix.includes(cardId));
  return [...prefix, ...rest];
}

describe('Go Fish recipe and rules', () => {
  it('deals five cards each and asks the next live player for a rank', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'D-A', 'S-A', 'C-A']);
    const started = startSession(goFishPreset, goFishConfig, deckOrder);
    const { state } = started;

    expect(started.events.filter((event) => event.type === 'card/deal')).toHaveLength(10);
    expect(state.zones[handZoneId('p1')]?.cardIds).toHaveLength(5);
    expect(state.zones[handZoneId('p2')]?.cardIds).toHaveLength(5);
    expect(getGameRules('go-fish').actions(state, 'p1').map((action) => action.id)).toContain('ask:p2:A');
  });

  it('moves matching cards, collects a book of four, and keeps the turn after a hit', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'D-A', 'S-A', 'C-A']);
    const started = startSession(goFishPreset, goFishConfig, deckOrder);
    const rules = getGameRules('go-fish');
    const primitives = rules.apply('ask:p2:A', started.state, 'p1');

    expect(primitives).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card/ask', targetPlayerId: 'p2', rank: 'A', found: true }),
      expect.objectContaining({ type: 'card/move', toZoneId: handZoneId('p1') }),
      expect.objectContaining({ type: 'card/move', toZoneId: tableZoneId('p1'), face: 'up' }),
    ]));

    const result = appendPrimitives(started.events, primitives ?? [], 'p1', started.nextSeq);
    expect(result.state.currentPlayerId).toBe('p1');
    expect(result.state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(4);
    expect(result.state.zones[handZoneId('p2')]?.cardIds).toHaveLength(3);
    expect(rules.readout?.(result.state, 'p1')).toContain('BOOKS 1');
  });
});

describe('Old Maid recipe and rules', () => {
  it('deals a standard deck plus one maid joker without exposing hands', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'H-K', 'D-A', 'D-K'], true)
      .filter((cardId) => cardId !== 'JK-BLACK');
    const started = startSession(oldMaidPreset, oldMaidConfig, deckOrder);
    const state = started.state;

    expect(started.events.filter((event) => event.type === 'card/deal')).toHaveLength(53);
    expect(state.zones[handZoneId('p1')]?.cardIds).toHaveLength(27);
    expect(state.zones[handZoneId('p2')]?.cardIds).toHaveLength(26);
    expect(state.zones[handZoneId('p1')]?.visibility).toEqual({ kind: 'private', ownerId: 'p1' });
    expect(state.zones[handZoneId('p2')]?.visibility).toEqual({ kind: 'private', ownerId: 'p2' });
    expect(Object.keys(state.cards).filter((cardId) => cardId.startsWith('JK-'))).toEqual(['JK-RED']);
  });

  it('lays down pairs, skips empty players, and draws from the next live hand', () => {
    const deckOrder = orderedWithPrefix(['H-A', 'H-K', 'D-A', 'D-K'], true)
      .filter((cardId) => cardId !== 'JK-BLACK');
    const started = startSession(oldMaidPreset, oldMaidConfig, deckOrder);
    const rules = getGameRules('old-maid');
    const pairAction = rules.actions(started.state, 'p1').find((action) => action.id === 'pair');
    expect(pairAction).toBeDefined();

    const paired = appendPrimitives(
      started.events,
      rules.apply('pair', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(paired.state.zones[tableZoneId('p1')]?.cardIds.length).toBeGreaterThan(0);
    expect(paired.state.currentPlayerId).toBe('p2');

    const p2Before = paired.state.zones[handZoneId('p2')]?.cardIds.length ?? 0;
    const p1Before = paired.state.zones[handZoneId('p1')]?.cardIds.length ?? 0;
    const drawn = appendPrimitives(
      paired.events,
      rules.apply('draw', paired.state, 'p2') ?? [],
      'p2',
      paired.nextSeq,
    );
    expect(drawn.state.zones[handZoneId('p2')]?.cardIds.length).toBe(p2Before + 1);
    expect(drawn.state.zones[handZoneId('p1')]?.cardIds.length).toBe(p1Before - 1);
    expect(drawn.state.currentPlayerId).toBe('p1');
  });
});

describe('Crazy Eights and Sevens recipe and rules', () => {
  it('plays matching cards to the Crazy Eights discard', () => {
    const config: SessionConfig = { ...goFishConfig, presetId: 'crazy-eights' };
    const started = startSession(crazyEightsPreset, config, orderedWithPrefix(['H-A', 'H-2', 'H-3', 'H-4']));
    const rules = getGameRules('crazy-eights');

    expect(rules.actions(started.state, 'p1').map((action) => action.id)).toContain('play:H-A');
    const first = appendPrimitives(
      started.events,
      rules.apply('play:H-A', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(first.state.currentPlayerId).toBe('p2');
    expect(first.state.zones.discard?.cardIds).toEqual(['H-A']);

    const second = appendPrimitives(
      first.events,
      rules.apply('play:H-2', first.state, 'p2') ?? [],
      'p2',
      first.nextSeq,
    );
    expect(second.state.zones.discard?.cardIds).toEqual(['H-A', 'H-2']);
    expect(second.state.zones[handZoneId('p1')]?.cardIds).toHaveLength(4);
  });

  it('opens Sevens with a seven and grows the same-suit run', () => {
    const config: SessionConfig = { ...goFishConfig, presetId: 'sevens' };
    const started = startSession(sevensPreset, config, orderedWithPrefix(['H-7', 'H-8', 'S-7', 'C-7']));
    const rules = getGameRules('sevens');

    expect(rules.actions(started.state, 'p1').map((action) => action.id)).toContain('play:H-7');
    const first = appendPrimitives(
      started.events,
      rules.apply('play:H-7', started.state, 'p1') ?? [],
      'p1',
      started.nextSeq,
    );
    expect(first.state.currentPlayerId).toBe('p2');
    expect(rules.actions(first.state, 'p2').map((action) => action.id)).toContain('play:H-8');

    const second = appendPrimitives(
      first.events,
      rules.apply('play:H-8', first.state, 'p2') ?? [],
      'p2',
      first.nextSeq,
    );
    expect(second.state.zones['communal:0']?.cardIds).toEqual(['H-7', 'H-8']);
    expect(second.state.currentPlayerId).toBe('p1');
  });
});
