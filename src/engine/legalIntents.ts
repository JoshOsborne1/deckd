/**
 * Engine legality provider (blueprint §7.3).
 *
 * `legalIntents(state, actor, surfaceRole)` returns source objects, legal
 * targets and concise labels. The engine remains the ONLY legality authority;
 * gesture code never contains game rules.
 */

import type { GameState, PlayerId, ZoneId } from './types';
import { handZoneId, tableZoneId, ZONE_DISCARD, ZONE_DRAW } from './types';
import { getGameRules, type GameActionSpec } from './rules';
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
  _surfaceRole: SurfaceRole,
  profile?: SurfaceProfile,
): LegalIntentsResult {
  if (state.phase !== 'playing') {
    return { sources: [], targets: [], label: 'Session not playing' };
  }

  const isMyTurn = selectIsMyTurn(state, actor);
  const hand = selectLocalHand(state, actor);
  const rules = getGameRules(state.config.presetId);
  const ruleActions = rules.actions(state, actor);

  const sources: LegalIntentSource[] = [];
  const targets: LegalIntentTarget[] = [];

  // Hand source: cards the viewer may manipulate.
  if (hand.length > 0) {
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
    if (drawCount > 0) {
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

  return { sources, targets, label };
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
