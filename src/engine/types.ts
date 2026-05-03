import type { Rank, Suit } from '@lib/types';

export type CardId = string;
export type PlayerId = string;
export type ZoneId = string;

export type JokerColor = 'red' | 'black';

export interface StandardCard {
  id: CardId;
  kind: 'standard';
  rank: Rank;
  suit: Suit;
}

export interface JokerCard {
  id: CardId;
  kind: 'joker';
  color: JokerColor;
}

export type DeckCard = StandardCard | JokerCard;

export type CardFace = 'up' | 'down';

export interface CardInstance {
  id: CardId;
  face: CardFace;
  zoneId: ZoneId;
  order: number;
}

export type ZoneVisibility =
  | { kind: 'public' }
  | { kind: 'private'; ownerId: PlayerId }
  | { kind: 'hidden' };

export interface Zone {
  id: ZoneId;
  label: string;
  visibility: ZoneVisibility;
  ownerId?: PlayerId;
  cardIds: CardId[];
}

export interface Player {
  id: PlayerId;
  name: string;
  seat: number;
  avatarSeed: string;
}

export type FanStyle = 'tight' | 'wide' | 'stacked';

export interface SessionConfig {
  includeJokers: boolean;
  fanStyle: FanStyle;
  autoReshuffleDiscard: boolean;
  presetId: string | null;
}

export interface SessionMeta {
  id: string;
  createdAt: number;
  rngSeed: string;
  mode: 'pass' | 'ble-host' | 'ble-guest' | 'online-host' | 'online-guest';
  hostId: PlayerId;
}

export interface GameState {
  meta: SessionMeta;
  config: SessionConfig;
  players: Player[];
  currentPlayerId: PlayerId;
  turn: number;
  phase: 'idle' | 'playing' | 'paused' | 'ended';
  privacySeat: PlayerId | null;
  zones: Record<ZoneId, Zone>;
  cards: Record<CardId, CardInstance>;
  deckCardIds: CardId[];
  winnerId: PlayerId | null;
}

export const ZONE_DRAW: ZoneId = 'draw';
export const ZONE_DISCARD: ZoneId = 'discard';
export const ZONE_MUCK: ZoneId = 'muck';

export function handZoneId(playerId: PlayerId): ZoneId {
  return `hand:${playerId}`;
}

export function tableZoneId(playerId: PlayerId): ZoneId {
  return `table:${playerId}`;
}

export function communalZoneId(index: number): ZoneId {
  return `communal:${index}`;
}
