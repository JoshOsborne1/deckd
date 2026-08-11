# Deckd LOOP plan

Updated: 2026-08-11

## Current read

- The integration branch is clean at `53fdf83`, with Hold'em betting, staged streets, guest-safe mirrors, Klondike draw-one, rules/replay, and the physical draw/discard motion slice deployed.
- The live audit still calls out Home as the weakest continuity surface: it reads as a marketing page with a hero banner, store carousel, and Master promo instead of the table's first deal. The next non-parallel, highest-impact slice is to make Home the quiet top-down table entry point.
- `LOOP_DIRECTIVES.md` §18 says not to duplicate the solo, UX-pass, or multiplayer-E2E lanes. The home continuity slice stays in `HomeLayer.tsx` plus its focused QA/docs updates; no engine-rule, monetisation, Rive, or native-device work is in scope.

## Completed before this run

- `HandFan` gives every mounted card one deck-line arrival and settles it into the measured fan; opening cards keep their stagger and later draws do not replay it.
- A new discard lands with bounded translate/rotate/settle motion while retaining pulse feedback; reduced motion uses a plain fade/settle.
- Hold'em has blinds, betting chips, pot accounting, street progression, showdown winner copy, and live public QA. Klondike is routed through the recipe executor and has a table-native layout.
- Quality gates and live preview were green on the prior verified motion deploy. This run must re-run them against the Home change and publish a fresh bundle.

## Current slice — Home as the table

1. Replace the marketing stack in `HomeLayer` with a compact table-native landing composition: a table marker, a physical deck object as the only primary action, a minimal first-run hint, and a quiet resume/recipe note when useful.
2. Remove the fake-feeling Home-only store preview and Master promo from the deal surface; those destinations remain available through the persistent table-edge chips and their own routes.
3. Keep the shared home↔hub morph timeline, safe-area reserve, canonical card backs, reduced-motion behavior, and exact accessible names (`Deal the deck`, `Tap the deck to deal...`).
4. Verify the actual tap path Home → setup → Deal now → table, including 375×812 bounds, 1440×900 geometry, no horizontal document overflow, and no browser/page errors.
5. Commit with `[verified]`, export/deploy the preview, confirm the new hashed entry bundle is served, then update `STATUS.md` with the narrow result.

## Re-plan rule

- After this slice, inspect the remaining ready-bar gap. Do not start hold-to-peek while the parallel lanes described in §18 still have unmerged work, and do not duplicate their files.
- If Home is clean, choose the next highest-impact continuity or physical-table gap from the audit rather than polishing parked monetisation surfaces.

## Acceptance bar for this run

- No new dependencies, no raw colours outside `src/lib/theme.ts`, and no engine-rule changes.
- Home reads as one warm ivory/crimson/ink table, with the deck object carrying the deal action rather than a marketing hero.
- Home → setup remains a shared surface morph; no route-wide page flip or page-pop is introduced.
- Primary and navigation controls are reachable at 375×812 and 1440×900, with no document/body horizontal overflow.
- `npm run typecheck`, `npm run lint`, `npx jest --runInBand`, and `npx expo-doctor` pass, followed by fresh public visual proof.

Material language: warm ivory paper stock, deterministic grain, crimson ink, warm black linework, one-pixel rules, restrained depth, and physical card objects instead of UI chrome.
