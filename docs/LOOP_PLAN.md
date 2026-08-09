# Deckd LOOP plan

Last updated: 2026-08-09 · current run: directive audit + highest-impact slice definition

## Visual standard

Deckd is a warm ivory card table with crimson ink: quiet stock, 1px rule dividers,
restrained shadows, and physical card geometry. Setup, play, and navigation are
pieces of the same table; no page-like handoff or decorative effects that compete
with the deck. The interaction model is assisted freedom: clear affordances and
safe defaults, without hiding the ways a player can draw, play, flip, reorder,
or pass.

## Current read (audit against docs/LOOP_DIRECTIVES.md, 2026-08-09)

Treat LOOP_DIRECTIVES.md as authoritative. Status per directive, verified against
the working tree at commit `8534788` (62/62 tests green, typecheck/lint/doctor pass):

| # | Directive | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Cards not "knackered" (P0) | Done | `HandFan` measures real container + card aspect ratio; two-card hands upright with 12px gap; 3–10 card fans bounded. Re-verify at 375px in the fallback slice. |
| 2 | Deckd-branded card backs (3) | Done | `assets/card-back-{deckd,noir,crimson}.png` exist; `PlayingCard.normalizeBackId` maps brand→deckd, ink→noir, gold→crimson. |
| 3 | Card fronts from proven repo | Done | `vendor/card-fronts/{hayeah,notpeter}` (110 SVGs total); `CardFaceArtwork.tsx` ports to RN-SVG with French pip layouts, both corner indices, court frames, joker art. |
| 4 | Game setup page redesign | Done | `HubLayer` (1074 lines) stages a deck on the shared table; morphs from home; preset preview card + player rail + table-edge action dock. |
| 5 | Game presets redesign | Done | Presets render as `CardButton` chips on a horizontal rail with one-line `PRESET_OUTCOMES` + staged preview + summary. |
| 6 | Nav bar integration | Superseded by #11 | — |
| 7 | Seamless setup→table transition | Done | Single-surface morph via `SurfaceMorphContext`; no route-level page flip; physical card motion only. |
| 8 | Logo wherever possible | Done | `assets/logo.svg` canonical; used in nav center, card backs, app icons, apple-touch-icon, manifest. |
| 9 | **Table background texture** | **NOT DONE** | `FeltBackground` (`app/index.tsx:128`) paints flat `surfaceBase` fill + decorative ovals + a "weave" of only 4 hairline borders (2H+2V). No paper/felt grain exists. |
| 10 | Preview mode: no hard locks | Done | Master gate removed from `LobbyLayer.handleCreate`; store preview-unlocks on tap; locks stay visual. |
| 11 | Nav bar redesign | Done | `GlobalNavBar` is one continuous ivory `navStrip` rail, 1px top rule, labelled Home/Store/Presets/Profile, 44px+ targets (minHeight 58), animated active rule, spring press, deal-in stagger, center logo Deal button. No shells/shadows/rotation. |

**Largest remaining gaps:**
1. **Tactile — Directive 9 (table texture).** The only unaddressed visual directive.
   The table surface is a flat fill with 4 hairlines; it does not read as warm
   paper or felt. This is the largest tactile gap and affects every surface
   (`FeltBackground` is the ambient layer behind home, hub, table, and pass).
2. **Goal-driven — no engine guidance.** `src/engine/selectors.ts` (177 lines)
   has no `canDraw`/`canPass`/`availableActions`/next-action logic. The table
   disables controls via `isMyTurn` but never suggests the next useful move.
   This is the largest "self-directed" gap.

## Prioritized implementation slice (UI worker — t_b0862610)

### Slice: Warm paper-grain table surface (Directive 9)

Add a subtle warm paper/felt grain to `FeltBackground` so the playing surface reads
as a real material, not a flat colour fill. This is the single unaddressed visual
directive and the highest-impact tactile improvement: it touches every screen
because `FeltBackground` is the ambient layer behind all surfaces.

**Directive text (verbatim):** "The playing surface should have a subtle warm
texture (paper/felt-like grain, ivory) instead of a flat colour fill. Keep it
subtle, no pattern tiles, no greens. Apply in `components/layers/TableLayer.tsx`
(and HubLayer if it shares the surface family)."

