/**
 * Engine legality provider (blueprint §7.3).
 *
 * `legalIntents(state, actor, surfaceRole)` returns source objects, legal
 * targets and concise labels. The engine remains the ONLY legality authority;
 * gesture code never contains game rules.
 */

import type { GameEvent } from './events';
import type { GameState, PlayerId, ZoneId } from './types';
import { handZoneId, tableZoneId, ZONE_DISCARD, ZONE_DRAW } from './types';
import { getGameRules, type GameAction, type GameActionSpec } from './rules';
import { selectLocalHand, selectIsMyTurn, selectOpponents } from './selectors';
import type { GameIntent } from './intents';
import type { SurfaceProfile } from './sessionTopology';

export type SurfaceRole = 'player' | 'table' | 'observer';

export interface LegalIntentSource {
  /** Zone the card currently rests in. */
  zoneId: ZoneId;
  /** Card ids that may be manipulated. */
  cardIds: string[];
  /** Concise label for the source (e.g. "Your hand"). */
  label: string;
}

export interface LegalIntentTarget {
  /** Zone id that accepts the source card(s). */
  zoneId: ZoneId;
  /** Concise label for the target (e.g. "Discard pile"). */
  label: string;
  /** Optional intent type that this target triggers. */
  intentType?: GameIntent['type'];
}

export interface LegalIntentsResult {
  sources: LegalIntentSource[];
  targets: LegalIntentTarget[];
  /** Typed operations the authority will accept in this state. */
  intentTypes: GameIntent['type'][];
  /** Concise guidance label for the current viewer. */
  label: string;
}

/**
 * Compute legal intents for a viewer at a given surface role.
 * The engine is the only legality authority; this is a pure function of state.
 */
