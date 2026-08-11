import type { Rank, Suit } from '@lib/types';
import type { GameEvent } from './events';
import type {
  CardFace,
  CardId,
  CardInstance,
  GameState,
  JokerColor,
  Player,
  PlayerId,
} from './types';
import { ZONE_DISCARD, ZONE_DRAW, handZoneId, tableZoneId } from './types';
import { canApplyEvent, visibleCardsForPlayer } from './state';

const GLYPH_TO_SUIT: Record<string, Suit> = {
  H: 'hearts',
  D: 'diamonds',
  S: 'spades',
  C: 'clubs',
};

/**
 * Table actions are deliberately broader than the single suggested move.
 * Guidance can point at one useful next step without hiding any other move
 * the current state allows.
 */
export const TABLE_ACTIONS = [
  'draw',
  'flip',
  'discard',
  'reorder',
  'pass',
  'shuffle',
  'end',
] as const;

export type TableAction = (typeof TABLE_ACTIONS)[number];

export type GuidancePhase =
  | 'idle'
  | 'waiting'
  | 'draw'
  | 'flip'
  | 'discard'
  | 'pass'
  | 'end'
  | 'ended';

export type GuidanceState = GuidancePhase;

function selectorEventBase(actorId: PlayerId): Pick<GameEvent, 'id' | 'ts' | 'actorId' | 'seq'> {
  return { id: 'selector-preview', ts: 0, actorId, seq: 0 };
}

function hasPlayer(state: GameState, playerId: PlayerId): boolean {
  return state.players.some((player) => player.id === playerId);
}

/**
 * Parse a standard card ID (e.g. `"H-A"`, `"S-10"`) into rank + suit.
 * Returns `null` for jokers or unrecognised IDs.
 */
export function parseCardId(cardId: CardId): { rank: Rank; suit: Suit } | null {
  const dash = cardId.indexOf('-');
  if (dash < 1) return null;
  const glyph = cardId.slice(0, dash);
  const rank = cardId.slice(dash + 1);
  const suit = GLYPH_TO_SUIT[glyph];
  if (!suit) return null;
  return { rank: rank as Rank, suit };
}

/**
 * Parse joker card IDs (`JK-RED`, `JK-BLACK`). Returns `null` for standard cards.
 */
export function parseJokerId(cardId: CardId): JokerColor | null {
  if (cardId === 'JK-RED') return 'red';
  if (cardId === 'JK-BLACK') return 'black';
  return null;
}

/**
 * Number of cards remaining in the draw pile.
 */
export function selectDrawPileCount(state: GameState): number {
  const zone = state.zones[ZONE_DRAW];
  return zone ? zone.cardIds.length : 0;
}

/**
 * The top (last) card on the discard pile, or `null` if empty.
 */
export function selectDiscardTopCard(state: GameState): CardInstance | null {
  const zone = state.zones[ZONE_DISCARD];
  if (!zone || zone.cardIds.length === 0) return null;
  const topId = zone.cardIds[zone.cardIds.length - 1]!;
  return state.cards[topId] ?? null;
}

/**
 * All players except `localPlayerId`, in stable seat order starting
 * from the seat after local and wrapping around.
 */
export function selectOpponents(state: GameState, localPlayerId: PlayerId): Player[] {
  const local = state.players.find((p) => p.id === localPlayerId);
  if (!local) return state.players.filter((p) => p.id !== localPlayerId);

  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const localIdx = sorted.findIndex((p) => p.id === localPlayerId);
  const after = sorted.slice(localIdx + 1);
  const before = sorted.slice(0, localIdx);
  return [...after, ...before];
}

/**
 * Number of cards in a given player's hand zone.
 */
export function selectOpponentHandSize(state: GameState, playerId: PlayerId): number {
  const zone = state.config.presetId === 'war'
    ? state.zones[tableZoneId(playerId)]
    : state.zones[handZoneId(playerId)];
  return zone ? zone.cardIds.length : 0;
}

/**
 * Card instances in the local player's hand, in hand-zone order.
 */