**Scope:**
- Replace the 4-hairline "weave" in `app/index.tsx` `FeltBackground` with a real
  low-opacity grain. Two viable approaches (builder picks the one that reads best
  at 375px; no new dependencies either way):
  - **(A) Procedural SVG grain** — a `react-native-svg` (already installed) layer
    of many low-opacity dots/short strokes scattered with a seeded RNG, tinted
    with `colors.surface` / `alpha.inkOverlay02`. Pure code, no asset needed.
  - **(B) Generated noise PNG** — a small (128×128 or 256×256) ivory paper-grain
    PNG tiled at opacity ~0.04–0.06, built with a script like the existing
    `make-deckd-card-back.py` family. Most authentic paper feel; one asset.
- The grain must sit behind all content (`pointerEvents="none"`, low z) and not
  interfere with the existing radial glow, rail ring, or well geometry.
- Respect the equipped table theme: the grain tint should derive from
  `tableTheme.surfaceBase` / `glowTint` so Crimson Felt and Dark Oak also get a
  material treatment, not just Ivory.
- No pattern tiles (repeating geometric motifs), no greens, no new dependencies,
  no raw hex outside `src/lib/theme.ts`.

**Acceptance criteria:**
- At 375px the default Ivory Table surface shows visible warm grain, not a flat
  fill, when viewed on Home, Hub, and Table.
- The grain is subtle enough that card art, text, and controls remain crisp; no
  moiré, no banding, no distraction from the deck.
- Crimson Felt and Dark Oak themes also gain a material treatment (grain tint
  derives from theme tokens, not hardcoded ivory).
- `scrollWidth` stays 375px; no horizontal overflow introduced.
- `npm run typecheck`, `npm run lint`, `npx jest` (62 green), `npx expo-doctor`
  all pass after the change.

**Affected files:**
- `app/index.tsx` — `FeltBackground` component + `weaveH`/`weaveV`/vignette styles.
- `src/lib/theme.ts` — add a grain tint token if needed (e.g. `alpha.paperGrain`).
- `src/engine/visuals.ts` — optionally add a `grainTint` field to
  `TableThemeDefinition` so each theme owns its grain colour.
- (If approach B) `assets/table-grain.png` + a generator script under
  `~/AppData/Local/hermes/scripts/` matching the existing card-back pipeline.
- `docs/LOOP_PLAN.md` — implementation note after delivery.

**Risks:**
- Over-rendering grain (too many SVG nodes) could hurt web perf at 375px. Mitigate:
  cap node count, use a single tiled Image if perf is a concern, profile with the
  existing Playwright flow.
- A PNG tile could read as a repeating pattern (directive says "no pattern tiles").
  Mitigate: use a large enough tile (256px) at low opacity, or prefer procedural
  scatter (approach A) which is non-repeating by construction.
- Tint must not reintroduce green. Derive from theme tokens only.

## Fallback next slice (gameplay worker — t_533e3665)

### Slice: Engine guidance selectors + table next-action affordance

