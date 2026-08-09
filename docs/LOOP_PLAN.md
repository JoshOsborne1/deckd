# Deckd LOOP plan

Last updated: 2026-08-09 · living directives re-plan: continuous nav rail

## Visual standard

Deckd is a warm ivory card table with crimson ink: quiet stock, 1px rule dividers, restrained shadows, and physical card geometry. Setup, play, and navigation are pieces of the same table; no page-like handoff or decorative effects that compete with the deck. The interaction model is assisted freedom: clear affordances and safe defaults, without hiding the ways a player can draw, play, flip, reorder, or pass.

## Current read

- Home now has a single-canvas foundation, a continuous table-edge nav rail with text labels, and a logo-only center Deal control with no static suit decoration.
- The persistent background, default cosmetics, and setup rail share the same warm ivory/crimson stock-and-rule language; no green playing-space treatment is active.
- Setup morphs from home through `SurfaceMorphContext` and reads as deck staging on the same table rather than a generic settings page.
- The table action rail is constrained to the phone width, retains 44px controls, and the pass ritual is clear at the end of a dealt flow.
- The exact 375px audit exposed blue/green/gold avatar swatches as the last chromatic mismatch; `AvatarPlaceholder` now stays on ivory, crimson, and ink tokens.
- A fresh 375×812 Playwright run through Home → setup → Deal 2 each → table → pass confirms geometry and browser errors are clean. The pass veil now keeps the same warm stock, table rail, well, and crimson rule language through the handoff instead of becoming a flat page.
- The same exact-width run then exposed two release-quality defects hidden by wide screenshots: the decorative table rail expanded the document to 445px on a 375px viewport, and the dev event counter made the dealt table read like a debug build. Both are now treated as hard visual defects, not acceptable development residue.
- Josh's living directives now supersede the earlier polish order: card rendering is P0, the committed Deckd back must be the default, the vendored front sources are the source of truth for scalable RN-SVG faces, setup must stage a deck rather than present a form, and the continuous nav/transition system must work across every surface.
- The latest nav directive rejects the prior five floating card shells. The rail now reads as the table edge: one ivory surface, one top rule, labelled controls, an unboxed center logo anchor, and no per-item shadow or rotation.

## Live audit re-plan

The previous LOOP slices are present in the working tree, including the canvas clip and debug-chrome removal. The exact-width audit now confirms the remaining card work is stable: two-card hands are upright with a deliberate paper gap, while larger hands use bounded overlap derived from the measured container and card aspect ratio. The setup and navigation remain a single mounted surface; no route-level page turn is needed for this brief.

## Build order (re-plan as evidence changes)

1. **Done — nav/logo slice.** Fix the home navigation bar at 375px: give every control a stable touch area, keep the logo visible and centered, remove floating suit particles, and preserve route/view-mode behavior.
2. **Done — table palette slice.** Make the persistent table canvas explicitly ivory/crimson: move remaining green defaults out of the active surface language and retheme the old Classic Felt id as an intentional Crimson Felt alternate.
3. **Done — setup material slice.** Make the option rail an unfilled paper/rule surface, remove decorative nav suits, and keep the morph handoff legible.
4. **Done — table action rail audit.** Keep the shuffle, pass, history, and end controls inside the 320–375px content width with 44px icon targets and a single-line pass CTA.
5. **Done — avatar material audit.** Remove non-table blue/green/gold swatches from the shared avatar primitive so home and table chrome stay inside the white/crimson/ink language.
6. **Done — release verification.** Exercise home -> setup -> Deal 2 each -> dealt table -> pass veil at 375px, run all quality gates, export/redeploy, and inspect the live preview.
7. **Done — pass material continuity.** Preserve the veil's deliberate hold-to-reveal ritual while adding a low-contrast table rail/well and paper-stock treatment so the pass handoff belongs to the same game space.
8. **Done — release hardening.** Clip the persistent canvas to the viewport and remove the dev event counter so exact-width QA measures a clean, player-facing table.
9. **Done — P0 card geometry.** The fan derives slot step from measured container width and card aspect ratio; two-card hands stay upright with a 12px paper gap, and larger hands remain bounded with controlled overlap.
10. **Done — P0 branded back.** `assets/card-back-deckd.png` is the default `back-brand` face at every card size; procedural backs remain selectable by explicit back id.
11. **Done — P0 proven fronts.** Public-domain notpeter/hayeah-derived faces now render through scalable RN-SVG components under `components/`, with Deckd palette tokens and both corner indices.
12. **Done — setup/presets.** HubLayer stages a deck on the shared table; every preset has a one-line outcome plus visible player-count/deal consequence.
13. **Done — continuous nav rail.** GlobalNavBar now uses one ivory table-edge rail with a 1px rule, labelled Home/Store/Presets/Profile controls, 44px+ targets, and no per-item shells, shadows, or rotation; the center logo remains the Deal anchor.
14. **Not pursued by directive — page flip.** Setup and table stay a single-surface morph with no route-level 3D page turn; physical card motion remains in deal, draw, discard, flip, and pass interactions.
15. **Done — release loop.** Exact 375px screenshot/interaction QA, typecheck, lint, Jest, Expo Doctor, static export, preview deploy, and live verification all pass.

## Verified slices

