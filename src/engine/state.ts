import type { GameEvent } from './events';
import type {
  CardInstance,
  GameState,
  Player,
  PokerBettingState,
  ZoneId,
} from './types';
import { PYRAMID_ZONE } from './solitaire';

const POKER_STARTING_STACK = 100;
const POKER_SMALL_BLIND = 5;
const POKER_BIG_BLIND = 10;

function createPokerBettingState(players: Player[]): PokerBettingState {
  const ordered = players.slice().sort((a, b) => a.seat - b.seat);
  const fallback = ordered[0]?.id ?? '';
  const dealerIndex = 0;
  const smallBlindIndex = ordered.length === 2 ? dealerIndex : (dealerIndex + 1) % Math.max(ordered.length, 1);
  const bigBlindIndex = ordered.length > 1 ? (smallBlindIndex + 1) % ordered.length : smallBlindIndex;
  const firstPreflopIndex = ordered.length === 2
    ? dealerIndex
    : (bigBlindIndex + 1) % Math.max(ordered.length, 1);
  const firstPostflopIndex = ordered.length === 2
    ? bigBlindIndex
    : ordered.length > 1
      ? (dealerIndex + 1) % ordered.length
      : dealerIndex;
  const stacks: Record<string, number> = {};
  const contributions: Record<string, number> = {};
  const roundContributions: Record<string, number> = {};
  for (const player of ordered) {
    stacks[player.id] = POKER_STARTING_STACK;
    contributions[player.id] = 0;
    roundContributions[player.id] = 0;
  }

  const smallBlindPlayerId = ordered[smallBlindIndex]?.id ?? fallback;
  const bigBlindPlayerId = ordered[bigBlindIndex]?.id ?? fallback;
  const smallBlind = smallBlindPlayerId ? Math.min(POKER_SMALL_BLIND, stacks[smallBlindPlayerId] ?? 0) : 0;
  const bigBlind = bigBlindPlayerId ? Math.min(POKER_BIG_BLIND, stacks[bigBlindPlayerId] ?? 0) : 0;
  if (smallBlindPlayerId) {
    stacks[smallBlindPlayerId] = (stacks[smallBlindPlayerId] ?? 0) - smallBlind;
    contributions[smallBlindPlayerId] = smallBlind;
    roundContributions[smallBlindPlayerId] = smallBlind;
  }
  if (bigBlindPlayerId) {
    stacks[bigBlindPlayerId] = (stacks[bigBlindPlayerId] ?? 0) - bigBlind;
    contributions[bigBlindPlayerId] = (contributions[bigBlindPlayerId] ?? 0) + bigBlind;
    roundContributions[bigBlindPlayerId] = (roundContributions[bigBlindPlayerId] ?? 0) + bigBlind;
  }

  return {
    dealerId: ordered[dealerIndex]?.id ?? fallback,
    smallBlindPlayerId,
    bigBlindPlayerId,
    firstPreflopPlayerId: ordered[firstPreflopIndex]?.id ?? fallback,
    firstPostflopPlayerId: ordered[firstPostflopIndex]?.id ?? fallback,
    smallBlind,
    bigBlind,
    currentBet: bigBlind,
    stacks,
    contributions,
    roundContributions,
    acted: [],
    roundComplete: ordered.length < 2,
    burnedStreet: null,
  };
}

function removeCardFromZone(state: GameState, cardId: string, toZoneId?: ZoneId): void {
  const card = state.cards[cardId];
  if (!card) return;
  const zone = state.zones[card.zoneId];
  if (!zone) return;
  // Pyramid solitaire keeps stable array indices: a card removed from the
  // pyramid (to the muck or any other zone) becomes an empty-string slot at
  // its original position, NOT a filtered-out entry. The geometry helpers
  // (isPyramidCardFree, pyramidChildren) index by position and use !cardId
  // to detect removal; filtering would shift every subsequent index and
  // corrupt the pyramid layout. `card/deal` re-inserts into the SAME zone,
  // so we only apply the stable-slot behaviour for genuine cross-zone moves.
  if (card.zoneId === PYRAMID_ZONE && toZoneId !== undefined && toZoneId !== card.zoneId) {
    state.zones[card.zoneId] = {
      ...zone,
      cardIds: zone.cardIds.map((id) => (id === cardId ? '' : id)),
    };
    return;
  }
  state.zones[card.zoneId] = {
    ...zone,
    cardIds: zone.cardIds.filter((id) => id !== cardId),
  };
}

