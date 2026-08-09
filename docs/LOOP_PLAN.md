# Deckd LOOP plan

Last updated: 2026-08-10 (run `t_2d6f4e02`)

## Standard

Deckd should read as one continuous physical card table: warm ivory paper stock, restrained crimson ink, warm ink typography, deterministic grain, hairline rules, and object-led controls. Setup is staging the same deck on the same surface; navigation is part of the table edge; motion explains physical actions without turning the app into a page carousel. The acceptance viewport is 375×812, with a desktop check as the second proof point.

## Outcome

**STANDARD MET for this visual LOOP slice.** Home, setup, play, and the pass ritual share one table-world language. Native device touch/safe-area proof, a real two-device lobby run, and product operations such as RevenueCat configuration remain outside this visual slice.

## Delivered slices

- **Cards (P0):** `PlayingCard` keeps every shell on the branded 2.5:3.5 ratio; paper fronts use deterministic grain, warm ink/crimson suit treatment, corner indices, French pip layouts, and court/ace artwork. Branded Deckd, Noir, and Crimson backs render above the paper fallback. `HandFan` bounds two-card and ten-card states with restrained overlap; only the opening hand receives the deal stagger, while later drawn cards settle immediately into the measured fan.
- **Setup ritual:** `HubLayer` stays inside the shared surface morph and stages recipe backs, selected recipe copy, player chips, option tokens, and the visible table-edge `Deal now` / lobby actions. It preserves pass-and-play, resume, lobby, and preset behavior.
- **Table edge:** `GlobalNavBar` now treats the bottom as a thin 6px table lip rather than a nav container. Home, Store, Presets, and Profile are labelled 44px-class outlined chips with active lift/rim/shadow and reduced-motion-safe stagger; Deal is a separate two-back deck object. The reserved height remains `NAV_BAR_RESERVE` so game surfaces do not collide with it.
- **Gameplay guidance:** the engine exposes valid draw/flip/discard/reorder/pass/shuffle/end actions plus one non-blocking next-useful-move suggestion. Alternate actions remain available.
- **Preview mode:** visual lock notes remain visible where useful, but taps are not hard-blocked during testing.

## Fresh verification

- `npm run typecheck` passed.
- `npm run lint` passed with 0 errors and 0 warnings.
- `npx jest --runInBand` passed: 7 suites, 71 tests.
- `npx expo-doctor` passed: 20/20 checks.
- Public smoke command `DECKD_QA_URL=https://deckd-app.roxai.click node qa/deckd-visual-qa.cjs` passed. It reached Home → setup → Deal 2 each → table → ten-card draw → `PASS TURN` and reported `hasHubHeading`, `hasTableSurface`, `hasTwoCardHand`, `hasTenCardDrawState`, `hasGuidance`, and `hasPassVeil` as true with `errors: []`.
- The fresh public geometry probe recorded no horizontal overflow at 375×812 or 1440×900. At 375px, visible nav/deal controls stayed inside x=8–367 and y=742–806; at 1440px they stayed inside x=539–901 and y=830–894. Both viewports reported empty console/page errors.

## Guardrails for the next loop

- One surface per slice; no route-wide page flip.
- Use `src/lib/theme.ts` tokens for colors; no raw color sprawl or new dependencies.
- Preserve pass-and-play behavior and the event-sourced engine.
- Keep PREVIEW MODE usable: monetization visuals may look locked but taps cannot hard-block testing.
- Do not claim native touch or real two-device lobby behavior without device evidence.

## Remaining work

1. Run the native build on a real phone for touch, safe-area, and reduced-motion feedback.
2. Complete the real two-device lobby flow against `relay.roxai.click`.
3. Keep RevenueCat product/key setup, entitlement operations, Rive, and broader game-library work parked behind the gameplay-first priority.