export function legalIntents(
  state: GameState,
  actor: PlayerId,
  surfaceRole: SurfaceRole,
  profile?: SurfaceProfile,
): LegalIntentsResult {
  if (state.phase !== 'playing') {
    return { sources: [], targets: [], intentTypes: [], label: 'Session not playing' };
  }

  const isMyTurn = selectIsMyTurn(state, actor);
  if (!isMyTurn) {
    return { sources: [], targets: [], intentTypes: [], label: 'Waiting' };
  }
  const hand = selectLocalHand(state, actor);
  const rules = getGameRules(state.config.presetId);
  const ruleActions = rules.actions(state, actor);

  const sources: LegalIntentSource[] = [];
  const targets: LegalIntentTarget[] = [];
  const intentTypes = new Set<GameIntent['type']>(['hand.reorder']);

  // Hand source: cards the viewer may manipulate.
  const canExposePrivateHand = surfaceRole === 'player'
    && profile !== 'public-table';
  if (canExposePrivateHand && hand.length > 0) {
    sources.push({
      zoneId: handZoneId(actor),
      cardIds: hand.map((c) => c.id),
      label: 'Your hand',
    });
  }

  // Draw pile target (if draw is a legal action).
  const drawCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  if (isMyTurn && drawCount > 0 && ruleActions.some((spec) => spec.id === 'draw')) {
    targets.push({
      zoneId: ZONE_DRAW,
      label: 'Draw pile',
      intentType: 'pile.draw',
    });
  }

  const playable = ruleActions.filter((spec) => spec.id.startsWith('play:'));
  const isGenericTable = state.config.presetId === 'freeplay' || state.config.presetId === 'deal-two-each';
  if (isMyTurn && isGenericTable) {
    intentTypes.add('card.move');
    intentTypes.add('card.flip');
    intentTypes.add('pile.take');
    intentTypes.add('turn.pass');
    for (const zone of Object.values(state.zones)) {
      if (zone.visibility.kind === 'public' && zone.cardIds.length > 0) {
        sources.push({
          zoneId: zone.id,
          cardIds: [...zone.cardIds],
          label: zone.label,
        });
      }
      if (zone.id !== ZONE_DRAW) {
        targets.push({
          zoneId: zone.id,
          label: zone.label,
          intentType: 'card.move',
        });
      }
    }
    if (drawCount > 0) {
      intentTypes.add('pile.draw');
      targets.push({
        zoneId: ZONE_DRAW,
        label: 'Draw pile',
        intentType: 'pile.draw',
      });
    }
    if (state.zones[ZONE_DISCARD]) {
      targets.push({
        zoneId: ZONE_DISCARD,
        label: 'Discard pile',
        intentType: 'card.move',
      });
    }
    targets.push({
      zoneId: 'turn',
      label: 'Pass turn',
      intentType: 'turn.pass',
    });
  }

  if (playable.length > 0) {
    intentTypes.add('card.move');
    targets.push({
      zoneId: ZONE_DISCARD,
      label: 'Discard pile',
      intentType: 'card.move',
    });
    // Mark playable cards in the hand source.
    const playableIds = new Set(playable.map((spec) => spec.id.slice('play:'.length)));
    const handSource = sources.find((s) => s.zoneId === handZoneId(actor));
    if (handSource) {
      handSource.cardIds = handSource.cardIds.filter((id) => playableIds.has(id));
    }
  }

  // War: table pile is the source and target.
  if (state.config.presetId === 'war') {
    const pile = state.zones[tableZoneId(actor)];
    if (pile && pile.cardIds.length > 0 && isMyTurn) {
      intentTypes.add('card.flip');
      sources.push({
        zoneId: tableZoneId(actor),
        cardIds: [pile.cardIds[0]!],
        label: 'Your pile',
      });
      targets.push({
        zoneId: tableZoneId(actor),
        label: 'Battle well',
        intentType: 'card.flip',
      });
    }
  }

  // Go Fish: ask targets.
  if (state.config.presetId === 'go-fish' && isMyTurn) {
    intentTypes.add('player.target');
    const opponents = selectOpponents(state, actor);
    for (const opp of opponents) {
      const oppHand = state.zones[handZoneId(opp.id)];
      if (oppHand && oppHand.cardIds.length > 0) {
        targets.push({
          zoneId: handZoneId(opp.id),
          label: `Ask ${opp.name}`,
          intentType: 'player.target',
        });
      }
    }
  }

  // Turn pass target (freeplay-family).
  if (isMyTurn && ruleActions.some((spec) => spec.id === 'pass')) {
    intentTypes.add('turn.pass');
    targets.push({
      zoneId: 'turn',
      label: 'Pass turn',
      intentType: 'turn.pass',
    });
  }

  const label = isMyTurn
    ? targets.length > 0
      ? `Drag to ${targets[0].label.toLowerCase()}`
      : 'Your turn'
    : 'Waiting';

  return {
    sources: dedupeSources(sources),
    targets: dedupeTargets(targets),
    intentTypes: [...intentTypes],
    label,
  };
}

/**
 * Convert a rule action spec into a typed intent, if possible.
 * Returns null when the action does not map to a typed intent shape.
 */
export function intentFromActionSpec(
  spec: GameActionSpec,
  state: GameState,
  actor: PlayerId,
  id: string,
): GameIntent | null {
  if (spec.id === 'draw') {
    return {
      id,
      type: 'pile.draw',
      actorId: actor,
      pileId: ZONE_DRAW,
      to: handZoneId(actor),
    };
  }
  if (spec.id === 'pass') {
    return { id, type: 'turn.pass', actorId: actor };
  }
  if (spec.id.startsWith('play:')) {
    const cardId = spec.id.slice('play:'.length);
    return {
      id,
      type: 'card.move',
      actorId: actor,
      cardIds: [cardId],
      from: handZoneId(actor),
      to: ZONE_DISCARD,
    };
  }
  if (spec.id.startsWith('ask:')) {
    const payload = spec.id.slice('ask:'.length);
    const divider = payload.lastIndexOf(':');
    if (divider > 0 && divider < payload.length - 1) {
      return {
        id,
        type: 'player.target',
        actorId: actor,
        targetPlayerId: payload.slice(0, divider),
        verb: `ask:${payload.slice(divider + 1)}`,
      };
    }
  }
  return null;
}

