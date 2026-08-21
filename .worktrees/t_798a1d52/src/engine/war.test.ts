import { buildDeck } from './deck';
import { eventId, type GameEvent } from './events';
import { foldEvents } from './state';
import { executeRecipe, warPreset } from './presets';
import { communalZoneId, tableZoneId, ZONE_MUCK, type GameState } from './types';
import { getGameRules, type PrimitiveEvent } from './rules';

const players = [
  { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
  { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
];
const config = {
  includeJokers: false,
  fanStyle: 'wide' as const,
  autoReshuffleDiscard: true,
  presetId: 'war',
};
const fullDeck = buildDeck({ includeJokers: false }).map((card) => card.id);

function orderedDeck(first: string, second: string): string[] {
  return [first, second, ...fullDeck.filter((cardId) => cardId !== first && cardId !== second)];
}

function makeWarLog(deckOrder: string[]) {
  const setup = executeRecipe(warPreset.recipe, { players, config, deckOrder });
  const events: GameEvent[] = [{
    type: 'session/start',
    id: eventId(1),
    ts: Date.now(),
    actorId: 'system',
    seq: 1,
    meta: { id: 'war-test', createdAt: Date.now(), rngSeed: 'war', mode: 'pass', hostId: 'p1' },
    config,
    players,
    zones: setup.zones,
  }];
  let seq = 2;
  for (const deal of setup.initialDeals) {
    events.push({
      type: 'card/deal',
      id: eventId(seq),
      ts: Date.now(),
      actorId: 'system',
      seq: seq++,
      cardId: deal.cardId,
      toZoneId: deal.toZoneId,
      face: deal.face,
    });
  }
  return { events, state: foldEvents(events), nextSeq: seq };
}

function appendPrimitives(
  log: GameEvent[],
  primitives: PrimitiveEvent[],
  actorId: string,
  nextSeq: number,
): { log: GameEvent[]; state: GameState; nextSeq: number } {
  const nextLog = log.slice();
  let seq = nextSeq;
  for (const primitive of primitives) {
    nextLog.push({
      ...primitive,
      id: eventId(seq),
      ts: Date.now(),
      actorId,
      seq: seq++,
    } as unknown as GameEvent);
  }
  return { log: nextLog, state: foldEvents(nextLog), nextSeq: seq };
}

describe('war recipe and rules', () => {
  it('deals a hidden 26-card table pile to each player', () => {
    const { state } = makeWarLog(orderedDeck('H-2', 'H-A'));

    expect(warPreset.recipe.winCondition).toBe('lastHolding');
    expect(state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(26);
    expect(state.zones[tableZoneId('p2')]?.cardIds).toHaveLength(26);
    expect(state.zones[tableZoneId('p1')]?.visibility).toEqual({ kind: 'hidden' });
    expect(state.zones[communalZoneId(0)]?.cardIds).toHaveLength(0);
    expect(state.zones.draw?.cardIds).toHaveLength(0);
  });

  it('flips a battle and awards the pot to the higher-ranked player', () => {
    const rules = getGameRules('war');
    let { events, state, nextSeq } = makeWarLog(orderedDeck('H-2', 'H-A'));

    const first = rules.apply('flip', state, 'p1');
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card/move', toZoneId: communalZoneId(0), face: 'up' }),
      expect.objectContaining({ type: 'turn/set', playerId: 'p2' }),
    ]));
    ({ log: events, state, nextSeq } = appendPrimitives(events, first ?? [], 'p1', nextSeq));

    const second = rules.apply('flip', state, 'p2');
    expect(second).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'turn/set', playerId: 'p2' }),
      expect.objectContaining({ type: 'game/street', street: 0 }),
    ]));
    ({ state } = appendPrimitives(events, second ?? [], 'p2', nextSeq));

    expect(state.phase).toBe('playing');
    expect(state.currentPlayerId).toBe('p2');
    expect(state.game?.street).toBe(0);
    expect(state.zones[communalZoneId(0)]?.cardIds).toHaveLength(0);
    expect(state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(25);
    expect(state.zones[tableZoneId('p2')]?.cardIds).toHaveLength(27);
  });

  it('enters a four-card war when the battle ranks tie', () => {
    const rules = getGameRules('war');
    let { events, state, nextSeq } = makeWarLog(orderedDeck('H-7', 'D-7'));

    const first = rules.apply('flip', state, 'p1') ?? [];
    ({ log: events, state, nextSeq } = appendPrimitives(events, first, 'p1', nextSeq));
    const second = rules.apply('flip', state, 'p2') ?? [];
    expect(second).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'game/street', street: 2 }),
      expect.objectContaining({ type: 'turn/set', playerId: 'p1' }),
    ]));
    ({ state } = appendPrimitives(events, second, 'p2', nextSeq));

    expect(state.phase).toBe('playing');
    expect(state.currentPlayerId).toBe('p1');
    expect(state.game?.street).toBe(2);
    expect(rules.actions(state, 'p1')[0]?.label).toBe('DOWN CARD');
    expect(state.zones[communalZoneId(0)]?.cardIds).toHaveLength(2);
  });

  it('ends immediately when the losing pile has no reserve cards', () => {
    const rules = getGameRules('war');
    let { events, state, nextSeq } = makeWarLog(orderedDeck('H-A', 'H-2'));
    const trim = players.flatMap((player) => {
      const cards = state.zones[tableZoneId(player.id)]?.cardIds ?? [];
      return cards.slice(1).map((cardId) => ({
        type: 'card/move' as const,
        cardId,
        toZoneId: ZONE_MUCK,
        face: 'down' as const,
      }));
    });
    ({ log: events, state, nextSeq } = appendPrimitives(events, trim, 'system', nextSeq));
    expect(state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(1);
    expect(state.zones[tableZoneId('p2')]?.cardIds).toHaveLength(1);

    const first = rules.apply('flip', state, 'p1') ?? [];
    ({ log: events, state, nextSeq } = appendPrimitives(events, first, 'p1', nextSeq));
    const second = rules.apply('flip', state, 'p2') ?? [];
    ({ state } = appendPrimitives(events, second, 'p2', nextSeq));

    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p1');
    expect(state.zones[tableZoneId('p1')]?.cardIds).toHaveLength(2);
    expect(state.zones[tableZoneId('p2')]?.cardIds).toHaveLength(0);
  });
});