- Nav/logo: GlobalNavBar now uses a continuous ivory table-edge rail with a 1px top rule, labelled Home/Store/Presets/Profile controls, animated active rule, spring press states, and a deal-in center logo. The fresh 375×812 public-preview run kept all five controls inside the viewport with no per-item shells, shadows, or rotation.
- Table palette: the active token fallbacks and the persisted `theme-classic-felt` cosmetic no longer use green; the default remains `theme-ivory`, while the alternate is now crimson felt with the same physical table geometry.
- Setup material: the Hub options rail now uses a warm ivory rule surface, the hand-layout controls stack cleanly on narrow phones, and the Host/Deal row remains reachable at 375px.
- Table actions: the mobile action rail now uses a constrained full-width row, 44px icon controls, and a shrink-safe pass CTA; the previous 375px screenshot showed shuffle and end-session controls clipped off both edges.
- Avatar material: the shared avatar palette now uses theme tokens from the ivory/crimson/ink table world; the 375px dealt-table screenshot no longer shows blue, green, or gold opponent chrome.
- Pass material: the privacy veil now uses warm ivory stock, a low-contrast table rail/well, and crimson rules behind the recipient and hold-to-reveal action; visual review found the ritual calmer and more continuous without decorative noise.
- Release hardening: the surface root now clips the decorative rail at the canvas boundary, and the table no longer renders the `EVT/SEQ` development badge in the player surface.
- Directive re-plan: card work is now verified first; the two-card fan is upright and separated, and the ten-card fan is bounded. Setup/nav use the shared morph and no route-level page flip is shipped because Josh's brief explicitly rejects page-like handoffs.
- Release loop: typecheck, lint, 62 Jest tests, Expo Doctor (20/20), export, PM2 restart, and the public-preview 375px flow all pass with no browser console/page errors.
- Fresh 375px audit: Home, setup, dealt Deal 2 each, table, and pass controls stay inside the viewport with no browser errors; the live public preview returned HTTP 200 and completed the same interaction flow.
- Re-run audit: a fresh 375×812 Playwright context completed Home → setup → Deal 2 each → table → eight draws (40 left); document width stayed at 375px and console/page error arrays were empty. The two-card hand remained upright with a deliberate gap, and the ten-card fan stayed bounded inside the table rail.
- Nav redesign audit: the exported local build and deployed public preview both returned HTTP 200 at 375×812; Home, Store, Deal the deck, Presets, and Profile targets measured inside x=8–367/y=748–806, document width stayed 375px, and the interaction flow produced no browser console/page errors.

## Acceptance checks

- Home nav is visible and centered at 375px; Home, Store, Presets, and Profile each retain a 44px+ target and route correctly.
- The center control contains only the Deckd logo; no static floating suit/particle layer remains, and the surrounding rail has no individual card shell.
- The active default surface contains no green playing-space treatment; the alternate table cosmetic is explicitly crimson rather than green.
- Setup is still a single-surface morph, not a route/page flip; the option rail now uses a warm rule surface, controls remain reachable, and the deal action starts the existing event-sourced session.
- The table action rail stays fully visible at 320px and 375px; no icon or pass CTA is horizontally clipped.
- A two-card hand has a visible gap and stable upright bounds; 3–12 card hands derive their step from available width and never create document overflow at 375px or desktop.
- `back-brand` uses the committed Deckd-branded image at every card size; procedural backs remain available by explicit back id.
- Card fronts are scalable RN-SVG components sourced from `vendor/card-fronts/`, with red/black suit semantics, both corner indices, and court faces that stay inside the card frame.
- Setup and presets read as deck staging on the table, not a settings form, and the same preset language is used wherever preset choices appear.
- The nav is one continuous ivory table-edge rail with a 1px rule, no per-item shadows/rotation, accessible labels, and 44px+ targets on every surface.
- Home -> setup and setup -> table remain a single-surface morph with no route-level page flip; reduced motion keeps the existing calm deterministic transition.
- Avatar accents stay within the active ivory/crimson/ink material language; semantic color is reserved for deliberate card or status meaning.
- The pass veil clearly identifies the next player and keeps the hand hidden until the deliberate hold-to-reveal gesture.
- The pass veil retains the warm ivory/crimson table-world material rather than reading as a separate white page.
- Pass-and-play behavior and all existing tests remain green.
- `npm run typecheck`, `npm run lint`, `npx jest`, `npx expo-doctor`, and the exported web preview all complete successfully.

## Decisions

- Keep the existing Plus Jakarta Sans and Reanimated stack; no new dependencies.
- Keep Home/Hub/Table layered architecture and event-sourced game state; polish the surfaces in place.
- Use crimson as the only strong chromatic accent in the active table world. Gold remains reserved for explicit premium/card accents, not generic UI chrome.
- Keep the existing `theme-classic-felt` id for persistence, but present it as the intentional Crimson Felt alternate rather than a green table.
- Use `vendor/card-fronts/` as the in-repo source of truth; do not import external filesystem paths or add raw SVG files as runtime assets.
- Keep the existing Reanimated 4.5 motion stack for the shared morph and physical card interactions; do not add a route-level page-turn layer.
- Treat the bottom rail as table material rather than a floating widget row; use only the shared theme tokens and Reanimated motion for the active rule, press states, stagger, and center deal gesture.
