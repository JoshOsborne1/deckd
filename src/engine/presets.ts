import {
  executeRecipe,
  type Recipe,
  type RecipeSetupInput,
  type RecipeSetupResult,
} from './recipes';

export { executeRecipe } from './recipes';
export type {
  Recipe,
  RecipeActionPolicy,
  RecipeDeal,
  RecipeDealFace,
  RecipeDealPattern,
  RecipeHelpers,
  RecipeInitialDeal,
  RecipeMatchRule,
  RecipeSetupInput,
  RecipeSetupResult,
  RecipeTarget,
  RecipeTurnPolicy,
  RecipeVariants,
  RecipeWinCondition,
} from './recipes';

export type PresetSetupInput = RecipeSetupInput;
export type PresetSetupResult = RecipeSetupResult;

export interface Preset {
  recipe: Recipe;
  id: string;
  name: string;
  summary: string;
  minPlayers: number;
  maxPlayers: number;
  supportsPlayerCount: (n: number) => boolean;
  setup: (input: PresetSetupInput) => PresetSetupResult;
  helpers?: Recipe['helpers'];
}

function makePreset(recipe: Recipe): Preset {
  return {
    recipe,
    id: recipe.id,
    name: recipe.name,
    summary: recipe.oneLiner,
    minPlayers: recipe.minPlayers,
    maxPlayers: recipe.maxPlayers,
    supportsPlayerCount: (n) => n >= recipe.minPlayers && n <= recipe.maxPlayers,
    setup: (input) => executeRecipe(recipe, input),
    helpers: recipe.helpers,
  };
}

export const freeplayPreset = makePreset({
  id: 'freeplay',
  name: 'Freeplay',
  oneLiner: 'A shuffled deck on the table. Deal, draw, and flip however you like.',
  minPlayers: 1,
  maxPlayers: 12,
  backs: ['back-brand'],
  deal: { pattern: 'none', rounds: 0, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: true,
    matchRule: 'none',
    allowFlip: true,
    allowPassTurn: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'none',
});

export const dealTwoEachPreset = makePreset({
  id: 'deal-two-each',
  name: 'Deal 2 each',
  oneLiner: 'Two cards dealt face-down to every player. Rest stays in the draw pile.',
  minPlayers: 2,
  maxPlayers: 10,
  backs: ['back-crimson'],
  deal: { pattern: 'roundRobin', rounds: 2, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: true,
    matchRule: 'none',
    allowFlip: true,
    allowPassTurn: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'none',
});

export const warPreset = makePreset({
  id: 'war',
  name: 'War',
  oneLiner: 'Flip the top card. Highest rank takes the battle.',
  minPlayers: 2,
  maxPlayers: 2,
  backs: ['back-crimson'],
  // 27 rounds deals every standard card (26 each) and also absorbs two
  // optional jokers when the table token enables them.
  deal: { pattern: 'roundRobin', rounds: 27, face: 'down', to: 'table' },
  actionPolicy: {
    allowDraw: false,
    allowDiscard: false,
    allowFlip: true,
    allowPassTurn: false,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'lastHolding',
});

export const goFishPreset = makePreset({
  id: 'go-fish',
  name: 'Go Fish',
  oneLiner: 'Ask for a rank, collect books of four, and finish with the most.',
  minPlayers: 2,
  maxPlayers: 6,
  backs: ['back-brand'],
  deal: { pattern: 'roundRobin', rounds: 5, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: false,
    allowAsk: true,
    allowFlip: false,
    allowPassTurn: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'scoreTarget',
  helpers: { countPairs: true },
});

export const oldMaidPreset = makePreset({
  id: 'old-maid',
  name: 'Old Maid',
  oneLiner: 'Lay down matching pairs, then draw until one player holds the maid.',
  minPlayers: 2,
  maxPlayers: 8,
  backs: ['back-crimson'],
  // The gameStore supplies a standard deck plus one joker.  Twenty-seven
  // rounds exhaust that 53-card deck for any supported player count.
  deal: { pattern: 'roundRobin', rounds: 27, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: false,
    allowFlip: false,
    allowPassTurn: true,
    allowPlay: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'lastHolding',
  helpers: { countPairs: true },
  variants: { jokers: true, wilds: ['old-maid'] },
});

export const crazyEightsPreset = makePreset({
  id: 'crazy-eights',
  name: 'Crazy Eights',
  oneLiner: 'Match the suit, match the rank, or drop an eight to lose your hand first.',
  minPlayers: 2,
  maxPlayers: 6,
  backs: ['back-brand'],
  deal: { pattern: 'roundRobin', rounds: 5, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: true,
    allowFlip: false,
    allowPassTurn: true,
    allowPlay: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'firstEmptyHand',
});

export const sevensPreset = makePreset({
  id: 'sevens',
  name: 'Sevens',
  oneLiner: 'Open with sevens, build each suit outward, and empty your hand first.',
  minPlayers: 2,
  maxPlayers: 6,
  backs: ['back-crimson'],
  deal: { pattern: 'roundRobin', rounds: 52, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: false,
    allowDiscard: false,
    allowFlip: false,
    allowPassTurn: true,
    allowPlay: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'firstEmptyHand',
});

export const klondikePreset = makePreset({
  id: 'klondike',
  name: 'Klondike',
  oneLiner: 'Build four foundations from ace to king. Draw one from the stock.',
  minPlayers: 1,
  maxPlayers: 1,
  backs: ['back-brand'],
  layout: 'klondike',
  deal: { pattern: 'none', rounds: 0, face: 'down', to: 'table' },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: false,
    allowFlip: true,
    allowPassTurn: false,
    allowPlay: true,
  },
  turnPolicy: 'free',
  winCondition: 'scoreTarget',
  helpers: { rankHand: true },
});

export const blackjackStylePreset = makePreset({
  id: 'blackjack',
  name: 'Blackjack-style',
  oneLiner: '2 to each player face-up, dealer 1 up + 1 down. Scoring helper, no betting.',
  minPlayers: 1,
  maxPlayers: 7,
  backs: ['back-noir'],
  deal: {
    pattern: 'roundRobin',
    rounds: 2,
    face: 'upDown',
    playerFace: 'up',
    dealerFaces: ['up', 'down'],
    to: 'hand',
    dealer: true,
  },
  actionPolicy: {
    allowDraw: true,
    allowDiscard: false,
    allowFlip: false,
    allowPassTurn: false,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'scoreTarget',
  helpers: { showHandSum: true },
});

export const pokerStylePreset = makePreset({
  id: 'poker',
  name: 'Poker-style',
  oneLiner: 'Two hole cards each. Burn/flop/turn/river triggered by host. No rule enforcement.',
  minPlayers: 2,
  maxPlayers: 10,
  backs: ['back-crimson'],
  deal: { pattern: 'roundRobin', rounds: 2, face: 'down', to: 'hand' },
  actionPolicy: {
    allowDraw: false,
    allowDiscard: false,
    allowFlip: false,
    allowPassTurn: false,
    allowPlay: true,
  },
  turnPolicy: 'roundRobin',
  winCondition: 'scoreTarget',
  helpers: { rankHand: true },
});

export const builtinPresets: Preset[] = [
  freeplayPreset,
  dealTwoEachPreset,
  warPreset,
  goFishPreset,
  oldMaidPreset,
  crazyEightsPreset,
  sevensPreset,
  klondikePreset,
  blackjackStylePreset,
  pokerStylePreset,
];

export function findPreset(id: string | null | undefined): Preset {
  if (!id) return freeplayPreset;
  return builtinPresets.find((p) => p.id === id) ?? freeplayPreset;
}
