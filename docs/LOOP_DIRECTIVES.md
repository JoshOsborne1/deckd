# Deckd LOOP directives (living source of truth)

Josh's current directives for the Deckd LOOP. Latest wins over anything in ROADMAP.md / MVP_SCOPE.md where they conflict. Update this file as directives change; every loop run reads this first.

Last updated: 2026-08-09

## Current directives

### 1. Cards must not be "knackered" (P0)
The card rendering is still too buggy visually. Cards must render cleanly at every size, no overlaps, no clipping, no layout jitter when the hand fans or stacks. Verify at 375px AND desktop. This is the top priority: fix card rendering before any other card work.

### 2. Deckd-branded card back (DONE — asset ready)
Use `assets/card-back-deckd.png` (generated: ivory paper, gold double border, corner lattice, red D logo + heart). Make it the default card back (back-brand). It must render correctly as a React Native Image inside PlayingCard's back face, crisp at small sizes, correct aspect ratio (~2.5:3.5). Keep the existing procedural backs as selectable options.

### 3. Card fronts from a proven repo (assets ready)
Cloned at `C:\Users\Wrekin\Documents\workspace\card-assets\`:
- `hayeah/` (MIT license) — 54 SVGs, classic Inkscape-style faces
- `notpeter/` (public domain / WTFPL) — 54 SVGs, Byron Knoll faces, cleaner paths

Implement the fronts with react-native-svg (already installed, 15.15.4). Convert/port the SVGs into RN-SVG components: correct French pip layouts, corner indices both corners, red/black suits, J/Q/K court treatment. Restyle to deckd palette (warm white paper, crimson #B02020, gold accents) so they match the ivory table world. Keep the repo licenses; note the source in a comment in the component. Do NOT add the raw SVGs as static assets; build components so they scale.

### 4. Game setup page full redesign
`components/layers/HubLayer.tsx` — the deal prep surface. Redesign so it feels like staging a deck on the table, not a settings form. Integrated with the table world (same surface family, no separate "page" look).

### 5. Game presets redesign
The preset picker (Freeplay, Deal 2 each, Blackjack-style, Poker-style) needs redesigning: readable at a glance, tactile, explain what each does in one line, styled like cards on the table. Same redesign wherever presets appear.

### 6. Nav bar integration
`components/GlobalNavBar.tsx`: currently good but sits on a separate container behind the card-style buttons. Remove that container so the menu cards sit directly on the surface; separate them with a subtle drop shadow instead. The nav must be accessible on ALL screens (home, setup, table, store, profile, lobby, pass).

### 7. Card flip page transitions
Build a 3D card-flip transition for surface changes (setup → table, home → setup): the screen change animates like flipping/dealing a card. Use react-native-reanimated 4.5 (ALREADY INSTALLED — this IS the best 3D flip engine; do NOT add a new dependency). rotateY + perspective + backfaceVisibility with a shared transition component in `src/lib/motion.ts` or `components/`. Respect reduce-motion (AccessibilityInfo.isReduceMotionEnabled). Must work on web and native.

## Standing rules (from AGENTS.md, unchanged)

- TypeScript strict, NO new dependencies, no raw hex outside src/lib/theme.ts.
- Components in components/, game logic in src/engine/, state in src/store/.
- Quality gates every slice: npm run typecheck, npm run lint, npx jest, npx expo-doctor.
- Deploy after each meaningful slice: npx expo export --platform web → rsync into app-serve/ → pm2 restart deckd-app → verify https://deckd-app.roxai.click.
- Commit each slice to cleanup/ready-to-build.
