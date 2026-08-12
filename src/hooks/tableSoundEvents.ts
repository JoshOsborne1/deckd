/**
 * Pure mapping from game events to table sounds.
 *
 * Framework-free (no React, no zustand, no expo-audio) so the mapping and
 * the subscription cursor logic can be unit-tested in isolation.
 *
 * Sound policy (subtle, physical, paper-like):
 * - `card/deal`   -> deal    (cards leaving the deck / landing)
 * - `card/flip`   -> flip    (card turned over)
 * - `card/reveal` -> flip    (hidden card shown — dealer reveal, showdown)
 * - `card/move`   -> discard (card lands on a pile — discard, solitaire moves)
 * - `turn/end`    -> pass    (the table passes to the next player)
 * - `session/end` -> win     (session / hand over)
 * - everything else (bets, streets, shuffles, reorders) stays silent —
 *   betting and bookkeeping must not be noisy.
 */

import type { GameEvent } from '@engine/events';

export type SoundName = 'deal' | 'flip' | 'discard' | 'pass' | 'win';

/** Batch priority: when several events land in one store update, play the
 *  most meaningful one (win > pass > deal > flip > discard). */
const PRIORITY: Record<SoundName, number> = {
  win: 5,
  pass: 4,
  deal: 3,
  flip: 2,
  discard: 1,
};

export function soundForEvent(event: GameEvent): SoundName | null {
  switch (event.type) {
    case 'card/deal':
      return 'deal';
    case 'card/flip':
    case 'card/reveal':
      return 'flip';
    case 'card/move':
      return 'discard';
    case 'turn/end':
      return 'pass';
    case 'session/end':
      return 'win';
    default:
      return null;
  }
}

/** Pick the single sound for a batch of new events (one sound per store
 *  update — a 52-card deal must not fire 52 overlapping swishes). */
export function pickSound(events: GameEvent[]): SoundName | null {
  let chosen: SoundName | null = null;
  for (const event of events) {
    const sound = soundForEvent(event);
    if (sound && (!chosen || PRIORITY[sound] > PRIORITY[chosen])) {
      chosen = sound;
    }
  }
  return chosen;
}

/** Cursor state for the store-subscription diff. */
export interface SoundCursor {
  lastEventId: string | null;
  lastSessionId: string | null;
}

export const EMPTY_CURSOR: SoundCursor = { lastEventId: null, lastSessionId: null };

/**
 * Given the store's full event log and the previous cursor, return the
 * sound for the newly-appended events plus the next cursor.
 *
 * - Normal append: events after `lastEventId` are new -> play them.
 * - Undo / rewind: the last event id is gone but the session is the same
 *   -> play nothing (never replay sounds for a rewind).
 * - New session (fresh deal, next hand): the session id changed and the
 *   old cursor no longer matches -> play the new deal from the start.
 */
export function nextSoundBatch(
  events: GameEvent[],
  cursor: SoundCursor,
): { sound: SoundName | null; next: SoundCursor } {
  const sessionStart = events.find((e) => e.type === 'session/start');
  const sessionId =
    sessionStart && sessionStart.type === 'session/start' ? sessionStart.meta.id : null;

  let start = 0;
  if (cursor.lastEventId) {
    const sessionChanged =
      sessionId !== null && cursor.lastSessionId !== null && sessionId !== cursor.lastSessionId;
    const idx = events.findIndex((e) => e.id === cursor.lastEventId);
    if (idx >= 0 && !sessionChanged) {
      start = idx + 1;
    } else if (sessionId !== null && sessionId === cursor.lastSessionId) {
      start = events.length; // rewind — no replay
    } else {
      start = 0; // brand-new session — play its deal
    }
  }

  return {
    sound: pickSound(events.slice(start)),
    next: {
      lastEventId: events[events.length - 1]?.id ?? null,
      lastSessionId: sessionId,
    },
  };
}