function insertCardIntoZone(
  state: GameState,
  cardId: string,
  zoneId: ZoneId,
  index?: number,
): void {
  const zone = state.zones[zoneId];
  if (!zone) return;
  const next = zone.cardIds.slice();
  if (typeof index === 'number' && index >= 0 && index <= next.length) {
    next.splice(index, 0, cardId);
  } else {
    next.push(cardId);
  }
  state.zones[zoneId] = { ...zone, cardIds: next };
}

function syncCardOrders(state: GameState, zoneId: ZoneId): void {
  const zone = state.zones[zoneId];
  if (!zone) return;
  // Note: mutating state.cards[cid] is acceptable here because `state` is already
  // a shallow clone (the `next` object inside applyEvent). zone.cardIds is not
  // mutated directly; if it ever were, it would need cloning first.
  zone.cardIds.forEach((cid, idx) => {
    const card = state.cards[cid];
    if (card) {
      state.cards[cid] = { ...card, zoneId, order: idx };
    }
  });
}

export function emptyState(): GameState {
  return {
    meta: {
      id: '',
      createdAt: 0,
      rngSeed: '',
      mode: 'pass',
      surfaceProfile: 'hot-seat',
      seatBinding: { kind: 'shared-device', playerIds: [] },
      hostId: '',
    },
    config: {
      includeJokers: false,
      fanStyle: 'wide',
      autoReshuffleDiscard: true,
      presetId: null,
    },
    players: [],
    currentPlayerId: '',
    turn: 0,
    phase: 'idle',
    privacySeat: null,
    zones: {},
    cards: {},
    deckCardIds: [],
    winnerId: null,
  };
}

