# Deckd LOOP plan

Updated: 2026-08-11

## Current read

- The integration branch is clean at `60ff5a4`, with Hold'em betting, staged streets, guest-safe mirrors, replay/end motion, and live poker/lobby proof already shipped.
- The next authoritative audit item is the animation pass. The table already has opening-hand stagger, community-card entrance, discard pulse, press feedback, and reduced-motion handling, but a normal fan hand still inserts a drawn card without a physical arrival and a new discard replaces the card in place.
- The visual language stays one warm ivory/crimson/ink table: printed paper cards, hairline rules, restrained shadows, and no page-like transition for setup → play.

## Completed slice — physical draw/discard motion

- `HandFan` now gives every mounted card one deck-line arrival and settles it into the measured fan. Opening cards keep their stagger; later draws use a zero delay and do not replay the opening batch.
- A newly revealed discard now lands with a bounded translate/rotate/settle motion while retaining the existing pulse; reduced motion stays a plain fade/settle.
- Local Metro proof passed the real setup → deal → draw → pass flow at 375×812, and desktop proof passed at 1440×900. Typecheck, lint, 117 Jest tests, and Expo Doctor 20/20 are green.

## Next slice — preview ship, then continuity re-plan

1. Commit this narrow motion slice with `[verified]`, export/deploy the preview, and verify the live bundle and QA URL.
2. Re-run fresh public 375×812 and 1440×900 proof after deployment; do not trust the old bundle hash.
3. Re-plan against the audit's remaining continuity gap, choosing home-as-table/deck continuity or pass/win motion without duplicating the parallel solo, UX-pass, or multiplayer-E2E lanes.

## Re-plan after the slice

- If this slice is clean, inspect the audit's remaining continuity gap and choose the highest-impact non-parallel work: home-as-table/deck continuity or pass/win motion polish.
- Do not duplicate the parallel solo, UX-pass, or multiplayer-E2E lanes described in `LOOP_DIRECTIVES.md` §18.
- Monetisation, RevenueCat products/keys, Rive, and native-device-only claims remain parked.

## Acceptance bar for this run

- No new dependencies, no raw colours outside `src/lib/theme.ts`, and no engine-rule changes.
- New cards do not replay the opening deal on later draws; removed/re-added cards can enter again.
- Discard motion is bounded at 375px and becomes a plain fade/instant settle under reduced motion.
- `npm run typecheck`, `npm run lint`, `npx jest --runInBand`, and `npx expo-doctor` pass.
- Fresh visual proof has no browser/console errors and no document/body horizontal overflow at 375×812 or 1440×900.

Material language: warm ivory card stock with deterministic paper grain, crimson ink, warm black linework, one-pixel rules, and physical card movement rather than UI chrome.
