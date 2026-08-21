import { useEffect, useRef } from 'react';
import { useGameStore } from '@store/gameStore';
import { useTableSound } from './useTableSound';
import { EMPTY_CURSOR, nextSoundBatch, type SoundCursor } from './tableSoundEvents';

/**
 * Table sound bridge — the single wiring point between game events and
 * sound playback.
 *
 * Mounted once at the app root (`app/_layout.tsx`). Subscribes to the
 * gameStore's event log and plays the matching sound for every store
 * update that appends new events:
 *
 *   card/deal    -> deal     card/flip, card/reveal -> flip
 *   card/move    -> discard  turn/end               -> pass
 *   session/end  -> win
 *
 * The subscription approach means EVERY path that changes the game —
 * button taps, rule actions, remote guest events, replays — is covered
 * without sprinkling `playSound` calls through the layer components
 * (TableLayer stays owned by the main loop card tonight).
 *
 * No component renders here: subscribing at the root keeps the player
 * cache hot for the app's lifetime without hook-order constraints.
 */
/** Prime the cursor from the already-rehydrated log so a persisted
 *  session's old events never replay on app start. `nextSoundBatch`
 *  returns the cursor without playing when given an empty batch, so we
 *  reuse it: sound is discarded, `next` is the priming cursor. */
function primeCursor(): SoundCursor {
  const events = useGameStore.getState().events;
  return nextSoundBatch(events, EMPTY_CURSOR).next;
}

export function useTableSoundBridge(): void {
  const { play } = useTableSound();
  const cursorRef = useRef<SoundCursor>(primeCursor());

  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state) => {
      const { sound, next } = nextSoundBatch(state.events, cursorRef.current);
      cursorRef.current = next;
      if (sound) play(sound);
    });
    return unsubscribe;
  }, [play]);
}
