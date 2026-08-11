import {
  executeRecipe,
  type Recipe,
  type RecipeSetupInput,
  type RecipeSetupResult,
} from './recipes';
import {
  buildKlondikeLayout,
  buildFreeCellLayout,
  buildPyramidLayout,
} from './solitaire';

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
  oneLiner: 'Post blinds, bet with chips, then build the best hand from the community.',
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

// ---------------------------------------------------------------------------
// Solitaire presets
//
// These don't use the standard executeRecipe round-robin deal; they use custom
// layout builders from solitaire.ts. The Preset wrapper still needs a `recipe`
// for the recipe-card UI, but `setup` is overridden to build the layout.
// ---------------------------------------------------------------------------

function makeSolitairePreset(
  recipe: Recipe,
  setupFn: (input: PresetSetupInput) => PresetSetupResult,
): Preset {
  return {
    recipe,
    id: recipe.id,
    name: recipe.name,
    summary: recipe.oneLiner,
    minPlayers: recipe.minPlayers,
    maxPlayers: recipe.maxPlayers,
    supportsPlayerCount: (n) => n >= recipe.minPlayers && n <= recipe.maxPlayers,
    setup: setupFn,
    helpers: recipe.helpers,
  };
}

function klondikeSetup(input: PresetSetupInput): PresetSetupResult {
  const layout = buildKlondikeLayout(input.deckOrder, input.players[0]!.id);
  return { zones: layout.zones, initialDeals: layout.initialDeals };
}

function freeCellSetup(input: PresetSetupInput): PresetSetupResult {
  const layout = buildFreeCellLayout(input.deckOrder, input.players[0]!.id);
  return { zones: layout.zones, initialDeals: layout.initialDeals };
}

function pyramidSetup(input: PresetSetupInput): PresetSetupResult {
  const layout = buildPyramidLayout(input.deckOrder, input.players[0]!.id);
  return { zones: layout.zones, initialDeals: layout.initialDeals };
}

export const klondikePreset = makeSolitairePreset(
  {
    id: 'klondike',
    name: 'Klondike',
    oneLiner: 'The classic solitaire: build the four foundations Ace to King.',
    minPlayers: 1,
    maxPlayers: 1,
    backs: ['back-brand'],
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
  },
  klondikeSetup,
);

export const freeCellPreset = makeSolitairePreset(
  {
    id: 'freecell',
    name: 'FreeCell',
    oneLiner: 'Every card face-up. Build the foundations with four free cells.',
    minPlayers: 1,
    maxPlayers: 1,
    backs: ['back-noir'],
    deal: { pattern: 'none', rounds: 0, face: 'down', to: 'table' },
    actionPolicy: {
      allowDraw: false,
      allowDiscard: false,
      allowFlip: false,
      allowPassTurn: false,
      allowPlay: true,
    },
    turnPolicy: 'free',
    winCondition: 'scoreTarget',
  },
  freeCellSetup,
);

export const pyramidPreset = makeSolitairePreset(
  {
    id: 'pyramid',
    name: 'Pyramid',
    oneLiner: 'Pair cards to thirteen and dismantle the pyramid.',
    minPlayers: 1,
    maxPlayers: 1,
    backs: ['back-crimson'],
    deal: { pattern: 'none', rounds: 0, face: 'down', to: 'table' },
    actionPolicy: {
      allowDraw: true,
      allowDiscard: false,
      allowFlip: false,
      allowPassTurn: false,
      allowPlay: true,
    },
    turnPolicy: 'free',
    winCondition: 'scoreTarget',
  },
  pyramidSetup,
);

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
  klondikePreset,
  freeCellPreset,
  pyramidPreset,
];

export function findPreset(id: string | null | undefined): Preset {
  if (!id) return freeplayPreset;
  return builtinPresets.find((p) => p.id === id) ?? freeplayPreset;
}
