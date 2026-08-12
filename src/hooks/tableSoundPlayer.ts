/**
 * Playback helper for short table sound effects.
 *
 * expo-audio's NATIVE players do not restart an item that has already
 * finished: iOS wraps AVPlayer with `actionAtItemEnd = .pause`, so calling
 * `play()` on a finished player is a silent no-op — the item must be
 * seeked back to zero first. Android ExoPlayer and the web
 * HTMLAudioElement restart automatically, which is why web QA never
 * caught this: on a phone, `deal.wav` would play exactly once per app
 * lifetime and every later sound would be dead.
 *
 * This module is framework-free (no React, no expo-audio import) so the
 * replay decision can be unit-tested with fakes.
 */

/** The minimal expo-audio AudioPlayer surface this helper relies on. */
export interface ReplayablePlayer {
  /** Current playback position in seconds. */
  currentTime: number;
  /** Total duration in seconds (0 until the item is loaded). */
  duration: number;
  /** Whether the item is currently playing. */
  playing: boolean;
  /** Seek to an absolute position in seconds. */
  seekTo(seconds: number): Promise<void> | void;
  /** Start playback. */
  play(): void;
}

/** True when the item has played to its end and needs a rewind before replay. */
export function needsRewind(player: ReplayablePlayer): boolean {
  return player.duration > 0 && player.currentTime >= player.duration;
}

/**
 * Play a sound effect, rewinding first if the item already finished.
 *
 * A short clip (0.1-0.7s) that finished playing sits at
 * `currentTime === duration`; on native iOS calling play() there is a
 * no-op. Seek to zero and play. An item that is mid-play or not yet
 * loaded (duration 0) plays as-is — and a still-playing clip simply
 * restarts, which for 100ms card swishes is the right behaviour.
 */
export async function playSoundEffect(player: ReplayablePlayer): Promise<void> {
  if (needsRewind(player)) {
    await player.seekTo(0);
  }
  player.play();
}
