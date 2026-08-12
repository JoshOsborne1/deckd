import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { useMotion } from '@hooks/useMotion';
import type { GameEvent } from '@engine/events';
import { handZoneId, type PlayerId } from '@engine/types';

/**
 * Event-diff animation engine for the per-game animation passes.
 *
 * Subscribes to the game store's event log and classifies newly-appended
 * events into named batches so game components can choreograph entrances,
 * cascades, and pulses without re-encoding event semantics. One batch is
 * emitted per store update (a single event for local dispatches; several
 * for remote ingest or replay).
 *
 * Safety rules:
 * - The cursor starts at the last event id on mount, so a rehydrated
 *   session (web localStorage, app relaunch) never replays animations.
 * - An undo that shrinks the log (cursor id gone) resets silently.
 * - Session-end fires a success haptic only when the viewer won.
 *
 * The foundation lane (deckd-para-anim-fx) owns the shared CardFlight /
 * CardDrag APIs; this hook only emits choreography *triggers*. Per-game
 * components below consume them, so when CardFlight lands the flight
 * visuals can swap in without touching the diff engine.
 */

export type GameBatch =
  | { kind: 'deal-opening'; key: string }
  | { kind: 'deal-to-hand'; key: string; cardIds: string[]; zoneId: string }
  | { kind: 'dealer-play'; key: string; revealIds: string[]; dealIds: string[] }
  | { kind: 'move'; key: string; cardIds: string[]; toZoneId: string }
  | { kind: 'street'; key: string; street: number }
  | { kind: 'bet'; key: string; action: string; amount: number }
  | { kind: 'ask'; key: string; targetPlayerId: string; rank: string; found: boolean }
  | { kind: 'reveal'; key: string; cardIds: string[] }
  | { kind: 'session-end'; key: string; winnerId: string | null }
  | { kind: 'other'; key: string };

export interface GameAnimations {
  /** Latest classified batch of newly-appended events, or null before the first append. */
  batch: GameBatch | null;
  /** Monotonic event sequence number (0 before any event). */
  lastSeq: number;
  /** Session id of the latest batch (null before the first append). */
  sessionId: string | null;
}

function classifyEvent(
  event: GameEvent,
  presetId: string | null,
  players: { id: PlayerId }[],
): GameBatch['kind'] | null {
  switch (event.type) {
    case 'session/start':
      return 'deal-opening';
    case 'session/end':
      return 'session-end';
    case 'card/reveal':
      // Blackjack dealer auto-play reveals the hole card as its own
      // dispatch; tag it so the dealer hand can time the FlipCard.
      if (presetId === 'blackjack') {
        const house = players[players.length - 1];
        if (house) {
          return 'dealer-play';
        }
      }
      return 'reveal';
    case 'card/deal': {
      const zoneId = event.toZoneId;
      if (zoneId && zoneId.startsWith('hand:')) {
        // Blackjack dealer draws land in the house hand — same cascade.
        if (presetId === 'blackjack') {
          const house = players[players.length - 1];
          if (house && zoneId === handZoneId(house.id)) {
            return 'dealer-play';
          }
        }
        return 'deal-to-hand';
      }
      return 'other';
    }
    case 'card/move':
      return 'move';
    case 'card/ask':
      return 'ask';
    case 'game/street':
      return 'street';
    case 'game/bet':
      return 'bet';
    default:
      return null;
  }
}

export function useGameAnimations(viewerId?: PlayerId | null): GameAnimations {
  const { haptic } = useMotion();
  const events = useGameStore((s) => s.events);
  const presetId = useGameStore((s) => s.state.config.presetId);
  const players = useGameStore((s) => s.state.players);

  const [batch, setBatch] = useState<GameBatch | null>(null);
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

    const kind = classifyEvent(last, presetId, players);
    let classified: GameBatch;
    switch (kind) {
      case 'deal-opening':
        classified = { kind: 'deal-opening', key };
        break;
      case 'deal-to-hand':
        classified = {
          kind: 'deal-to-hand',
          key,
          cardIds: fresh
            .filter((event): event is Extract<GameEvent, { type: 'card/deal' }> => event.type === 'card/deal')
            .map((event) => event.cardId),
          zoneId: last.type === 'card/deal' ? last.toZoneId ?? '' : '',
        };
        break;
      case 'dealer-play':
        classified = {
          kind: 'dealer-play',
          key,
          revealIds: fresh
            .filter((event): event is Extract<GameEvent, { type: 'card/reveal' }> => event.type === 'card/reveal')
            .map((event) => event.cardId),
          dealIds: fresh
            .filter((event): event is Extract<GameEvent, { type: 'card/deal' }> => event.type === 'card/deal')
            .map((event) => event.cardId),
        };
        break;
      case 'move':
        classified = {
          kind: 'move',
          key,
          cardIds: fresh
            .filter((event): event is Extract<GameEvent, { type: 'card/move' }> => event.type === 'card/move')
            .map((event) => event.cardId),
          toZoneId: last.type === 'card/move' ? last.toZoneId : '',
        };
        break;
      case 'street':
        classified = {
          kind: 'street',
          key,
          street: last.type === 'game/street' ? last.street : 0,
        };
        break;
      case 'bet':
        classified = {
          kind: 'bet',
          key,
          action: last.type === 'game/bet' ? last.action : '',
          amount: last.type === 'game/bet' ? last.amount : 0,
        };
        break;
      case 'ask':
        classified = {
          kind: 'ask',
          key,
          targetPlayerId: last.type === 'card/ask' ? last.targetPlayerId : '',
          rank: last.type === 'card/ask' ? last.rank ?? '' : '',
          found: last.type === 'card/ask' ? Boolean(last.found) : false,
        };
        break;
      case 'reveal':
        classified = {
          kind: 'reveal',
          key,
          cardIds: fresh
            .filter((event): event is Extract<GameEvent, { type: 'card/reveal' }> => event.type === 'card/reveal')
            .map((event) => event.cardId),
        };
        break;
      case 'session-end': {
        const winnerId = last.type === 'session/end' ? (last.winnerId ?? null) : null;
        classified = { kind: 'session-end', key, winnerId };
        if (viewerId && winnerId === viewerId) {
          haptic('success');
        }
        break;
      }
      default:
        classified = { kind: 'other', key };
    }
    setBatch((prev) => {
      if (prev && prev.key === classified.key) return prev;
      return classified;
    });
  }, [events, haptic, players, presetId, viewerId]);

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
 * the flag is false. Drives one-shot effect components (shake, flash, pop)
 * that replay on key change.
 */
export function useToggleTrigger(flag: boolean): string | null {
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
