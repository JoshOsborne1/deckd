import { buildDeck } from './deck';
import type { GameEvent } from './events';
import { eventId } from './events';
import { executeRecipe } from './recipes';
import { klondikePreset } from './presets';
import { applyEvent, foldEvents } from './state';
import { getGameRules, type PrimitiveEvent } from './rules';
import {
  KLONDIKE_FOUNDATION_SUITS,
  KLONDIKE_TABLEAU_COUNT,
  ZONE_DISCARD,
  ZONE_DRAW,
  ZONE_MUCK,
  klondikeFoundationZoneId,
  klondikeTableauZoneId,
  type CardFace,
  type GameState,
  type Player,
  type Zone,
} from './types';

const config = {
  includeJokers: false,
  fanStyle: 'wide' as const,
  autoReshuffleDiscard: true,
  presetId: 'klondike',
};
const player: Player = { id: 'you', name: 'You', seat: 0, avatarSeed: 'you' };
const deckOrder = buildDeck({ includeJokers: false }).map((card) => card.id);

function makeSessionState(): GameState {
  const setup = executeRecipe(klondikePreset.recipe, {
    players: [player],
    config,
    deckOrder,
  });
  const start: GameEvent = {
    type: 'session/start',
    id: eventId(1),
    ts: 0,
    actorId: 'system',
    seq: 1,
    meta: {
      id: 'sess-klondike-test',
      createdAt: 0,
      rngSeed: 'klondike-test',
      mode: 'solo',
      hostId: player.id,
    },
    config,
    players: [player],
    zones: setup.zones,
  };
  const deals: GameEvent[] = setup.initialDeals.map((deal, index) => ({
    type: 'card/deal',
    id: eventId(index + 2),
    ts: 0,
    actorId: 'system',
    seq: index + 2,
    cardId: deal.cardId,
    toZoneId: deal.toZoneId,
    face: deal.face,
  }));
  return foldEvents([start, ...deals]);
}