export function canApplyEvent(state: GameState, event: GameEvent): boolean {
  const phaseIsPlaying = state.phase === 'playing';
  const hasPlayer = (playerId: string): boolean => state.players.some((player) => player.id === playerId);
  const card = 'cardId' in event ? state.cards[event.cardId] : undefined;
  const cardIsInAZone = (cardId: string): boolean => Object.values(state.zones).some((zone) => zone.cardIds.includes(cardId));
  // session/start bootstraps the player list, so its actor cannot be validated
  // against players that do not exist yet.
  const actorIsKnown = event.type === 'session/start' || event.actorId === 'system' || hasPlayer(event.actorId);
  if (!actorIsKnown) return false;

  switch (event.type) {
    case 'session/start': {
      const ids = event.players.map((player) => player.id);
      return state.phase === 'idle'
        && event.players.length > 0
        && new Set(ids).size === ids.length
        && event.players.every((player) => player.id.length > 0 && player.name.length <= 80 && player.seat >= 0)
        && hasUniqueZoneCards(event.zones);
    }
    case 'card/deal':
    case 'card/move': {
      const destination = state.zones[event.toZoneId];
      if (!phaseIsPlaying || !card || !destination || !cardIsInAZone(event.cardId)) return false;
      return event.type !== 'card/move'
        || event.toIndex === undefined
        || (Number.isInteger(event.toIndex) && event.toIndex >= 0 && event.toIndex <= destination.cardIds.length);
    }
    case 'card/flip':
    case 'card/reveal':
      return phaseIsPlaying && !!card && cardIsInAZone(event.cardId);
    case 'card/peek':
      return phaseIsPlaying && !!card && cardIsInAZone(event.cardId) && hasPlayer(event.byPlayerId);
    case 'card/identify':
      return phaseIsPlaying && !!state.cards[event.cardId] && !state.cards[event.realId] && event.realId.length <= 128;
    case 'card/ask':
      return phaseIsPlaying && hasPlayer(event.targetPlayerId)
        && event.rank.length <= 16 && event.transferredCount >= 0 && Number.isInteger(event.transferredCount);
    case 'hand/reorder': {
      const zone = state.zones[`hand:${event.playerId}` as ZoneId];
      return phaseIsPlaying && !!zone
        && event.order.length === zone.cardIds.length
        && new Set(event.order).size === event.order.length
        && event.order.every((cardId) => zone.cardIds.includes(cardId));
    }
    case 'turn/set':
      return phaseIsPlaying && hasPlayer(event.playerId);
    case 'turn/end':
      return phaseIsPlaying && event.playerId === state.currentPlayerId;
    case 'privacy/enter':
      return phaseIsPlaying && hasPlayer(event.playerId);
    case 'privacy/exit':
      return phaseIsPlaying && state.privacySeat !== null;
    case 'deck/shuffle':
      return phaseIsPlaying && !!state.zones[event.zoneId]
        && hasUniqueIds(event.newOrder)
        && event.newOrder.length === state.zones[event.zoneId]!.cardIds.length
        && event.newOrder.every((cardId) => state.zones[event.zoneId]!.cardIds.includes(cardId));
    case 'game/street': {
      const currentStreet = state.game?.street ?? 0;
      return phaseIsPlaying && Number.isInteger(event.street)
        && ((state.config.presetId === 'war' && event.street === 0)
          || (event.street >= currentStreet && event.street <= 4));
    }
    case 'game/burn':
      return phaseIsPlaying && !!state.game && Number.isInteger(event.street) && event.street >= 0 && event.street <= 4;
    case 'game/fold':
      return phaseIsPlaying && hasPlayer(event.playerId) && event.playerId === state.currentPlayerId
        && !(state.game?.folded.includes(event.playerId) ?? false);
    case 'game/bet': {
      const betting = state.game?.betting;
      const stack = betting?.stacks[event.playerId];
      return phaseIsPlaying && !!betting && stack !== undefined
        && event.playerId === state.currentPlayerId
        && ['blind', 'check', 'call', 'raise', 'fold'].includes(event.action)
        && Number.isInteger(event.amount) && event.amount >= 0 && event.amount <= stack;
    }
    case 'session/pause':
      return phaseIsPlaying;
    case 'session/resume':
      return state.phase === 'paused';
    case 'session/end':
      return state.phase !== 'idle' && (event.winnerId === undefined || hasPlayer(event.winnerId));
    default:
      return false;
  }
}

