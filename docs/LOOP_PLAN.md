# Deckd LOOP plan

Last updated: 2026-08-09 · live audit pass complete

## Visual standard

Deckd is a warm ivory card table with crimson ink: quiet stock, 1px rule dividers, restrained shadows, and physical card geometry. Setup, play, and navigation are pieces of the same table; no page-like handoff or decorative effects that compete with the deck. The interaction model is assisted freedom: clear affordances and safe defaults, without hiding the ways a player can draw, play, flip, reorder, or pass.

## Current read

- Home now has a single-canvas foundation, a centered shrink-safe nav, and a logo-only center control with no static suit decoration.
- The persistent background, default cosmetics, and setup rail share the same warm ivory/crimson stock-and-rule language; no green playing-space treatment is active.
- Setup morphs from home through `SurfaceMorphContext` and reads as deck staging on the same table rather than a generic settings page.
- The table action rail is constrained to the phone width, retains 44px controls, and the pass ritual is clear at the end of a dealt flow.
- The exact 375px audit exposed blue/green/gold avatar swatches as the last chromatic mismatch; `AvatarPlaceholder` now stays on ivory, crimson, and ink tokens.

## Live audit re-plan

The previous LOOP slices are present in the working tree. This pass is evidence-led rather than a repeat of the checklist: first inspect the mounted web surface at 375px, then only change a surface if the real flow exposes a regression in navigation, material continuity, or table affordance. Expected files before the audit are `components/GlobalNavBar.tsx`, `components/layers/HomeLayer.tsx`, `components/layers/HubLayer.tsx`, `components/layers/TableLayer.tsx`, `src/lib/theme.ts`, and `src/engine/visuals.ts`; no file is pre-approved for editing if the live evidence does not require it.

## Build order (re-plan as evidence changes)

1. **Done — nav/logo slice.** Fix the home navigation bar at 375px: give every control a stable touch area, keep the logo visible and centered, remove floating suit particles, and preserve route/view-mode behavior.
2. **Done — table palette slice.** Make the persistent table canvas explicitly ivory/crimson: move remaining green defaults out of the active surface language and retheme the old Classic Felt id as an intentional Crimson Felt alternate.
3. **Done — setup material slice.** Make the option rail an unfilled paper/rule surface, remove decorative nav suits, and keep the morph handoff legible.
4. **Done — table action rail audit.** Keep the shuffle, pass, history, and end controls inside the 320–375px content width with 44px icon targets and a single-line pass CTA.
5. **Done — avatar material audit.** Remove non-table blue/green/gold swatches from the shared avatar primitive so home and table chrome stay inside the white/crimson/ink language.
6. **Done — release verification.** Exercise home -> setup -> Deal 2 each -> dealt table -> pass veil at 375px, run all quality gates, export/redeploy, and inspect the live preview.

## Verified slices

- Nav/logo: GlobalNavBar now uses a constrained, shrink-safe five-control row, a smaller visible center logo, a shorter paper rail, and no decorative suit corners around the logo. The fresh 375×812 public-preview run kept all five controls inside the viewport.
- Table palette: the active token fallbacks and the persisted `theme-classic-felt` cosmetic no longer use green; the default remains `theme-ivory`, while the alternate is now crimson felt with the same physical table geometry.
- Setup material: the Hub options rail now uses a warm ivory rule surface, the hand-layout controls stack cleanly on narrow phones, and the Host/Deal row remains reachable at 375px.
- Table actions: the mobile action rail now uses a constrained full-width row, 44px icon controls, and a shrink-safe pass CTA; the previous 375px screenshot showed shuffle and end-session controls clipped off both edges.
- Avatar material: the shared avatar palette now uses theme tokens from the ivory/crimson/ink table world; the 375px dealt-table screenshot no longer shows blue, green, or gold opponent chrome.
- Release loop: typecheck, lint, 62 Jest tests, Expo Doctor (20/20), export, PM2 restart, and the public-preview 375px flow all pass with no browser console/page errors.

## Acceptance checks

- Home nav is visible and centered at 375px; Home, Store, Presets, and Profile each retain a 44px+ target and route correctly.
- The center control contains only the Deckd logo; no static floating suit/particle layer remains.
- The active default surface contains no green playing-space treatment; the alternate table cosmetic is explicitly crimson rather than green.
- Setup is still a single-surface morph, not a route/page flip; the option rail now uses a warm rule surface, controls remain reachable, and the deal action starts the existing event-sourced session.
- The table action rail stays fully visible at 320px and 375px; no icon or pass CTA is horizontally clipped.
- Avatar accents stay within the active ivory/crimson/ink material language; semantic color is reserved for deliberate card or status meaning.
- The pass veil clearly identifies the next player and keeps the hand hidden until the deliberate hold-to-reveal gesture.
- Pass-and-play behavior and all existing tests remain green.
- `npm run typecheck`, `npm run lint`, `npx jest`, `npx expo-doctor`, and the exported web preview all complete successfully.

## Decisions

- Keep the existing Plus Jakarta Sans and Reanimated stack; no new dependencies.
- Keep Home/Hub/Table layered architecture and event-sourced game state; polish the surfaces in place.
- Use crimson as the only strong chromatic accent in the active table world. Gold remains reserved for explicit premium/card accents, not generic UI chrome.
- Keep the existing `theme-classic-felt` id for persistence, but present it as the intentional Crimson Felt alternate rather than a green table.