Add lightweight, non-blocking guidance so Deckd feels goal-driven and
self-directed (assisted freedom: help, don't restrict).

**Scope:**
- Add `selectAvailableActions(state, viewerId)` to `src/engine/selectors.ts`:
  returns the set of currently valid moves (`draw`, `pass`, `flip`, `discard`,
  `shuffle`, `end`) derived from `canApplyEvent` + phase + turn state. Pure,
  deterministic, framework-free — matches the existing selector style.
- Add `selectSuggestedAction(state, viewerId)`: the single highest-value next
  move (e.g. `draw` when hand is empty and it's your turn; `pass` when you've
  acted). This is a *suggestion*, never a gate.
- Surface it on the table as a subtle affordance — e.g. a gentle pulse on the
  draw pile or pass button — without disabling any valid alternative. The
  player can always draw, flip, discard, reorder, or pass if the rules allow.
- Add focused jest tests in `src/engine/selectors.test.ts` covering: valid
  choices at session start, mid-play, when draw pile is empty, when not your
  turn, and after session end. Cover that `selectSuggestedAction` never
  returns an action that isn't in `selectAvailableActions`.

**Acceptance criteria:**
- The suggested action is visible at 375px but never blocks a valid alternative.
- Existing game rules and all 62 tests remain intact; new tests cover the
  guidance selectors.
- `npm run typecheck`, `npm run lint`, `npx jest`, `npx expo-doctor` pass.

**Affected files:**
- `src/engine/selectors.ts` — new selectors.
- `src/engine/selectors.test.ts` — new test file.
- `components/layers/TableLayer.tsx` — consume the suggested action for the
  subtle affordance (e.g. animated pulse). Do NOT duplicate the UI owned by the
  texture worker; this worker touches interaction behaviour only.
- `docs/LOOP_PLAN.md` — implementation note after delivery.

**Risks:**
- The affordance must not feel like a tutorial arrow or a hard gate. Keep it
  calm — a slow opacity breathe, not a bounce. Respect reduce-motion (fade only).
- Avoid coupling to the texture worker's files; the two workers edit different
  surfaces (`app/index.tsx` vs `TableLayer.tsx` interaction layer).

## Integration slice (t_2a4d3147 — generalist)

After both builders deliver, the integrator:
1. Runs all gates: `npm run typecheck`, `npm run lint`, `npx jest`, `npx expo-doctor`.
2. Starts the web app and inspects Home → setup → Deal 2 each → table → pass at
   375px, confirming: warm grain visible, no flat fill; suggested-action affordance
   present but non-blocking; menus blend into the table; no page-flip; warm
   white/red consistent; assistance does not restrict play.
3. Deploys: `npx expo export --platform web`, refresh `app-serve/`, `pm2 restart
   deckd-app`, verify `https://deckd-app.roxai.click` loads with both slices
   visible.
4. Updates this file with the delivery note and any remaining gap. Does NOT claim
   STANDARD MET unless directives 9 + the guidance gap are actually closed.

## Verification at 375px (all slices)

Every slice must be verified at 375px width (iPhone SE / small Android) with the
existing Playwright or manual flow:

1. **Geometry:** `scrollWidth === bodyScrollWidth === 375` (no horizontal overflow).
2. **Material:** Home, Hub, and Table surfaces show warm grain, not a flat fill.
3. **Cards:** two-card hand upright with gap; 3–10 card fans bounded; branded back
   visible on draw pile and opponent stubs; SVG fronts crisp.
4. **Nav:** all five controls inside x=8–367/y=748–806; 44px+ targets; no shells.
5. **Flow:** Home → setup → Deal 2 each → Deal now → table → PASS TURN → pass veil
   completes with zero console/page errors.
6. **Guidance:** suggested action visible but does not disable valid alternatives.
7. **Gates:** typecheck, lint, 62 jest tests, expo-doctor all pass.
8. **Deploy:** public preview returns HTTP 200 and the same 375px flow completes.

## Decisions

- Keep Plus Jakarta Sans, Reanimated 4.5, Zustand + MMKV, event-sourced engine.
  No new dependencies, no new state/styling libraries, no raw hex outside theme.ts.
- Keep the layered-surface architecture and single-surface morph; no route-level
  page flip (directive 7).
- Keep `vendor/card-fronts/` as the in-repo source of truth for card faces; do not
  add raw SVGs as runtime assets.
- Crimson is the only strong chromatic accent; gold reserved for explicit
  premium/card accents.
- The grain tint derives from the equipped table theme so all themes stay material.
- Guidance is a suggestion, never a gate — preserves assisted freedom.

## Re-plan note for follow-up work

After these slices land, the next highest-impact items (in priority order):

1. **P0 card re-verification (directive 1).** The plan marks card geometry done,
   but it is P0. A fresh visual audit at 375px across 2–10 card hands (fan + stack)
   should confirm no overlap, clipping, or jitter before closing the LOOP.
2. **Real 2-device lobby test.** Relay + transport are deployed and unit-tested,
   but no end-to-end 2-device test against `relay.roxai.click` exists. This is
   the multiplayer confidence gate (AGENTS.md: do not claim multiplayer works
   without it).
3. **RevenueCat store products.** App code is wired; App Store / Play Console /
   RevenueCat dashboard products are the blocker (Josh, ~1 hour per
   docs/MONETIZATION.md). Preview mode keeps everything testable without them.
4. **Rive mascot / personified animations.** Still parked. The table mascot is
   the remaining premium-animation gap once the tactile surface lands.