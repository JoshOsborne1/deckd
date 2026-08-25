/**
 * Typed physical-card intents (blueprint §7.3, Phase 1 subset).
 *
 * Gesture surfaces and accessibility action sheets BOTH dispatch the engine's
 * canonical GameIntent union. This compatibility name prevents card-surface
 * components from carrying a second, drifting copy of the contract.
 */

import type { GameIntent } from '@engine/intents';

export type PhysicalIntent = GameIntent;

export type PhysicalIntentType = PhysicalIntent['type'];

let intentCounter = 0;

/** Deterministic in-lab IDs; the runtime swaps this for a real id source. */
export function nextPhysicalIntentId(prefix = 'lab'): string {
  intentCounter += 1;
  return `${prefix}-intent-${intentCounter}`;
}

/**
 * Legality provider. Gestures never contain game rules; they ask this
 * interface which targets a source card may legally land in. The lab ships a
 * stub; the engine supplies a real one in Phase 2.
 */
export interface LegalTargetsQuery {
  /** Card being manipulated. */
  cardId: string;
  /** Zone it currently rests in. */
  fromZoneId: string;
}

export interface LegalTargets {
  /** Zone ids the card may legally drop into. */
  zoneIds: readonly string[];
}

export type LegalTargetsProvider = (query: LegalTargetsQuery) => LegalTargets;

/** A dispatcher consumes typed intents; the authority runtime commits them. */
export type PhysicalIntentDispatcher = (intent: PhysicalIntent) => void;
