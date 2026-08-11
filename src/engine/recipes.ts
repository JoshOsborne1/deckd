import type { CardFace, SessionConfig, Player, Zone, ZoneId } from './types';
import {
  ZONE_DISCARD,
  ZONE_DRAW,
  ZONE_MUCK,
  communalZoneId,
  handZoneId,
  tableZoneId,
} from './types';

export type RecipeDealPattern = 'roundRobin' | 'perPlayer' | 'none';
export type RecipeDealFace = 'up' | 'down' | 'upDown' | 'mixed';
export type RecipeTarget = 'hand' | 'table';
export type RecipeMatchRule = 'suitRank' | 'rank' | 'suit' | 'sevenAround' | 'none';
export type RecipeTurnPolicy = 'roundRobin' | 'dealerFirst' | 'free';
export type RecipeWinCondition = 'none' | 'firstEmptyHand' | 'scoreTarget' | 'lastHolding';

export interface RecipeDeal {
  pattern: RecipeDealPattern;
  rounds: number;
  face: RecipeDealFace;
  to: RecipeTarget;
  /** The last seat is treated as a dealer and receives its cards after players. */
  dealer?: boolean;
  /** Face policy for non-dealer cards when `face` is upDown or mixed. */
  playerFace?: CardFace;
  /** Optional per-round face policy for the dealer. */
  dealerFaces?: CardFace[];
}

export interface RecipeActionPolicy {
  allowDraw: boolean;
  allowDiscard: boolean;
  matchRule?: RecipeMatchRule;
  allowFlip: boolean;
  allowPassTurn: boolean;
  allowAsk?: boolean;
  allowPlay?: boolean;
}

export interface RecipeHelpers {
  showHandSum?: boolean;
  rankHand?: boolean;
  scoreMelds?: boolean;
  countPairs?: boolean;
}

export interface RecipeVariants {
  jokers?: boolean;
  wilds?: string[];
  targetScore?: number;
}

/**
 * The serialisable game definition. A recipe describes a game without putting
 * its setup policy in a component or a one-off preset callback.
 */
export interface Recipe {
  id: string;
  name: string;
  oneLiner: string;
  minPlayers: number;
  maxPlayers: number;
  backs: string[];
  deal: RecipeDeal;
  actionPolicy: RecipeActionPolicy;
  turnPolicy: RecipeTurnPolicy;
  winCondition: RecipeWinCondition;
  helpers?: RecipeHelpers;
  variants?: RecipeVariants;
}

export interface RecipeSetupInput {
  players: Player[];
  config: SessionConfig;
  deckOrder: string[];
}

export interface RecipeInitialDeal {
  cardId: string;
  toZoneId: ZoneId;
  face: CardFace;
}

export interface RecipeSetupResult {
  zones: Zone[];
  initialDeals: RecipeInitialDeal[];
}

function buildCoreZones(players: Player[]): Zone[] {
  const zones: Zone[] = [
    { id: ZONE_DRAW, label: 'Draw pile', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: ZONE_DISCARD, label: 'Discard', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_MUCK, label: 'Muck', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: communalZoneId(0), label: 'Community', visibility: { kind: 'public' }, cardIds: [] },
  ];

  for (const player of players) {
    zones.push({
      id: handZoneId(player.id),
      label: `${player.name}'s hand`,
      visibility: { kind: 'private', ownerId: player.id },
      ownerId: player.id,
      cardIds: [],
    });
    zones.push({
      id: tableZoneId(player.id),
      label: `${player.name}'s table`,
      visibility: { kind: 'public' },
      ownerId: player.id,
      cardIds: [],
    });
  }

  return zones;
}

function applyDealsToZones(zones: Zone[], deals: RecipeInitialDeal[]): Zone[] {
  const byZone = new Map<string, string[]>();
  for (const deal of deals) {
    const list = byZone.get(deal.toZoneId) ?? [];
    list.push(deal.cardId);
    byZone.set(deal.toZoneId, list);
  }

  return zones.map((zone) => {
    const dealtCards = byZone.get(zone.id);
    return dealtCards ? { ...zone, cardIds: [...zone.cardIds, ...dealtCards] } : zone;
  });
}

function resolveDealFace(
  deal: RecipeDeal,
  isDealer: boolean,
  round: number,
): 'up' | 'down' {
  if (deal.face === 'up') return 'up';
  if (deal.face === 'down') return 'down';

  if (isDealer) {
    return deal.dealerFaces?.[round] ?? (round === 0 ? 'up' : 'down');
  }

  return deal.playerFace ?? 'up';
}

function dealZoneId(deal: RecipeDeal, player: Player): ZoneId {
  return deal.to === 'table' ? tableZoneId(player.id) : handZoneId(player.id);
}

/**
 * Execute a recipe into the zone layout and initial deal plan used by the
 * event-sourced engine. The function is pure: it only reads its inputs and
 * returns fresh arrays/objects, which makes recipes safe to test and persist.
 */
export function executeRecipe(recipe: Recipe, input: RecipeSetupInput): RecipeSetupResult {
  const zones = buildCoreZones(input.players);
  const queue = input.deckOrder.slice();
  const deals: RecipeInitialDeal[] = [];
  const dealer = recipe.deal.dealer ? input.players[input.players.length - 1] : undefined;
  const nonDealerPlayers = dealer
    ? input.players.filter((player) => player.id !== dealer.id)
    : input.players;
  const dealPlayers = dealer ? [...nonDealerPlayers, dealer] : input.players;
  const rounds = Math.max(0, Math.floor(recipe.deal.rounds));

  const addDeal = (player: Player, round: number) => {
    const cardId = queue.shift();
    if (!cardId) return;
    deals.push({
      cardId,
      toZoneId: dealZoneId(recipe.deal, player),
      face: resolveDealFace(recipe.deal, player.id === dealer?.id, round),
    });
  };

  if (recipe.deal.pattern === 'roundRobin') {
    for (let round = 0; round < rounds; round += 1) {
      for (const player of dealPlayers) addDeal(player, round);
    }
  } else if (recipe.deal.pattern === 'perPlayer') {
    for (const player of dealPlayers) {
      for (let round = 0; round < rounds; round += 1) addDeal(player, round);
    }
  }

  const withDraw = zones.map((zone) =>
    zone.id === ZONE_DRAW ? { ...zone, cardIds: queue } : zone,
  );
  return {
    zones: applyDealsToZones(withDraw, deals),
    initialDeals: deals,
  };
}
