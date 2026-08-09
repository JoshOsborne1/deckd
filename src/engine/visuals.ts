import type { Rank, Suit } from '@lib/types';

export type CardKind = 'standard' | 'joker' | 'custom';
export type CardBackFamily = 'brand' | 'ink' | 'premium' | 'custom';

export interface CardVisualRef {
  /** Asset key or Rive artboard name for the face */
  faceAsset?: string;
  /** Rive state machine input for interaction states (idle/pressed/hover) */
  faceStateMachine?: string;
  /** Optional foil/holographic tint */
  foilTint?: string;
  /** Optional edge highlight color */
  edgeColor?: string;
}

export interface CardDefinition {
  id: string;
  kind: CardKind;
  rank?: Rank;
  suit?: Suit;
  title?: string;
  subtitle?: string;
  tags?: string[];
  visuals: CardVisualRef;
  /** Gameplay overrides for custom cards */
  gameplay?: Record<string, unknown>;
}

export interface CardBackDefinition {
  id: string;
  name: string;
  family: CardBackFamily;
  /** Rive asset name, SVG asset key, or gradient key */
  asset?: string;
  /** Dominant palette for preview swatches */
  palette?: string[];
  /** Whether this back is available at start or requires unlock/purchase */
  unlockedByDefault?: boolean;
  /** SKU identifier for store integration */
  sku?: string;
}

export interface DeckDefinition {
  id: string;
  name: string;
  cardIds: string[];
  defaultBackId: string;
  /** Whether jokers are included by default */
  includeJokers?: boolean;
}

export interface TableThemeDefinition {
  id: string;
  name: string;
  family: 'felt' | 'wood' | 'premium' | 'custom';
  /** Background base color (hex or token) */
  surfaceBase: string;
  /** Rail/border color */
  railColor: string;
  /** Well/community area color */
  wellColor: string;
  /** Ambient glow/shadow tint */
  glowTint?: string;
  /** Asset key for texture/pattern */
  textureAsset?: string;
  unlockedByDefault?: boolean;
  sku?: string;
}

/** Runtime visual config selected by the user */
export interface RuntimeVisualConfig {
  equippedBackId: string;
  equippedTableThemeId: string;
  equippedDeckId: string;
}

/** Built-in card backs shipped with the app */
export const BUILTIN_CARD_BACKS: CardBackDefinition[] = [
  {
    id: 'back-brand',
    name: 'Deckd Crimson',
    family: 'brand',
    asset: 'card_back_brand',
    palette: ['#B02020', '#901A1A', '#FFFFFF'],
    unlockedByDefault: true,
  },
  {
    id: 'back-ink',
    name: 'Midnight Ink',
    family: 'ink',
    asset: 'card_back_ink',
    palette: ['#1A1A1A', '#333333', '#666666'],
    unlockedByDefault: true,
  },
  {
    id: 'back-premium-gold',
    name: 'Gilded Edge',
    family: 'premium',
    asset: 'card_back_gold',
    palette: ['#D4AF37', '#B8860B', '#1A1A1A'],
    unlockedByDefault: false,
    sku: 'deckd_back_gold',
  },
];

/** Built-in table themes shipped with the app */
export const BUILTIN_TABLE_THEMES: TableThemeDefinition[] = [
  {
    id: 'theme-ivory',
    name: 'Ivory Table',
    family: 'premium',
    surfaceBase: '#F8F6F1',
    railColor: '#D8D2C6',
    wellColor: '#EFEBE2',
    glowTint: 'rgba(248,246,241,0.55)',
    unlockedByDefault: true,
  },
  {
    id: 'theme-classic-felt',
    name: 'Crimson Felt',
    family: 'felt',
    surfaceBase: '#7A2424',
    railColor: '#3C1111',
    wellColor: '#5A1B1B',
    glowTint: 'rgba(176,32,32,0.3)',
    unlockedByDefault: true,
  },
  {
    id: 'theme-dark-wood',
    name: 'Dark Oak',
    family: 'wood',
    surfaceBase: '#3D2B1F',
    railColor: '#2A1D15',
    wellColor: '#332310',
    glowTint: 'rgba(61,43,31,0.4)',
    unlockedByDefault: true,
  },
  {
    id: 'theme-crimson-luxe',
    name: 'Crimson Luxe',
    family: 'premium',
    surfaceBase: '#4A1515',
    railColor: '#2D0D0D',
    wellColor: '#3D1111',
    glowTint: 'rgba(176,32,32,0.3)',
    unlockedByDefault: false,
    sku: 'deckd_theme_crimson_luxe',
  },
];

/** Default 52-card deck definition */
export const STANDARD_DECK: DeckDefinition = {
  id: 'deck-standard-52',
  name: 'Standard 52',
  cardIds: [], // populated at runtime from deck builder
  defaultBackId: 'back-brand',
  includeJokers: false,
};

/** Resolve a back definition by id */
export function findBackById(id: string): CardBackDefinition | undefined {
  return BUILTIN_CARD_BACKS.find((b) => b.id === id);
}

/** Resolve a table theme by id */
export function findTableThemeById(id: string): TableThemeDefinition | undefined {
  return BUILTIN_TABLE_THEMES.find((t) => t.id === id);
}

/** Whether a visual item is unlocked for the current user profile */
export function isVisualUnlocked(
  item: CardBackDefinition | TableThemeDefinition,
  ownedSkus: Set<string>,
): boolean {
  if (item.unlockedByDefault) return true;
  if (!item.sku) return false;
  return ownedSkus.has(item.sku);
}