function hasUniqueIds(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function hasUniqueZoneCards(zones: { cardIds: string[] }[]): boolean {
  const cards = zones.flatMap((zone) => zone.cardIds);
  return hasUniqueIds(cards);
}

export function applyEvent(prev: GameState, event: GameEvent): GameState {
  // Shallow clone mutable containers; keeps reducer simple without deep structural sharing.
  const next: GameState = {
    ...prev,
    zones: { ...prev.zones },
    cards: { ...prev.cards },
    players: prev.players.slice(),
    deckCardIds: prev.deckCardIds.slice(),
  };

  if (!canApplyEvent(prev, event)) {
    if (__DEV__) {
      console.warn(`[engine] canApplyEvent rejected event ${event.type} (seq ${event.seq})`);
    }
    return prev;
  }

  switch (event.type) {
    case 'session/start': {
      next.meta = event.meta;
      next.config = event.config;
      next.players = event.players.map((p) => ({ ...p }));
      const pokerBetting = event.config.presetId === 'poker'
        ? createPokerBettingState(next.players)
        : undefined;
      next.currentPlayerId = pokerBetting?.firstPreflopPlayerId ?? event.meta.hostId;
      next.turn = 0;
      next.phase = 'playing';
      next.zones = {};
      for (const zone of event.zones) {
        next.zones[zone.id] = { ...zone, cardIds: zone.cardIds.slice() };
      }
      next.cards = {};
      for (const zone of event.zones) {
        zone.cardIds.forEach((cid, idx) => {
          next.cards[cid] = {
            id: cid,
            face: 'down',
            zoneId: zone.id,
            order: idx,
          } satisfies CardInstance;
        });
      }
      next.deckCardIds = Object.keys(next.cards);
      next.winnerId = null;
      next.privacySeat = null;
      next.game = pokerBetting
        ? {
            street: 0,
            folded: [],
            pot: pokerBetting.smallBlind + pokerBetting.bigBlind,
            betting: pokerBetting,
          }
        : undefined;
      return next;
    }

    case 'deck/shuffle': {
      const zone = next.zones[event.zoneId];
      if (!zone) return next;
      next.zones[event.zoneId] = { ...zone, cardIds: event.newOrder.slice() };
      syncCardOrders(next, event.zoneId);
      return next;
    }

    case 'card/deal':
    case 'card/move': {
      const card = next.cards[event.cardId];
      if (!card) return next;
      const fromZoneId = card.zoneId;
      removeCardFromZone(next, event.cardId, event.toZoneId);
      insertCardIntoZone(next, event.cardId, event.toZoneId, event.type === 'card/move' ? event.toIndex : undefined);
      const nextFace = event.face ?? card.face;
      next.cards[event.cardId] = {
        ...card,
        face: nextFace,
        zoneId: event.toZoneId,
        order: next.zones[event.toZoneId]?.cardIds.indexOf(event.cardId) ?? 0,
      };
      if (fromZoneId !== event.toZoneId) {
        syncCardOrders(next, fromZoneId);
      }
      syncCardOrders(next, event.toZoneId);
      return next;
    }

    case 'card/flip': {
      const card = next.cards[event.cardId];
      if (!card) return next;
      next.cards[event.cardId] = { ...card, face: card.face === 'up' ? 'down' : 'up' };
      return next;
    }

    case 'card/peek': {
      // Peek is an ephemeral privacy event; state doesn't change canonically.
      return next;
    }

    case 'card/ask': {
      // Go Fish asks are an auditable marker. The actual private transfer is
      // represented by the following card/move or card/deal events.
      return next;
    }

    case 'card/reveal': {
      const card = next.cards[event.cardId];
      if (!card) return next;
      next.cards[event.cardId] = { ...card, face: 'up' };
      return next;
    }

    case 'card/identify': {
      // Guest-side privacy remap: the placeholder id becomes the real card id
      // once the card is visible to this viewer. The placeholder keeps the
      // same zone/order; only the id changes.
      const placeholder = next.cards[event.cardId];
      if (!placeholder) return next;
      if (next.cards[event.realId]) return next; // already identified
      const zone = next.zones[placeholder.zoneId];
      if (!zone) return next;
      next.cards[event.realId] = { ...placeholder, id: event.realId };
      delete next.cards[event.cardId];
      next.zones[placeholder.zoneId] = {
        ...zone,
        cardIds: zone.cardIds.map((cid) => (cid === event.cardId ? event.realId : cid)),
      };
      next.deckCardIds = next.deckCardIds.map((cid) => (cid === event.cardId ? event.realId : cid));
      return next;
    }

    case 'hand/reorder': {
      const zoneId = `hand:${event.playerId}`;
      const zone = next.zones[zoneId];
      if (!zone) return next;
      const validOrder = event.order.filter((cid) => zone.cardIds.includes(cid));
      next.zones[zoneId] = { ...zone, cardIds: validOrder };
      syncCardOrders(next, zoneId);
      return next;
    }

    case 'turn/set': {
      next.currentPlayerId = event.playerId;
      return next;
    }

    case 'turn/end': {
      const currentIndex = next.players.findIndex((p) => p.id === event.playerId);
      if (currentIndex < 0 || next.players.length === 0) return next;
      const nextPlayer = next.players[(currentIndex + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayer.id;
      next.turn = prev.turn + 1;
      return next;
    }

    case 'privacy/enter': {
      next.privacySeat = event.playerId;
      return next;
    }

    case 'privacy/exit': {
      next.privacySeat = null;
      return next;
    }

    case 'game/street': {
      const game = next.game ?? { street: 0, folded: [], pot: 0 };
      const betting = game.betting
        ? {
            ...game.betting,
            currentBet: 0,
            roundContributions: Object.fromEntries(
              Object.keys(game.betting.roundContributions).map((playerId) => [playerId, 0]),
            ),
            acted: [],
            roundComplete: false,
            burnedStreet: null,
          }
        : undefined;
      next.game = { ...game, street: event.street, ...(betting ? { betting } : {}) };
      return next;
    }

    case 'game/burn': {
      const game = next.game;
      if (!game?.betting) return next;
      next.game = {
        ...game,
        betting: { ...game.betting, burnedStreet: event.street },
      };
      return next;
    }

    case 'game/bet': {
      const game = next.game ?? { street: 0, folded: [], pot: 0 };
      const betting = game.betting;
      if (!betting || !(event.playerId in betting.stacks)) return next;
      const available = betting.stacks[event.playerId] ?? 0;
      const amount = Math.max(0, Math.min(Math.floor(event.amount), available));
      const nextStacks = { ...betting.stacks, [event.playerId]: available - amount };
      const nextContributions = {
        ...betting.contributions,
        [event.playerId]: (betting.contributions[event.playerId] ?? 0) + amount,
      };
      const nextRoundContributions = {
        ...betting.roundContributions,
        [event.playerId]: (betting.roundContributions[event.playerId] ?? 0) + amount,
      };
      const currentBet = event.action === 'raise'
        ? Math.max(betting.currentBet, nextRoundContributions[event.playerId] ?? 0)
        : betting.currentBet;
      const acted = event.action === 'raise'
        ? [event.playerId]
        : Array.from(new Set([...betting.acted, event.playerId]));
      next.game = {
        ...game,
        pot: game.pot + amount,
        betting: {
          ...betting,
          stacks: nextStacks,
          contributions: nextContributions,
          roundContributions: nextRoundContributions,
          currentBet,
          acted,
          roundComplete: event.roundComplete ?? false,
        },
      };
      return next;
    }

    case 'game/fold': {
      const game = next.game ?? { street: 0, folded: [], pot: 0 };
      next.game = {
        ...game,
        folded: game.folded.includes(event.playerId)
          ? game.folded
          : [...game.folded, event.playerId],
      };
      return next;
    }

    case 'session/pause': {
      next.phase = 'paused';
      return next;
    }

    case 'session/resume': {
      next.phase = 'playing';
      return next;
    }

    case 'session/end': {
      next.phase = 'ended';
      next.winnerId = event.winnerId ?? null;
      return next;
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return next;
    }
  }
}

export function foldEvents(events: GameEvent[]): GameState {
  return events.reduce<GameState>((s, e) => applyEvent(s, e), emptyState());
}

export function visibleCardsForPlayer(state: GameState, viewerId: string): Set<string> {
  const visible = new Set<string>();
  for (const zone of Object.values(state.zones)) {
    const isPrivateToViewer =
      zone.visibility.kind === 'private' && zone.visibility.ownerId === viewerId;
    const isPublic = zone.visibility.kind === 'public';
    for (const cid of zone.cardIds) {
      const card = state.cards[cid];
      if (!card) continue;
      if (isPublic || isPrivateToViewer || card.face === 'up') {
        visible.add(cid);
      }
    }
  }
  return visible;
}

