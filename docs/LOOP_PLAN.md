# Deckd LOOP living plan

Last updated: 2026-08-09 (run `t_2d6f4e02`)

## Standard

Deckd must read as one continuous physical card table: warm ivory paper stock, restrained crimson ink, warm ink typography, deterministic grain, hairline rules, and object-led controls. Setup is staging the same deck on the same surface; navigation is part of the table edge; motion explains physical actions without turning the app into a page carousel. The acceptance viewport is 375×812, with a desktop check as the second proof point.

## Current read of the repo

- The shared surface morph and table grain exist and should be preserved.
- Card backs are wired to the three canonical branded assets, but the shell/front treatment and hand/staging behavior still need a strict visual pass.
- HubLayer has the right shared canvas and deal flow, but still presents dense settings-form controls rather than recipe cards, chips, tokens, and one deck-led move.
- GlobalNavBar is a labelled ivory rail, but the live directive supersedes it with four physical edge chips and a separate deal-deck object.
- Existing engine/store behavior and pass ritual are working territory; visual work must not disturb the event-sourced flow.

## Slice order

1. Baseline the real Home → setup → Deal 2 each → table → pass flow at 375×812 and desktop. Record actual bounds, console errors, and screenshots before changing visual code.
2. Make cards physically legible first (P0): clean aspect-ratio shells, paper/grain faces, canonical backs, corner indices and French pips, restrained overlap depth, no clipped/jittering hands. Keep card changes isolated and gate them before stacking setup work.
3. Recast HubLayer as deck staging: fanned recipe backs with selected face preview, player chips, option tokens, and a visible bottom deck action. Preserve `handleStart`, session resume, lobby routing, and the shared morph.
4. Recast GlobalNavBar as the table edge: no rail container or per-item card shells; four tactile chips with 44px targets, accessible labels, active lift/rim, and a separate logo card-back deal deck. Preserve all route/view-mode behavior.
5. Re-run static checks, Jest, Expo Doctor, exact viewport browser QA, export and refresh the authorized preview, then record only verified facts in STATUS.md.

## Design decisions

- Material language: warm ivory paper + crimson print + warm ink; no gold, blue, green, gradients, or decorative particles in the active visual system.
- Structure: whitespace and 1px rules over card grids; physical objects (cards, chips, tokens, deck) carry hierarchy.
- Motion: keep existing Reanimated surface morph and physical card feedback; add only short spring/press/deal cues. Reduced motion collapses to fade/no spatial movement.
- Preview mode remains unlocked for testing: visual lock notes may remain, but no tap can be blocked by entitlement.
- No new dependencies, no native generated-folder edits, no route-wide page flip, no fake review/marketing content.

## Evidence required before `STANDARD MET`

- `npm run typecheck`, `npm run lint`, `npx jest --runInBand`, and `npx expo-doctor` all pass.
- Home, setup, table, and pass screenshots at 375×812 show no clipping, overlap, horizontal overflow, or hidden-layer interaction mistake; desktop remains composed.
- Visible controls have accessible names and 44px+ targets; nav and action surfaces stay above the reserved edge.
- Preview export is rebuilt and the deployed URL serves the current bundle with no browser console/page errors in the exercised flow.
