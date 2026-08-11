# Deckd LOOP plan

Updated: 2026-08-11

## Current read

- The integration branch is clean at `d29cfe5`, with Hold'em betting, staged streets, guest-safe mirrors, Klondike draw-one, rules/replay, physical draw/discard motion, and the home continuity slice deployed.
- Home now reads as the table's quiet top-down entry point. The next non-parallel, highest-impact continuity gap is the setup → table handoff: `HubLayer.handleStart` creates the session and swaps layers immediately, so the deal object does not get a physical launch moment.
- `LOOP_DIRECTIVES.md` §18 says not to duplicate the solo, UX-pass, or multiplayer-E2E lanes. This slice stays in `HubLayer.tsx` plus focused QA/docs updates; no engine-rule, monetisation, Rive, or native-device work is in scope.

## Completed before this run

- `HandFan` gives every mounted card one deck-line arrival and settles it into the measured fan; opening cards keep their stagger and later draws do not replay it.
- A new discard lands with bounded translate/rotate/settle motion while retaining pulse feedback; reduced motion uses a plain fade/settle.
- Hold'em has blinds, betting chips, pot accounting, street progression, showdown winner copy, and live public QA. Klondike is routed through the recipe executor and has a table-native layout.
- Home is now a warm table-native deal surface with a canonical deck object, first-run hint, resume slip, and shared-table entry; old store/Master marketing chrome is removed.
- Quality gates and live preview were green on the prior verified motion deploy. This run must re-run them against the Home change and publish a fresh bundle.

## Current slice — Setup → table deal handoff

1. Keep the existing session creation and online guest/host behavior, but route successful setup actions through a short, bounded deal-object launch animation before entering the table.
2. Use the existing Reanimated motion tokens and the shared reduced-motion preference; do not add a route-wide page flip or change engine state.
3. Reset the launch value when Hub becomes inactive so returning to setup always shows a fresh deal object.
4. Verify Home → setup → Deal now → table at 375×812 and 1440×900, including the real table milestone and no browser/page errors.
5. Commit with `[verified]`, export/deploy the preview, confirm the new hashed entry bundle is served, then update `STATUS.md` with the narrow result.

## Re-plan rule

- After this slice, inspect the remaining ready-bar gap. Do not start hold-to-peek while the parallel lanes described in §18 still have unmerged work, and do not duplicate their files.
- If the handoff is clean, choose the next highest-impact continuity or physical-table gap from the audit rather than polishing parked monetisation surfaces.

## Acceptance bar for this run

- No new dependencies, no raw colours outside `src/lib/theme.ts`, and no engine-rule changes.
- Home reads as one warm ivory/crimson/ink table, with the deck object carrying the deal action rather than a marketing hero.
- Home → setup remains a shared surface morph, and setup → table gets a physical deal-object launch without a route-wide page flip or page-pop.
- Primary and navigation controls are reachable at 375×812 and 1440×900, with no document/body horizontal overflow.
- `npm run typecheck`, `npm run lint`, `npx jest --runInBand`, and `npx expo-doctor` pass, followed by fresh public visual proof.

Material language: warm ivory paper stock, deterministic grain, crimson ink, warm black linework, one-pixel rules, restrained depth, and physical card objects instead of UI chrome.
