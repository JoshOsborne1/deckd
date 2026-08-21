import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useUiStore } from '@store/uiStore';
import type { SoundName } from './tableSoundEvents';

import dealWav from '@assets/sounds/deal.wav';
import flipWav from '@assets/sounds/flip.wav';
import discardWav from '@assets/sounds/discard.wav';
import passWav from '@assets/sounds/pass.wav';
import winWav from '@assets/sounds/win.wav';

/**
 * Table sound effects (deal / flip / discard / pass / win).
 *
 * Uses expo-audio's imperative `createAudioPlayer` API so sounds can be
 * fired from event-driven callbacks without the hook-order constraints of
 * `useAudioPlayer`. Players are created lazily on first play (web autoplay
 * policies block construction-before-gesture) and cached for the app's
 * lifetime.
 *
 * Mute toggle: `uiStore.soundEnabled` (default true, persisted).
 *
 * Web guard: browsers block audio that plays before a user gesture. We
 * attempt the play inside a try/catch; if the AudioContext is suspended we
 * skip silently. Once the user has interacted with the page (first tap)
 * subsequent plays succeed. We never reject — sound is non-blocking polish.
 */

const SOUND_SOURCES: Record<SoundName, number | string> = {
  deal: dealWav,
  flip: flipWav,
  discard: discardWav,
  pass: passWav,
  win: winWav,
};

/** Per-sound playback volume (0..1). Kept low: subtle, physical, paper-like. */
const SOUND_VOLUME: Record<SoundName, number> = {
  deal: 0.3,
  flip: 0.3,
  discard: 0.28,
  pass: 0.25,
  win: 0.3,
};

// Lazy module-level cache: keeps players alive across hook re-mounts so the
// audio decoders aren't re-created on every component lifecycle. Created on
// first successful play (after a user gesture on web).
const playerCache = new Map<SoundName, AudioPlayer | null>();

function getPlayer(name: SoundName): AudioPlayer | null {
  const cached = playerCache.get(name);
  if (cached !== undefined) return cached;
  try {
    const player = createAudioPlayer(SOUND_SOURCES[name]);
    player.volume = SOUND_VOLUME[name];
    playerCache.set(name, player);
    return player;
  } catch {
    // expo-audio not available (test env, missing native module) — no-op.
    playerCache.set(name, null);
    return null;
  }
}

export interface TableSoundApi {
  /** Play a table sound effect. No-ops if muted, not available, or web+unlocked. */
  play: (name: SoundName) => void;
}

export function useTableSound(): TableSoundApi {
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const enabledRef = useRef(soundEnabled);

  // Keep the ref in sync with the store value without reading it during render.
  useEffect(() => {
    enabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const play = useCallback((name: SoundName) => {
    if (!enabledRef.current) return;
    const player = getPlayer(name);
    if (!player) return;
    try {
      player.play();
    } catch {
      // Autoplay blocked or player not ready — skip silently.
    }
  }, []);

  return { play };
}
