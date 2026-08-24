/**
 * Typed game intents (blueprint §7.3).
 *
 * These replace string actions such as `play:H-8` as the UI contract. Every
 * intent carries an idempotency id so the runtime can reject duplicates safely.
 * Gesture surfaces and accessibility action sheets BOTH dispatch these same
 * shapes.
 */

export type GameIntent =
  | { id: string; type: 'card.move'; actorId: string; cardIds: string[]; from: string; to: string; toIndex?: number }
  | { id: string; type: 'pile.draw'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'card.flip'; actorId: string; cardId: string }
  | { id: string; type: 'hand.reorder'; actorId: string; cardId: string; toIndex: number }
  | { id: string; type: 'pile.take'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'player.target'; actorId: string; sourceCardId?: string; targetPlayerId: string; verb: string }
  | { id: string; type: 'turn.pass'; actorId: string }
  | { id: string; type: 'choice.commit'; actorId: string; choiceId: string; value: string };

export type GameIntentType = GameIntent['type'];

/** Extract the actor id from any intent. */
export function intentActorId(intent: GameIntent): string {
  return intent.actorId;
}

/** Extract the idempotency id from any intent. */
export function intentId(intent: GameIntent): string {
  return intent.id;
}

/**
 * Deterministic intent id generator for tests and in-process runtime.
 * Production runtime swaps this for a real id source.
 */
let counter = 0;
export function nextIntentId(prefix = 'intent'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Reset the counter (test helper). */
export function resetIntentCounter(): void {
  counter = 0;
}
