import type { GameEvent } from './events';
import type {
  CardInstance,
  GameState,
  ZoneId,
} from './types';

function removeCardFromZone(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const zone = state.zones[card.zoneId];
  if (!zone) return;
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
  switch (event.type) {
    case 'card/deal':
    case 'card/move': {
      return !!state.cards[event.cardId] && !!state.zones[event.toZoneId];
    }
    case 'card/flip':
    case 'card/reveal': {
      return !!state.cards[event.cardId];
    }
    case 'hand/reorder': {
      const zoneId = `hand:${event.playerId}` as ZoneId;
      const zone = state.zones[zoneId];
      if (!zone) return false;
      return event.order.every((cid) => zone.cardIds.includes(cid));
    }
    case 'turn/end': {
      return event.playerId === state.currentPlayerId;
    }
    case 'deck/shuffle': {
      return !!state.zones[event.zoneId];
    }
    case 'session/start': {
      return event.players.length > 0;
    }
    default:
      return true;
  }
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
      // eslint-disable-next-line no-console
      console.warn(`[engine] canApplyEvent rejected event ${event.type} (seq ${event.seq})`);
    }
    return prev;
  }

  switch (event.type) {
    case 'session/start': {
      next.meta = event.meta;
      next.config = event.config;
      next.players = event.players.map((p) => ({ ...p }));
      next.currentPlayerId = event.meta.hostId;
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
      removeCardFromZone(next, event.cardId);
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

    case 'card/reveal': {
      const card = next.cards[event.cardId];
      if (!card) return next;
      next.cards[event.cardId] = { ...card, face: 'up' };
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

