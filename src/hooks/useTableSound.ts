import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useProfileStore } from '@store/profileStore';

/**
 * Table sound effects (deal / flip / discard / win).
 *
 * Uses expo-audio's imperative `createAudioPlayer` API so sounds can be fired
 * from event-driven callbacks without the hook-order constraints of
 * `useAudioPlayer`. The players are created lazily on first play (web autoplay
 * policies block construction-before-gesture) and cached for the component's
 * lifetime.
 *
 * Mute toggle: `profileStore.soundEnabled` (default true, persisted).
 *
 * Web guard: browsers block audio that plays before a user gesture. We attempt
 * the play inside a try/catch; if the AudioContext is suspended we skip
 * silently. Once the user has interacted with the page (first tap) subsequent
 * plays succeed. We never reject — sound is non-blocking polish.
 */

type SoundName = 'deal' | 'flip' | 'discard' | 'win';

// Lazy module-level cache: keeps players alive across hook re-mounts so the
// audio decoders aren't re-created on every component lifecycle. Created on
// first successful play (after a user gesture on web).
interface PlayerCache {
  [key: string]: { play: () => void; release?: () => void } | null;
}

let playerCache: PlayerCache = {};
let cacheInitialized = false;

function getSource(name: SoundName) {
  switch (name) {
    case 'deal':
      return require('@assets/sounds/deal.wav');
    case 'flip':
      return require('@assets/sounds/flip.wav');
    case 'discard':
      return require('@assets/sounds/discard.wav');
    case 'win':
      return require('@assets/sounds/win.wav');
  }
}

function ensurePlayers(): void {
  if (cacheInitialized) return;
  cacheInitialized = true;
  try {
    // expo-audio's createAudioPlayer is only available on native. On web we
    // fall back to a no-op (see below). We import dynamically so jest (node
    // env, no expo-audio native module) doesn't choke at import time.
    const PlatformRN = require('react-native').Platform;
    if (PlatformRN.OS === 'web') return;
    const { createAudioPlayer } = require('expo-audio');
    for (const name of ['deal', 'flip', 'discard', 'win'] as SoundName[]) {
      try {
        playerCache[name] = createAudioPlayer(getSource(name));
      } catch {
        playerCache[name] = null;
      }
    }
  } catch {
    // expo-audio not available (test env, missing native module) — sounds no-op.
  }
}

export interface TableSoundApi {
  /** Play a table sound effect. No-ops if muted, not available, or web+unlocked. */
  play: (name: SoundName) => void;
}

export function useTableSound(): TableSoundApi {
  const soundEnabled = useProfileStore((s) => s.soundEnabled);
  const enabledRef = useRef(soundEnabled);

  // Keep the ref in sync with the store value without reading it during render.
  useEffect(() => {
    enabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Lazy-init on mount. On web this is a no-op; on native it prepares the
  // players. The actual first play still happens after a user gesture.
  useEffect(() => {
    ensurePlayers();
  }, []);

  const play = useCallback((name: SoundName) => {
    if (!enabledRef.current) return;
    if (Platform.OS === 'web') {
      // Web: use a lightweight HTMLAudioElement per sound. Browsers block
      // autoplay before a user gesture; we try/catch and skip silently.
      try {
        const mod = getSource(name);
        // On web, require() resolves to a string URL; on native it's a number.
        const src = typeof mod === 'number' ? '' : mod;
        if (!src) return;
        const audio = new Audio(src);
        audio.volume = 0.35;
        void audio.play().catch(() => {
          /* autoplay blocked or not allowed — skip */
        });
      } catch {
        /* no audio support — skip */
      }
      return;
    }
    try {
      const player = playerCache[name];
      if (player) {
        player.play();
      }
    } catch {
      /* player not ready — skip */
    }
  }, []);

  return { play };
}