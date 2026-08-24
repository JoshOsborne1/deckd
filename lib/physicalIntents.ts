/**
 * Typed physical-card intents (blueprint §7.3, Phase 1 subset).
 *
 * These are the UI contract: gesture surfaces and accessibility action sheets
 * BOTH dispatch these same shapes. Phase 1 keeps them as plain typed objects;
 * Phase 2 wires them into the session runtime and engine legality provider.
 */

export type PhysicalIntent =
  | { id: string; type: 'card.move'; actorId: string; cardIds: string[]; from: string; to: string; toIndex?: number }
  | { id: string; type: 'pile.draw'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'card.flip'; actorId: string; cardId: string }
  | { id: string; type: 'hand.reorder'; actorId: string; cardId: string; toIndex: number }
  | { id: string; type: 'pile.take'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'player.target'; actorId: string; sourceCardId?: string; targetPlayerId: string; verb: string }
  | { id: string; type: 'turn.pass'; actorId: string };

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

/** A dispatcher consumes typed intents. The lab logs them; the runtime will commit them. */
export type PhysicalIntentDispatcher = (intent: PhysicalIntent) => void;