function makeEmptyState(): GameState {
  const zones: Zone[] = [
    { id: ZONE_DRAW, label: 'Draw', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: ZONE_DISCARD, label: 'Waste', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_MUCK, label: 'Muck', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: 'communal:0', label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
    ...Array.from({ length: KLONDIKE_TABLEAU_COUNT }, (_, index) => ({
      id: klondikeTableauZoneId(index),
      label: `Tableau ${index + 1}`,
      visibility: { kind: 'public' as const },
      cardIds: [],
    })),
    ...KLONDIKE_FOUNDATION_SUITS.map((suit) => ({
      id: klondikeFoundationZoneId(suit),
      label: `${suit} foundation`,
      visibility: { kind: 'public' as const },
      cardIds: [],
    })),
  ];
  return foldEvents([
    {
      type: 'session/start',
      id: eventId(1),
      ts: 0,
      actorId: 'system',
      seq: 1,
      meta: {
        id: 'sess-klondike-fixture',
        createdAt: 0,
        rngSeed: 'fixture',
        mode: 'solo',
        hostId: player.id,
      },
      config,
      players: [player],
      zones,
    },
  ]);
}

function place(state: GameState, cardId: string, zoneId: string, face: CardFace): void {
  const zone = state.zones[zoneId];
  if (!zone) throw new Error(`Missing fixture zone ${zoneId}`);
  zone.cardIds.push(cardId);
  state.cards[cardId] = {
    id: cardId,
    face,
    zoneId,
    order: zone.cardIds.length - 1,
  };
  state.deckCardIds.push(cardId);
}

function applyPrimitiveEvents(state: GameState, events: PrimitiveEvent[]): GameState {
  return events.reduce(
    (current, event, index) =>
      applyEvent(current, {
        ...event,
        id: eventId(index + 100),
        ts: 0,
        actorId: player.id,
        seq: index + 100,
      } as GameEvent),
    state,
  );
}

function cardId(glyph: 'H' | 'D' | 'C' | 'S', rank: string): string {
  return `${glyph}-${rank}`;
}

describe('Klondike recipe and rules', () => {
  test('deals a deterministic 28-card tableau and 24-card stock', () => {
    const state = makeSessionState();
    expect(state.zones[ZONE_DRAW]?.cardIds).toHaveLength(24);
    expect(
      Array.from({ length: KLONDIKE_TABLEAU_COUNT }, (_, index) => state.zones[klondikeTableauZoneId(index)]?.cardIds.length),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let index = 0; index < KLONDIKE_TABLEAU_COUNT; index += 1) {
      const ids = state.zones[klondikeTableauZoneId(index)]?.cardIds ?? [];
      expect(state.cards[ids[ids.length - 1]!]!.face).toBe('up');
      for (const id of ids.slice(0, -1)) expect(state.cards[id]!.face).toBe('down');
    }
  });

  test('draws one card, rejects early recycle, then recycles in waste order', () => {
    const rules = getGameRules('klondike');
    const state = makeSessionState();
    const draw = rules.apply('draw', state, player.id);
    expect(draw).toEqual([
      expect.objectContaining({ type: 'card/move', cardId: state.zones[ZONE_DRAW]?.cardIds[0], toZoneId: ZONE_DISCARD, face: 'up' }),
    ]);
    const afterDraw = applyPrimitiveEvents(state, draw ?? []);
    expect(afterDraw.zones[ZONE_DRAW]?.cardIds).toHaveLength(23);
    expect(afterDraw.zones[ZONE_DISCARD]?.cardIds).toHaveLength(1);
    expect(rules.apply('recycle', afterDraw, player.id)).toBeNull();

    const recycleState = makeEmptyState();
    place(recycleState, cardId('H', '4'), ZONE_DISCARD, 'up');
    place(recycleState, cardId('S', '7'), ZONE_DISCARD, 'up');
    const recycle = rules.apply('recycle', recycleState, player.id);
    expect(recycle?.map((event) => event.cardId)).toEqual([cardId('S', '7'), cardId('H', '4')]);
    const afterRecycle = applyPrimitiveEvents(recycleState, recycle ?? []);
    expect(afterRecycle.zones[ZONE_DISCARD]?.cardIds).toEqual([]);
    expect(afterRecycle.zones[ZONE_DRAW]?.cardIds).toEqual([cardId('S', '7'), cardId('H', '4')]);
    expect(afterRecycle.cards[cardId('S', '7')]?.face).toBe('down');
  });

  test('only flips an exposed tableau card', () => {
    const rules = getGameRules('klondike');
    const state = makeEmptyState();
    place(state, cardId('C', '9'), klondikeTableauZoneId(0), 'down');
    place(state, cardId('H', '4'), klondikeTableauZoneId(0), 'up');
    expect(rules.apply(`flip:${cardId('C', '9')}`, state, player.id)).toBeNull();

    const exposed = makeEmptyState();
    place(exposed, cardId('C', '9'), klondikeTableauZoneId(0), 'down');
    const flip = rules.apply(`flip:${cardId('C', '9')}`, exposed, player.id);
    expect(flip).toEqual([expect.objectContaining({ type: 'card/flip', cardId: cardId('C', '9') })]);
    expect(applyPrimitiveEvents(exposed, flip ?? []).cards[cardId('C', '9')]?.face).toBe('up');
  });

  test('moves a legal alternating run and exposes the next card', () => {
    const rules = getGameRules('klondike');
    const state = makeEmptyState();
    place(state, cardId('C', '9'), klondikeTableauZoneId(0), 'down');
    place(state, cardId('S', '7'), klondikeTableauZoneId(0), 'up');
    place(state, cardId('D', '6'), klondikeTableauZoneId(0), 'up');
    place(state, cardId('H', '8'), klondikeTableauZoneId(1), 'up');

    const move = rules.apply(`move:${cardId('S', '7')}|${klondikeTableauZoneId(1)}`, state, player.id);
    expect(move?.filter((event) => event.type === 'card/move')).toHaveLength(2);
    expect(move?.some((event) => event.type === 'card/flip' && event.cardId === cardId('C', '9'))).toBe(true);
    const next = applyPrimitiveEvents(state, move ?? []);
    expect(next.zones[klondikeTableauZoneId(0)]?.cardIds).toEqual([cardId('C', '9')]);
    expect(next.zones[klondikeTableauZoneId(1)]?.cardIds).toEqual([
      cardId('H', '8'),
      cardId('S', '7'),
      cardId('D', '6'),
    ]);
    expect(next.cards[cardId('C', '9')]?.face).toBe('up');

    const illegal = makeEmptyState();
    place(illegal, cardId('D', '7'), klondikeTableauZoneId(0), 'up');
    place(illegal, cardId('H', '8'), klondikeTableauZoneId(1), 'up');
    expect(rules.apply(`move:${cardId('D', '7')}|${klondikeTableauZoneId(1)}`, illegal, player.id)).toBeNull();
  });

  test('moves aces to foundations and emits the win event at 52', () => {
    const rules = getGameRules('klondike');
    const state = makeEmptyState();
    place(state, cardId('H', 'A'), klondikeTableauZoneId(0), 'up');
    const aceMove = rules.apply(`move:${cardId('H', 'A')}|${klondikeFoundationZoneId('hearts')}`, state, player.id);
    expect(aceMove?.[0]).toEqual(expect.objectContaining({ type: 'card/move', toZoneId: klondikeFoundationZoneId('hearts') }));

    const winState = makeEmptyState();
    for (const suit of KLONDIKE_FOUNDATION_SUITS) {
      const glyph = suit === 'hearts' ? 'H' : suit === 'diamonds' ? 'D' : suit === 'clubs' ? 'C' : 'S';
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
      if (suit !== 'hearts') ranks.push('K');
      for (const rank of ranks) place(winState, cardId(glyph, rank), klondikeFoundationZoneId(suit), 'up');
    }
    place(winState, cardId('H', 'K'), klondikeTableauZoneId(0), 'up');
    const winningMove = rules.apply(`move:${cardId('H', 'K')}|${klondikeFoundationZoneId('hearts')}`, winState, player.id);
    expect(winningMove?.some((event) => event.type === 'session/end' && event.winnerId === player.id)).toBe(true);
  });
});
