# LOOP PLAN — Sound pass (t_f8c85b8e)

## Goal
Take the Sound pass to the ready bar (G5: "sound with mute", audit §3.6
"wire expo-audio: deal, flip, discard, win. Mute toggle in settings. Default
on, subtle.").

## State on arrival (verified 2026-08-12)
A prior lane already shipped most of the sound pass and it is merged into
HEAD (61239e7):

- `assets/sounds/*.wav` — 5 real audible clips (deal 0.16s, flip 0.10s,
  discard 0.13s, pass 0.20s, win 0.70s; 22.05kHz, peaks 0.4-0.5).
- `src/hooks/useTableSound.ts` — expo-audio `createAudioPlayer`, lazy
  player cache, per-sound low volumes (0.25-0.3), mute ref from uiStore.
- `src/hooks/tableSoundEvents.ts` + tests — pure event→sound mapping with
  batch priority (win > pass > deal > flip > discard) and a subscription
  cursor (append diff, undo-safe, fresh-session aware). 10+ tests.
- `src/hooks/useTableSoundBridge.ts` — store subscription mounted at app
  root (`app/_layout.tsx`), one sound per store update.
- `src/store/uiStore.ts` — `soundEnabled` (default true, persisted) +
  `setSoundEnabled`.
- `app/settings.tsx` — Table sounds card with the mute toggle, reachable
  via Profile → Settings.
- `qa/deckd-sound-qa.cjs` — toggle UI proof (default ON, flips OFF,
  persists after reload, no 375px overflow), 375px + desktop.

Gates on arrival: typecheck ✅, lint ✅ (0 errors), jest 217/217 ✅,
expo-doctor 20/20 ✅. (node_modules junction had to be re-pointed to
deckd-wt-ux — main checkout install is partial.)

## Gap found (the actual work)
**Replay-after-finish is broken on native.** expo-audio's iOS player uses
AVPlayer with `actionAtItemEnd = .pause` (AudioPlayer.swift play(at:)); once
a clip finishes, `play()` alone is a silent no-op — you must seek to zero
first. Android ExoPlayer and web HTMLAudioElement restart automatically, so
the lane's web QA never saw it. Consequence on a phone: deal.wav plays once
at first deal, then EVERY later sound (flips, discards, passes, wins,
startNextHand re-deals) is dead for the whole app lifetime.

## Fix
1. `src/hooks/tableSoundPlayer.ts` — pure `playSoundEffect(player)` helper:
   if the player has finished (duration > 0 && currentTime >= duration),
   `await seekTo(0)` then `play()`. Minimal ReplayablePlayer interface so
   it unit-tests with fakes.
2. `src/hooks/tableSoundPlayer.test.ts` — fresh player, finished player,
   mid-play (no seek), duration-0 not-yet-loaded player.
3. `src/hooks/useTableSound.ts` — route `play()` through the helper.
4. `qa/deckd-sound-qa.cjs` — extend to PROVE playback, not just the
   toggle: deal a session, assert an expo-audio `<audio>` element actually
   advances/plays; mute OFF → deal → assert no playing audio. Keep the
   toggle checks.

## Gates per slice
npm run typecheck, npm run lint, npx jest, npx expo-doctor — all green.

## Deliver
Commit slice → run proof script → attach proof → request review
(reviewer=builder). No push.
