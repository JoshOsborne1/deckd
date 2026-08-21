import { buildDeck } from './deck';
import {
  blackjackStylePreset,
  dealTwoEachPreset,
  executeRecipe,
  freeplayPreset,
  pokerStylePreset,
  type Recipe,
} from './presets';
import { handZoneId, ZONE_DRAW, tableZoneId } from './types';

const deckOrder = buildDeck({ includeJokers: false }).map((card) => card.id);
const config = {
  includeJokers: false,
  fanStyle: 'wide' as const,
  autoReshuffleDiscard: true,
  presetId: 'recipe-test',
};
const players = [
  { id: 'p1', name: 'One', seat: 0, avatarSeed: 'one' },
  { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'two' },
  { id: 'p3', name: 'Three', seat: 2, avatarSeed: 'three' },
];

function setup(recipe: Recipe) {
  return executeRecipe(recipe, { players, config, deckOrder });
}

describe('recipe execution', () => {
  it('keeps freeplay as a blank deck with no initial deal', () => {
    const result = setup(freeplayPreset.recipe);

    expect(result.initialDeals).toHaveLength(0);
    expect(result.zones.find((zone) => zone.id === ZONE_DRAW)?.cardIds).toEqual(deckOrder);
    expect(result.zones.find((zone) => zone.id === 'communal:0')?.cardIds).toEqual([]);
  });

  it('executes round-robin deals from data', () => {
    const result = setup(dealTwoEachPreset.recipe);
    const p1 = result.zones.find((zone) => zone.id === handZoneId('p1'));
    const p2 = result.zones.find((zone) => zone.id === handZoneId('p2'));
    const p3 = result.zones.find((zone) => zone.id === handZoneId('p3'));

    expect(result.initialDeals).toHaveLength(6);
    expect(p1?.cardIds).toEqual([deckOrder[0], deckOrder[3]]);
    expect(p2?.cardIds).toEqual([deckOrder[1], deckOrder[4]]);
    expect(p3?.cardIds).toEqual([deckOrder[2], deckOrder[5]]);
    expect(result.initialDeals.every((deal) => deal.face === 'down')).toBe(true);
    expect(result.zones.find((zone) => zone.id === ZONE_DRAW)?.cardIds).toHaveLength(46);
  });

  it('keeps the virtual-house blackjack face policy and seat order', () => {
    const blackjackPlayers = [
      ...players.slice(0, 2),
      { id: 'house', name: 'House', seat: 2, avatarSeed: 'house' },
    ];
    const result = executeRecipe(blackjackStylePreset.recipe, {
      players: blackjackPlayers,
      config,
      deckOrder,
    });

    expect(result.initialDeals.map((deal) => deal.cardId)).toEqual(deckOrder.slice(0, 6));
    expect(result.initialDeals.map((deal) => deal.face)).toEqual([
      'up',
      'up',
      'up',
      'up',
      'up',
      'down',
    ]);
    expect(result.initialDeals.map((deal) => deal.toZoneId)).toEqual([
      handZoneId('p1'),
      handZoneId('p2'),
      handZoneId('house'),
      handZoneId('p1'),
      handZoneId('p2'),
      handZoneId('house'),
    ]);
    expect(result.zones.find((zone) => zone.id === ZONE_DRAW)?.cardIds).toHaveLength(46);
  });

  it('supports per-player table deals without mutating the input deck', () => {
    const perPlayerRecipe: Recipe = {
      id: 'table-test',
      name: 'Table test',
      oneLiner: 'A small deterministic fixture.',
      minPlayers: 1,
      maxPlayers: 3,
      backs: ['back-brand'],
      deal: { pattern: 'perPlayer', rounds: 2, face: 'up', to: 'table' },
      actionPolicy: { allowDraw: false, allowDiscard: false, allowFlip: false, allowPassTurn: true },
      turnPolicy: 'roundRobin',
      winCondition: 'none',
    };
    const inputDeck = deckOrder.slice();
    const result = executeRecipe(perPlayerRecipe, { players, config, deckOrder: inputDeck });

    expect(inputDeck).toEqual(deckOrder);
    expect(result.zones.find((zone) => zone.id === tableZoneId('p1'))?.cardIds).toEqual([
      deckOrder[0],
      deckOrder[1],
    ]);
    expect(result.zones.find((zone) => zone.id === tableZoneId('p2'))?.cardIds).toEqual([
      deckOrder[2],
      deckOrder[3],
    ]);
    expect(result.zones.find((zone) => zone.id === tableZoneId('p3'))?.cardIds).toEqual([
      deckOrder[4],
      deckOrder[5],
    ]);
  });

  it('publishes recipe metadata through every built-in preset', () => {
    expect(pokerStylePreset.recipe.actionPolicy.allowPlay).toBe(true);
    expect(pokerStylePreset.recipe.deal.pattern).toBe('roundRobin');
    expect(blackjackStylePreset.recipe.helpers?.showHandSum).toBe(true);
    expect(freeplayPreset.recipe.winCondition).toBe('none');
  });
});