/** Return null only when the typed intent matches the engine's legal set. */
export function intentLegalityError(
  state: GameState,
  intent: GameIntent,
  surfaceRole: SurfaceRole = 'player',
  profile: SurfaceProfile = state.meta.surfaceProfile ?? 'personal-table',
): string | null {
  if (!intent.id.trim()) return 'missing intent id';
  if (!state.players.some((player) => player.id === intent.actorId)) return 'unknown actor';

  const legal = legalIntents(state, intent.actorId, surfaceRole, profile);
  if (!legal.intentTypes.includes(intent.type)) return `illegal intent ${intent.type}`;
  const source = (zoneId: ZoneId) => legal.sources.find((candidate) => candidate.zoneId === zoneId);
  const target = (zoneId: ZoneId, type: GameIntent['type']) => legal.targets.some(
    (candidate) => candidate.zoneId === zoneId && candidate.intentType === type,
  );

  switch (intent.type) {
    case 'card.move': {
      if (intent.cardIds.length === 0 || new Set(intent.cardIds).size !== intent.cardIds.length) {
        return 'invalid card selection';
      }
      const legalSource = source(intent.from);
      if (!legalSource || !intent.cardIds.every((cardId) => legalSource.cardIds.includes(cardId))) {
        return 'illegal card source';
      }
      return target(intent.to, intent.type) ? null : 'illegal card target';
    }
    case 'pile.draw':
      if (!target(intent.pileId, intent.type)) return 'illegal draw source';
      if (!state.zones[intent.pileId]?.cardIds.length) return 'empty pile';
      return intent.to === handZoneId(intent.actorId) ? null : 'illegal draw target';
    case 'card.flip':
      return legal.sources.some((candidate) => candidate.cardIds.includes(intent.cardId))
        ? null
        : 'illegal flip source';
    case 'hand.reorder': {
      const hand = state.zones[handZoneId(intent.actorId)]?.cardIds ?? [];
      if (!hand.includes(intent.cardId)) return 'card is not in actor hand';
      return Number.isInteger(intent.toIndex) && intent.toIndex >= 0 && intent.toIndex < hand.length
        ? null
        : 'invalid hand index';
    }
    case 'pile.take':
      if (!source(intent.pileId)?.cardIds.length) return 'illegal pile source';
      return target(intent.to, 'card.move') ? null : 'illegal pile target';
    case 'player.target':
      return target(handZoneId(intent.targetPlayerId), intent.type) ? null : 'illegal player target';
    case 'turn.pass':
      return target('turn', intent.type) ? null : 'turn cannot pass';
    case 'choice.commit':
      return intent.choiceId.trim() && intent.value.trim() ? null : 'invalid choice';
  }
}