export function selectLocalHand(state: GameState, localPlayerId: PlayerId): CardInstance[] {
  const zone = state.zones[handZoneId(localPlayerId)];
  if (!zone) return [];
  const result: CardInstance[] = [];
  for (const cid of zone.cardIds) {
    const card = state.cards[cid];
    if (card) result.push(card);
  }
  return result;
}

/**
 * Cards on the table in front of the local player.
 */
export function selectMyTableCards(state: GameState, localPlayerId: PlayerId): CardInstance[] {
  const zoneId = `table:${localPlayerId}`;
  const zone = state.zones[zoneId];
  if (!zone) return [];
  const result: CardInstance[] = [];
  for (const cid of zone.cardIds) {
    const card = state.cards[cid];
    if (card) result.push(card);
  }
  return result;
}

/**
 * The player whose turn it currently is.
 */
export function selectCurrentPlayerId(state: GameState): PlayerId | null {
  return state.currentPlayerId || null;
}

/**
 * Current session phase (idle, playing, paused, ended).
 */
export function selectSessionPhase(state: GameState): GameState['phase'] {
  return state.phase;
}

/**
 * Whether the session has ended.
 */
export function selectIsSessionEnded(state: GameState): boolean {
  return state.phase === 'ended';
}

/**
 * Whether it is the local player's turn.
 */
export function selectIsMyTurn(state: GameState, localPlayerId: PlayerId): boolean {
  return state.currentPlayerId === localPlayerId;
}

/**
 * Actions that are currently valid for a player at the table.
 *
 * This is an affordance selector, not a second rules engine: each candidate
 * event is checked with `canApplyEvent`, then narrowed by the phase, turn, and
 * host ownership rules that the table surface already uses. The returned Set
 * is informational; callers must not use it to hide a valid control.
 */
export function selectAvailableActions(
  state: GameState,
  viewerId: PlayerId,
): ReadonlySet<TableAction> {
  const actions = new Set<TableAction>();
  if (state.phase !== 'playing' || !hasPlayer(state, viewerId)) return actions;

  const base = selectorEventBase(viewerId);
  const isCurrentPlayer = selectIsMyTurn(state, viewerId);
  const hand = selectLocalHand(state, viewerId);

  // Rule-driven library games expose their own contextual action specs from
  // rules.ts. Do not advertise generic draw/discard/pass gestures alongside
  // those buttons; that would let a table bypass the recipe's turn flow.
  if (['go-fish', 'old-maid', 'crazy-eights', 'sevens'].includes(state.config.presetId ?? '')) {
    if (state.meta.hostId === viewerId && canApplyEvent(state, { ...base, type: 'session/end' })) {
      actions.add('end');
    }
    return actions;
  }

  if (isCurrentPlayer) {
    if (state.config.presetId === 'war') {
      if ((state.zones[tableZoneId(viewerId)]?.cardIds.length ?? 0) > 0) actions.add('flip');
    } else {
    const drawTopId = selectDrawTopCardId(state);
    if (
      drawTopId &&
      canApplyEvent(state, {
        ...base,
        type: 'card/deal',
        cardId: drawTopId,
        toZoneId: handZoneId(viewerId),
        face: 'up',
      })
    ) {
      actions.add('draw');
    }

    const canFlipHandCard = hand.some((card) =>
      canApplyEvent(state, { ...base, type: 'card/flip', cardId: card.id }),
    );
    if (canFlipHandCard) {
      actions.add('flip');
    }
    const canDiscardHandCard = hand.some((card) =>
      canApplyEvent(state, {
        ...base,
        type: 'card/move',
        cardId: card.id,
        toZoneId: ZONE_DISCARD,
        face: 'up',
      }),
    );
    if (canDiscardHandCard) {
      actions.add('discard');
    }
    if (
      hand.length > 1 &&
      canApplyEvent(state, {
        ...base,
        type: 'hand/reorder',
        playerId: viewerId,
        order: hand.map((card) => card.id),
      })
    ) {
      actions.add('reorder');
    }

    if (
      selectNextPlayerId(state) &&
      canApplyEvent(state, { ...base, type: 'turn/end', playerId: viewerId })
    ) {
      actions.add('pass');
    }
    }
  }

  // Host-level controls remain available outside the current player's turn.
  // They are included here so guidance can explain the full set of safe,
  // non-blocking alternatives instead of implying that the turn is a lock.
  if (state.meta.hostId === viewerId) {
    const drawZone = state.zones[ZONE_DRAW];
    if (
      drawZone &&
      drawZone.cardIds.length > 1 &&
      canApplyEvent(state, {
        ...base,
        type: 'deck/shuffle',
        zoneId: ZONE_DRAW,
        newOrder: drawZone.cardIds,
      })
    ) {
      actions.add('shuffle');
    }
    if (canApplyEvent(state, { ...base, type: 'session/end' })) {
      actions.add('end');
    }
  }

  return actions;
}

