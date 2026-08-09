# Deckd LOOP directives (living source of truth)

Josh's current directives for the Deckd LOOP. Latest wins over anything in ROADMAP.md / MVP_SCOPE.md where they conflict. Update this file as directives change; every loop run reads this first.

Last updated: 2026-08-09

## Current directives

### 1. Cards must not be "knackered" (P0)
The card rendering is still too buggy visually. Cards must render cleanly at every size, no overlaps, no clipping, no layout jitter when the hand fans or stacks. Verify at 375px AND desktop. This is the top priority: fix card rendering before any other card work.

### 2. Deckd-branded card backs (assets ready — 3 options)
- Default: `assets/card-back-deckd.png` — ivory paper, crimson double border, exact red D+heart logo (composed from Logo.png, 750x1050).
- Extravagant A "Noir": `assets/card-back-noir.png` — warm ink background, crimson double border, corner diamonds, red logo.
- Extravagant B "Crimson": `assets/card-back-crimson.png` — deep crimson background, ivory double border, corner diamonds, ivory logo.
All free/selectable, 750x1050 (2.5:3.5). Wire all three into the back picker (visuals.ts built-ins + cosmetics store), default stays `back-brand` = deckd. Keep procedural backs as options too.

BRANDING RULE: the logo mark must ALWAYS come from `assets/logo.svg` (canonical potrace vector of Logo.png) or `assets/Logo.png` — never AI-reinterpret the logo from a text description. No gold, no square/lattice patterns on card backs. Palette: ivory, crimson, ink only.

### 3. Card fronts from a proven repo (assets ready)
Vendored in-repo at `vendor/card-fronts/`:
- `hayeah/` (MIT license) — 54 SVGs, classic Inkscape-style faces
- `notpeter/` (public domain / WTFPL) — 54 SVGs, Byron Knoll faces, cleaner paths

Implement the fronts with react-native-svg (already installed, 15.15.4). Convert/port the SVGs into RN-SVG components: correct French pip layouts, corner indices both corners, red/black suits, J/Q/K court treatment. Restyle to deckd palette (warm white paper, crimson #B02020, gold accents) so they match the ivory table world. Keep the repo licenses; note the source in a comment in the component. Do NOT add the raw SVGs as static assets; build components so they scale.

### 4. Game setup page full redesign
`components/layers/HubLayer.tsx` — the deal prep surface. Redesign so it feels like staging a deck on the table, not a settings form. Integrated with the table world (same surface family, no separate "page" look).

### 5. Game presets redesign
The preset picker (Freeplay, Deal 2 each, Blackjack-style, Poker-style) needs redesigning: readable at a glance, tactile, explain what each does in one line, styled like cards on the table. Same redesign wherever presets appear.

### 6. Nav bar integration
`components/GlobalNavBar.tsx`: currently good but sits on a separate container behind the card-style buttons. Remove that container so the menu cards sit directly on the surface; separate them with a subtle drop shadow instead. The nav must be accessible on ALL screens (home, setup, table, store, profile, lobby, pass).

### 7. Seamless setup → table transition (supersedes the earlier page-flip request)
Do not add a route-wide 3D page-flip transition for home → setup or setup → table. Josh's current direction is that setup is integrated into the same table space, not a separate page. Keep the existing layered surface morph and physical card motion for deal, draw, discard, flip, reorder, and pass interactions. The `FlipCard` component is for card faces only; any new transition must preserve the shared table canvas and respect reduced motion.

### 8. Use the logo wherever possible (DONE for icons, keep applying)
- iOS Add to Home Screen: `public/apple-touch-icon.png` + manifest + static web output (DONE, live).
- Rule: any brand mark in the UI uses `assets/logo.svg` (vector, canonical) or `assets/Logo.png` via `lib/assets.ts`. No re-drawn logos anywhere.
- The PlayingCard back face already uses `brand.logo` — keep it consistent everywhere else (store, hub, settings, profile, pass screen).

### 9. Table background texture
The playing surface should have a subtle warm texture (paper/felt-like grain, ivory) instead of a flat colour fill. Keep it subtle, no pattern tiles, no greens. Apply in `components/layers/TableLayer.tsx` (and HubLayer if it shares the surface family).

### 10. PREVIEW MODE: NO HARD LOCKS (Josh, 2026-08-09)
Nothing may block testing. All features are usable NOW (free, no purchase required): lobby hosting (Master gate REMOVED in LobbyLayer.handleCreate), all card backs and table themes preview-unlock on tap in the store, passes show as placeholders. Keep the LOCKED LOOK (lock icons, "Hosting needs a Master pass" note, prices shown) so the monetization UI is visible, but never block a tap. Do not reintroduce purchase gates. RevenueCat keys are empty; nothing can be bought anyway.

### 11. Nav bar REDESIGN (Josh, 2026-08-09 — NOT A FAN of the current state)
The current GlobalNavBar is rejected: five floating white card shells with drop shadows, fanned rotation, icon-only. That is boxed widgets on the table. Redesign it to be part of the game space:

- Kill the individual card shells. One continuous bottom rail that reads as the table edge: ivory surface, 1px ink/crimson rule divider on top, NO per-item shadows, no rotation, no container behind it.
- Items: small icon + text label (Home, Store, Presets, Profile). 44px+ touch targets. Active item = crimson ink + a 1px animated rule that draws in under the label. Inactive = muted ink.
- Center: the logo stays as the Deal button and remains the anchor, but on press it animates like dealing a card (spring lift, slight rotateY flip, then settle). No static decorations around it.
- Animations (reanimated 4.5, already installed, no new deps): spring press states on every item, active-rule draw-in, and a subtle deal-in stagger when the nav appears (cards slide up one by one). Respect reduce-motion (AccessibilityInfo.isReduceMotionEnabled) — then it's a plain fade.
- Must work at 375px on all screens (home, setup, table, store, profile, lobby, pass) and not overlap the table surface. NAV_BAR_RESERVE must still be respected by the game surfaces.
- Supersedes directive 6 (nav bar integration) which is DONE and now replaced by this.

## Standing rules (from AGENTS.md, unchanged)

- TypeScript strict, NO new dependencies, no raw hex outside src/lib/theme.ts.
- Components in components/, game logic in src/engine/, state in src/store/.
- Quality gates every slice: npm run typecheck, npm run lint, npx jest, npx expo-doctor.
- Deploy after each meaningful slice: npx expo export --platform web → rsync into app-serve/ → pm2 restart deckd-app → verify https://deckd-app.roxai.click.
- Commit each slice to cleanup/ready-to-build.
