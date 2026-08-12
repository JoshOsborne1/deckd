import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { useMotion } from '@hooks/useMotion';
import type { GameEvent } from '@engine/events';
import { handZoneId, type PlayerId } from '@engine/types';

/**
 * Lane-B event-diff animation engine (spec section 2, games B half).
 *
 * Distinct name from the parallel lane's useGameAnimations.ts so both
 * branches merge into main without add/add conflicts. Subscribes to the
 * game store's event log and classifies newly-appended events into named
 * batches so per-game components can choreograph entrances, cascades, and
 * pulses without re-encoding event semantics.
 *
 * Safety rules:
 * - The cursor starts at the last event id on mount, so a rehydrated
 *   session (web localStorage, app relaunch) never replays animations.
 * - An undo that shrinks the log (cursor id gone) resets silently.
 * - Session-end fires a success haptic only when the viewer won.
 */

export type GameBatchB =
  | { kind: 'deal-opening'; key: string }
  | { kind: 'deal-to-hand'; key: string; cardIds: string[]; zoneId: string }
  | { kind: 'move'; key: string; cardIds: string[]; toZoneId: string }
  | { kind: 'flip'; key: string; cardIds: string[] }
  | { kind: 'reveal'; key: string; cardIds: string[] }
  | { kind: 'reorder'; key: string; playerId: string }
  | { kind: 'pass'; key: string; playerId: string }
  | { kind: 'street'; key: string; street: number }
  | { kind: 'ask'; key: string; targetPlayerId: string; rank: string; found: boolean }
  | { kind: 'session-end'; key: string; winnerId: string | null }
  | { kind: 'other'; key: string };

export interface GameAnimationsB {
  /** Latest classified batch of newly-appended events, or null before the first append. */
  batch: GameBatchB | null;
  /** Monotonic event sequence number (0 before any event). */
  lastSeq: number;
  /** Session id of the latest batch (null before the first append). */
  sessionId: string | null;
}

export function useGameFxB(viewerId?: PlayerId | null): GameAnimationsB {
  const { haptic } = useMotion();
  const events = useGameStore((s) => s.events);

  const [batch, setBatch] = useState<GameBatchB | null>(null);
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    if (events.length === 0) {
      cursor.current = null;
      return;
    }
    const lastId = events[events.length - 1]!.id;
    // First observation (mount / rehydrate): adopt the cursor silently.
    if (cursor.current === null) {
      cursor.current = lastId;
      return;
    }
    const cursorIndex = events.findIndex((event) => event.id === cursor.current);
    // Undo shrank the log or the session was replaced — never replay.
    if (cursorIndex < 0 || cursorIndex === events.length - 1) {
      cursor.current = lastId;
      return;
    }
    const fresh = events.slice(cursorIndex + 1);
    cursor.current = lastId;

    const last = fresh[fresh.length - 1]!;
    const key = last.id;

    // Classify by the batch's dominant semantic, not just the last event:
    // a sevens play emits card/move + turn/end, a pass emits turn/end alone,
    // and a win play emits card/move + session/end.
    const hasMove = fresh.some((event) => event.type === 'card/move');
    const hasDealToHand = fresh.some(
      (event) => event.type === 'card/deal' && (event.toZoneId ?? '').startsWith('hand:'),
    );
    const hasFlip = fresh.some((event) => event.type === 'card/flip');
    const hasReveal = fresh.some((event) => event.type === 'card/reveal');
    const hasReorder = fresh.some((event) => event.type === 'hand/reorder');
    const hasAsk = fresh.some((event) => event.type === 'card/ask');
    const hasStreet = fresh.some((event) => event.type === 'game/street');
    const hasSessionEnd = fresh.some((event) => event.type === 'session/end');
    const hasTurnEnd = fresh.some((event) => event.type === 'turn/end');

    let classified: GameBatchB;
    if (hasSessionEnd) {
      const winnerId = last.type === 'session/end' ? (last.winnerId ?? null) : null;
      classified = { kind: 'session-end', key, winnerId };
      if (viewerId && winnerId === viewerId) {
        haptic('success');
      }
    } else if (hasMove) {
      classified = {
        kind: 'move',
        key,
        cardIds: fresh
          .filter((event): event is Extract<GameEvent, { type: 'card/move' }> => event.type === 'card/move')
          .map((event) => event.cardId),
        toZoneId: last.type === 'card/move' ? last.toZoneId : '',
      };
    } else if (hasDealToHand) {
      classified = {
        kind: 'deal-to-hand',
        key,
        cardIds: fresh
          .filter((event): event is Extract<GameEvent, { type: 'card/deal' }> => event.type === 'card/deal')
          .map((event) => event.cardId),
        zoneId: last.type === 'card/deal' ? last.toZoneId ?? '' : '',
      };
    } else if (hasFlip) {
      classified = {
        kind: 'flip',
        key,
        cardIds: fresh
          .filter((event): event is Extract<GameEvent, { type: 'card/flip' }> => event.type === 'card/flip')
          .map((event) => event.cardId),
      };
    } else if (hasReveal) {
      classified = {
        kind: 'reveal',
        key,
        cardIds: fresh
          .filter((event): event is Extract<GameEvent, { type: 'card/reveal' }> => event.type === 'card/reveal')
          .map((event) => event.cardId),
      };
    } else if (hasReorder) {
      classified = {
        kind: 'reorder',
        key,
        playerId: last.type === 'hand/reorder' ? last.playerId : '',
      };
    } else if (hasAsk) {
      classified = {
        kind: 'ask',
        key,
        targetPlayerId: last.type === 'card/ask' ? last.targetPlayerId : '',
        rank: last.type === 'card/ask' ? last.rank ?? '' : '',
        found: last.type === 'card/ask' ? Boolean(last.found) : false,
      };
    } else if (hasStreet) {
      classified = {
        kind: 'street',
        key,
        street: last.type === 'game/street' ? last.street : 0,
      };
    } else if (hasTurnEnd) {
      classified = {
        kind: 'pass',
        key,
        playerId: last.type === 'turn/end' ? last.playerId : '',
      };
    } else {
      classified = { kind: 'other', key };
    }
    setBatch((prev) => {
      if (prev && prev.key === classified.key) return prev;
      return classified;
    });
  }, [events, haptic, viewerId]);

  const sessionId = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (event.type === 'session/start') return event.meta.id;
    }
    return null;
  }, [events]);

  return {
    batch,
    lastSeq: events.length > 0 ? events[events.length - 1]!.seq : 0,
    sessionId,
  };
}

/**
 * Returns a fresh key each time `flag` flips false -> true, and null while
 * the flag is false. Drives one-shot effect components (ring, pop, wiggle)
 * that replay on key change.
 */
export function useToggleTriggerB(flag: boolean): string | null {
  const [key, setKey] = useState<string | null>(null);
  const prev = useRef(false);
  const counter = useRef(0);

  useEffect(() => {
    if (flag && !prev.current) {
      counter.current += 1;
      setKey(`t-${counter.current}`);
    }
    prev.current = flag;
    if (!flag) setKey(null);
  }, [flag]);

  return key;
}

/** Convenience: the viewer's hand zone id ('' when no viewer). */
export function viewerHandZoneId(viewerId: PlayerId | null | undefined): string {
  return viewerId ? handZoneId(viewerId) : '';
}
