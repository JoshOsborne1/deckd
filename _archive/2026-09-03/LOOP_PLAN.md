# LOOP PLAN — Nav v3: chips on the table edge (t_049705ec)

> SUPERSEDED 2026-09-03: lane landed and merged long ago; kept as history. Live brief is docs/CLEANUP_2026-09-03.md.

## Goal
Take directive 13 (chips on the table edge) to the ready bar. The nav must
read as the table's physical edge with four flat cylinder chips and a deck
object (not a nav bar), work on ALL surfaces at 375px and desktop, respect
reduced motion, and never collide with game surfaces.

## State on arrival (verified 2026-08-12)
The feature itself was already shipped by the `deckd-para-nav3` lane and is
merged into HEAD (4fdc3b5 + docs feb898a are ancestors of HEAD):

- `components/GlobalNavBar.tsx` — no bar: 6px felt lip, four 46px chips
  (Home, Store, Presets, Profile) with 1px rims, engraved lucide marks,
  tiny labels; active chip raises 4px with crimson rim + soft shadow;
  press scale 0.96; 40ms deal-in stagger; reduced-motion = plain fade.
- Deal is the deck object: two-back stack (crimson + brand), center-bottom
  above the edge, spring deal animation on press.
- `NAV_BAR_RESERVE` (92) / `GLOBAL_NAV_HEIGHT` exports unchanged; surfaces
  keep their reserve.
- QA: `qa/deckd-nav3-qa.cjs` + `qa/deckd-nav3-reduced-qa.cjs` existed but
  only covered home/hub/store/list/profile.

## Gaps found (the actual work)
1. **Live table + pass veil never durably proven.** Directive 13 says the
   edge is part of the table and must work on all surfaces; the lane QA
   stopped at menu surfaces. Extended `qa/deckd-nav3-qa.cjs` with two new
   stages per viewport:
   - **table**: back Home → Deal 2 each → chips + deck object still on the
     edge, action rail (PASS TURN etc.) clears the nav zone (visibility-
     filtered: layered surfaces keep hidden hub layers in the DOM), no
     horizontal overflow.
   - **pass**: PASS TURN raises the privacy veil → nav stays visible and
     unobstructed on the edge, no overflow.
2. **Strict-mode traps in the layered surface architecture**: "Choose a
   recipe" resolves to 2 hidden copies after navigating profile→home;
   fixed with `.filter({ visible: true })`. railClear probe needed the same
   visibility filter (hidden hub layer buttons were false-positive
   collisions).

## Verification
- `qa/deckd-nav3-qa.cjs` green at 375×812 and 1440×900: all 7 surfaces
  (home, hub, store, list, profile, table, pass), 5 nav controls each,
  zero overflow, railClear = [], zero console/page errors.
- `qa/deckd-nav3-reduced-qa.cjs` green (media: reduce, navCount 5, no
  errors).
- Visual pass (vision on real screenshots): chips on a thin lip, no
  container, active raise + crimson rim, deck object overlaps lip like a
  physical object, no clipping, pass veil ends above the nav.
- Gates: typecheck ✅, lint ✅ (0 errors), jest 225/225 ✅, expo-doctor
  20/20 ✅.

## Decisions
- No app code changed: the lane's implementation already meets directive
  13; the only gap was proof coverage, so the slice is QA-only.
- Table/lobby/pass are layered surfaces inside `app/index.tsx`; the nav is
  globally mounted in `_layout.tsx`, so lobby/pass were implicitly covered
  by the table stage (verified via probe before extending QA).

## Deliver
Commit slice → run proof script → attach proof → request review
(reviewer=builder). No push.
