import type { Player, SessionConfig, Zone, ZoneId } from './types';
import { ZONE_DISCARD, ZONE_DRAW, ZONE_MUCK, handZoneId, tableZoneId } from './types';

export interface PresetSetupInput {
  players: Player[];
  config: SessionConfig;
  deckOrder: string[];
}

export interface PresetSetupResult {
  zones: Zone[];
  initialDeals: { cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }[];
}

export interface Preset {
  id: string;
  name: string;
  summary: string;
  supportsPlayerCount: (n: number) => boolean;
  setup: (input: PresetSetupInput) => PresetSetupResult;
  helpers?: {
    showHandSum?: boolean;
  };
}

function buildCoreZones(players: Player[]): Zone[] {
  const zones: Zone[] = [
    { id: ZONE_DRAW, label: 'Draw pile', visibility: { kind: 'hidden' }, cardIds: [] },
    { id: ZONE_DISCARD, label: 'Discard', visibility: { kind: 'public' }, cardIds: [] },
    { id: ZONE_MUCK, label: 'Muck', visibility: { kind: 'hidden' }, cardIds: [] },
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

function fillDrawZone(zones: Zone[], deckOrder: string[]): Zone[] {
  return zones.map((zone) =>
    zone.id === ZONE_DRAW ? { ...zone, cardIds: deckOrder.slice() } : zone,
  );
}

export const freeplayPreset: Preset = {
  id: 'freeplay',
  name: 'Freeplay',
  summary: 'A shuffled deck on the table. Deal, draw, and flip however you like.',
  supportsPlayerCount: (n) => n >= 1 && n <= 12,
  setup: ({ players, deckOrder }) => {
    const zones = fillDrawZone(buildCoreZones(players), deckOrder);
    return { zones, initialDeals: [] };
  },
};

export const dealTwoEachPreset: Preset = {
  id: 'deal-two-each',
  name: 'Deal 2 each',
  summary: 'Two cards dealt face-down to every player. Rest stays in the draw pile.',
  supportsPlayerCount: (n) => n >= 2 && n <= 10,
  setup: ({ players, deckOrder }) => {
    const zones = buildCoreZones(players);
    const queue = deckOrder.slice();
    const deals: PresetSetupResult['initialDeals'] = [];
    for (let round = 0; round < 2; round += 1) {
      for (const player of players) {
        const cardId = queue.shift();
        if (!cardId) break;
        deals.push({ cardId, toZoneId: handZoneId(player.id), face: 'down' });
      }
    }
    const withDraw = zones.map((zone) =>
      zone.id === ZONE_DRAW ? { ...zone, cardIds: queue } : zone,
    );
    return { zones: withDraw, initialDeals: deals };
  },
};

export const blackjackStylePreset: Preset = {
  id: 'blackjack',
  name: 'Blackjack-style',
  summary: '2 to each player face-up, dealer 1 up + 1 down. Scoring helper, no betting.',
  supportsPlayerCount: (n) => n >= 2 && n <= 7,
  setup: ({ players, deckOrder }) => {
    const zones = buildCoreZones(players);
    const queue = deckOrder.slice();
    const deals: PresetSetupResult['initialDeals'] = [];
    const dealer = players[0];
    const nonDealer = players.slice(1);
    for (let round = 0; round < 2; round += 1) {
      for (const player of nonDealer) {
        const cardId = queue.shift();
        if (!cardId) break;
        deals.push({ cardId, toZoneId: handZoneId(player.id), face: 'up' });
      }
      if (dealer) {
        const cardId = queue.shift();
        if (cardId) {
          deals.push({
            cardId,
            toZoneId: handZoneId(dealer.id),
            face: round === 0 ? 'up' : 'down',
          });
        }
      }
    }
    const withDraw = zones.map((zone) =>
      zone.id === ZONE_DRAW ? { ...zone, cardIds: queue } : zone,
    );
    return { zones: withDraw, initialDeals: deals };
  },
  helpers: { showHandSum: true },
};

export const pokerStylePreset: Preset = {
  id: 'poker',
  name: 'Poker-style',
  summary: 'Two hole cards each. Burn/flop/turn/river triggered by host. No rule enforcement.',
  supportsPlayerCount: (n) => n >= 2 && n <= 10,
  setup: ({ players, deckOrder }) => {
    const zones = buildCoreZones(players);
    const queue = deckOrder.slice();
    const deals: PresetSetupResult['initialDeals'] = [];
    for (let round = 0; round < 2; round += 1) {
      for (const player of players) {
        const cardId = queue.shift();
        if (!cardId) break;
        deals.push({ cardId, toZoneId: handZoneId(player.id), face: 'down' });
      }
    }
    const withDraw = zones.map((zone) =>
      zone.id === ZONE_DRAW ? { ...zone, cardIds: queue } : zone,
    );
    return { zones: withDraw, initialDeals: deals };
  },
};

export const builtinPresets: Preset[] = [
  freeplayPreset,
  dealTwoEachPreset,
  blackjackStylePreset,
  pokerStylePreset,
];

export function findPreset(id: string | null | undefined): Preset {
  if (!id) return freeplayPreset;
  return builtinPresets.find((p) => p.id === id) ?? freeplayPreset;
}