/**
 * The one move worth calling out first. A suggestion never removes the other
 * actions from `selectAvailableActions` and is intentionally null while the
 * viewer is waiting on another player.
 */
export function selectSuggestedAction(
  state: GameState,
  viewerId: PlayerId,
): TableAction | null {
  if (state.phase !== 'playing' || !hasPlayer(state, viewerId) || !selectIsMyTurn(state, viewerId)) {
    return null;
  }

  const available = selectAvailableActions(state, viewerId);
  const hand = selectLocalHand(state, viewerId);

  if (['go-fish', 'old-maid', 'crazy-eights', 'sevens'].includes(state.config.presetId ?? '')) return null;
  if (state.config.presetId === 'war' && available.has('flip')) return 'flip';
  if (hand.length === 0 && available.has('draw')) return 'draw';
  if (hand.some((card) => card.face === 'down') && available.has('flip')) return 'flip';
  if (hand.length > 0 && available.has('discard')) return 'discard';
  if (available.has('draw')) return 'draw';
  if (available.has('pass')) return 'pass';
  if (available.has('end')) return 'end';
  return null;
}

/**
 * Small semantic state for the table guidance strip. Keeping this derived
 * state in the engine lets the UI render copy and motion without re-encoding
 * turn/phase rules in a component.
 */
export function selectGuidanceState(state: GameState, viewerId: PlayerId): GuidancePhase {
  if (state.phase === 'idle') return 'idle';
  if (state.phase === 'ended') return 'ended';
  if (state.phase !== 'playing' || !hasPlayer(state, viewerId) || !selectIsMyTurn(state, viewerId)) {
    return 'waiting';
  }
  const suggested = selectSuggestedAction(state, viewerId);
  if (
    suggested === 'draw' ||
    suggested === 'flip' ||
    suggested === 'discard' ||
    suggested === 'pass' ||
    suggested === 'end'
  ) {
    return suggested;
  }
  return 'waiting';
}

/**
 * The next player in seat order after the current player (wraparound).
 * Returns `null` if there are fewer than 2 players.
 */
export function selectNextPlayerId(state: GameState): PlayerId | null {
  if (state.players.length < 2) return null;
  const sorted = state.players.slice().sort((a, b) => a.seat - b.seat);
  const idx = sorted.findIndex((p) => p.id === state.currentPlayerId);
  if (idx < 0) return sorted[0]?.id ?? null;
  const next = sorted[(idx + 1) % sorted.length]!;
  return next.id;
}

/**
 * Whether a card should show face-up to the given viewer.
 * Returns `'up'` if the card is visible per zone privacy + card face rules,
 * otherwise `'down'`.
 */
export function selectCardFace(
  state: GameState,
  cardId: CardId,
  viewerId: PlayerId | null,
): CardFace {
  if (!viewerId) return 'down';
  const visible = visibleCardsForPlayer(state, viewerId);
  return visible.has(cardId) ? 'up' : 'down';
}

/**
 * The first card id in the draw pile (top of deck), or `null`.
 */
export function selectDrawTopCardId(state: GameState): CardId | null {
  const zone = state.zones[ZONE_DRAW];
  if (!zone || zone.cardIds.length === 0) return null;
  return zone.cardIds[0] ?? null;
}
