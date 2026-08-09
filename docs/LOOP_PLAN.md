# Deckd LOOP plan

Last updated: 2026-08-09

## Visual standard

Deckd is a warm ivory card table with crimson ink: quiet stock, 1px rule dividers, restrained shadows, and physical card geometry. Setup, play, and navigation are pieces of the same table; no page-like handoff or decorative effects that compete with the deck. The interaction model is assisted freedom: clear affordances and safe defaults, without hiding the ways a player can draw, play, flip, reorder, or pass.

## Current read

- Home has a good single-canvas foundation, but the bottom nav is visually clipped and the center logo treatment does not read as a reliable, tappable home/deal control at 375px.
- The nav adds static floating suit marks around the logo; Josh asked for the Deckd logo alone.
- The persistent background is still authored as felt-first and leaves green theme tokens/options in the product, even though ivory is the default.
- Setup already morphs from home through `SurfaceMorphContext`, but its copy, cards, and controls still read like a separate settings page rather than a deck staged on the same table.
- The table surface is structurally present, yet action hierarchy and the table well need to stay visibly tied to the ivory/crimson material language.

## Build order (re-plan as evidence changes)

1. **Done — nav/logo slice.** Fix the home navigation bar at 375px: give every control a stable touch area, keep the logo visible and centered, remove floating suit particles, and preserve route/view-mode behavior.
2. **Done — table palette slice.** Make the persistent table canvas explicitly ivory/crimson: move remaining green defaults out of the active surface language and retheme the old Classic Felt id as an intentional Crimson Felt alternate.
3. Make setup feel staged on the table: replace page-like framing with a clear deck-prep rail, use one continuous well/ring, reduce card-grid/card-shell noise, and keep the morph handoff legible.
4. **Done — table action rail audit.** Keep the shuffle, pass, history, and end controls inside the 320–375px content width with 44px icon targets and a single-line pass CTA.
5. Verify through the real web flow at 375px (home -> setup -> table -> pass/back), then run typecheck, lint, Jest, Expo Doctor, export/redeploy, and inspect the live preview.

## Verified slices

- Nav/logo: GlobalNavBar now uses a constrained, shrink-safe five-control row, a smaller visible center logo, a shorter paper rail, and no floating suit/particle layer. `npm run typecheck`, `npm run lint`, `npx jest --runInBand` (62 tests), and `npx expo-doctor` pass. Browser QA confirms the center logo is visible and the side controls remain balanced on the running web build.
- Table palette: the active token fallbacks and the persisted `theme-classic-felt` cosmetic no longer use green; the default remains `theme-ivory`, while the alternate is now crimson felt with the same physical table geometry.
- Table actions: the mobile action rail now uses a constrained full-width row, 44px icon controls, and a shrink-safe pass CTA; the previous 375px screenshot showed shuffle and end-session controls clipped off both edges.

## Acceptance checks

- Home nav is visible and centered at 375px; Home, Store, Presets, and Profile each retain a 44px+ target and route correctly.
- The center control contains only the Deckd logo; no static floating suit/particle layer remains.
- The active default surface contains no green playing-space treatment; the alternate table cosmetic is explicitly crimson rather than green.
- Setup is still a single-surface morph, not a route/page flip; controls remain reachable and the deal action starts the existing event-sourced session.
- The table action rail stays fully visible at 320px and 375px; no icon or pass CTA is horizontally clipped.
- Pass-and-play behavior and all existing tests remain green.
- `npm run typecheck`, `npm run lint`, `npx jest`, `npx expo-doctor`, and the exported web preview all complete successfully.

## Decisions

- Keep the existing Plus Jakarta Sans and Reanimated stack; no new dependencies.
- Keep Home/Hub/Table layered architecture and event-sourced game state; polish the surfaces in place.
- Use crimson as the only strong chromatic accent in the active table world. Gold remains reserved for explicit premium/card accents, not generic UI chrome.
- Keep the existing `theme-classic-felt` id for persistence, but present it as the intentional Crimson Felt alternate rather than a green table.