/** Translate a legal typed intent into primitive, unsequenced engine events. */
export function translateIntentToEvents(
  intent: GameIntent,
  state: GameState,
): GameEvent[] | null {
  if (intentLegalityError(state, intent)) return null;
  const rules = getGameRules(state.config.presetId);
  const ruleAction = ruleActionForIntent(intent, rules.actions(state, intent.actorId));
  if (ruleAction) {
    const primitives = rules.apply(ruleAction, state, intent.actorId);
    if (!primitives) return null;
    return primitives.map((primitive, index) => ({
      ...primitive,
      id: `draft:${intent.id}:${index}`,
      ts: 0,
      seq: 0,
      actorId: intent.actorId,
    } as GameEvent));
  }

  switch (intent.type) {
    case 'card.move':
      return intent.cardIds.map((cardId, index) => draftEvent(intent, index, {
        type: 'card/move',
        cardId,
        toZoneId: intent.to,
        toIndex: intent.toIndex === undefined ? undefined : intent.toIndex + index,
      }));
    case 'pile.draw': {
      const cardId = state.zones[intent.pileId]?.cardIds[0];
      return cardId
        ? [draftEvent(intent, 0, { type: 'card/deal', cardId, toZoneId: intent.to, face: 'up' })]
        : null;
    }
    case 'card.flip':
      return [draftEvent(intent, 0, { type: 'card/flip', cardId: intent.cardId })];
    case 'hand.reorder': {
      const hand = [...(state.zones[handZoneId(intent.actorId)]?.cardIds ?? [])];
      const fromIndex = hand.indexOf(intent.cardId);
      if (fromIndex < 0) return null;
      hand.splice(fromIndex, 1);
      hand.splice(intent.toIndex, 0, intent.cardId);
      return [draftEvent(intent, 0, {
        type: 'hand/reorder',
        playerId: intent.actorId,
        order: hand,
      })];
    }
    case 'pile.take':
      return [...(state.zones[intent.pileId]?.cardIds ?? [])].map((cardId, index) =>
        draftEvent(intent, index, { type: 'card/move', cardId, toZoneId: intent.to }));
    case 'turn.pass':
      return [draftEvent(intent, 0, { type: 'turn/end', playerId: intent.actorId })];
    case 'player.target':
    case 'choice.commit':
      return null;
  }
}

type DraftPayload =
  | { type: 'card/deal'; cardId: string; toZoneId: ZoneId; face: 'up' | 'down' }
  | { type: 'card/move'; cardId: string; toZoneId: ZoneId; toIndex?: number }
  | { type: 'card/flip'; cardId: string }
  | { type: 'hand/reorder'; playerId: PlayerId; order: string[] }
  | { type: 'turn/end'; playerId: PlayerId };

function draftEvent(intent: GameIntent, index: number, payload: DraftPayload): GameEvent {
  return {
    ...payload,
    id: `draft:${intent.id}:${index}`,
    ts: 0,
    seq: 0,
    actorId: intent.actorId,
  } as GameEvent;
}

function ruleActionForIntent(
  intent: GameIntent,
  actions: GameActionSpec[],
): GameAction | null {
  const ids = actions.map((action) => action.id);
  switch (intent.type) {
    case 'card.move': {
      const cardId = intent.cardIds[0];
      return ids.find((id) =>
        (id === `play:${cardId}` || id === `move:${cardId}` || id.includes(cardId ?? ''))
        && actions.find((action) => action.id === id)?.targetZones?.includes(intent.to)) ?? null;
    }
    case 'pile.draw':
      return ids.find((id) => id === 'draw' || id === 'twist') ?? null;
    case 'card.flip':
      return ids.find((id) => id === 'flip' || id === `flip:${intent.cardId}`) ?? null;
    case 'player.target': {
      const rank = intent.verb.startsWith('ask:') ? intent.verb.slice('ask:'.length) : intent.verb;
      return ids.find((id) => id === `ask:${intent.targetPlayerId}:${rank}`) ?? null;
    }
    case 'turn.pass':
      return ids.includes('pass') ? 'pass' : null;
    case 'choice.commit':
      return ids.find((id) => id === intent.value) ?? null;
    case 'hand.reorder':
      return ids.includes('reorder') ? 'reorder' : null;
    case 'pile.take':
      return null;
  }
}

function dedupeSources(sources: LegalIntentSource[]): LegalIntentSource[] {
  const byZone = new Map<ZoneId, LegalIntentSource>();
  for (const source of sources) {
    const existing = byZone.get(source.zoneId);
    if (!existing) {
      byZone.set(source.zoneId, { ...source, cardIds: [...source.cardIds] });
      continue;
    }
    existing.cardIds = [...new Set([...existing.cardIds, ...source.cardIds])];
  }
  return [...byZone.values()].filter((source) => source.cardIds.length > 0);
}

function dedupeTargets(targets: LegalIntentTarget[]): LegalIntentTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.zoneId}\u0000${target.intentType ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
