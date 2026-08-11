# Deckd LOOP plan

Last updated: 2026-08-11 (LOOP `t_9f20d120`; free library rules slice verified locally). This plan is the living
prioritisation for the Deckd LOOP. It is updated against the current
directives and repository reality each audit. `docs/LOOP_DIRECTIVES.md` wins
over anything here where they conflict; `docs/DESIGN_PLAN.md` is the design
thesis; `STATUS.md` keeps the verified-state log.

## Standard

Deckd should read as one continuous physical card table: warm ivory paper
stock, restrained crimson ink, warm ink typography, deterministic grain,
hairline rules, and object-led controls. Setup is staging the same deck on
the same surface; navigation is part of the table edge; motion explains
physical actions without turning the app into a page carousel. Assisted
freedom: the game helps, it does not restrict. The acceptance viewport is
375×812, with a desktop check as the second proof point.

## Current state snapshot (verified 2026-08-11)

Branch `cleanup/ready-to-build`. This run reconfirmed `npm run typecheck`,
`npm run lint` (0 errors / 0 warnings), `npx jest --runInBand` (11 suites / 102
tests), and `npx expo-doctor` (20/20) after adding the free-library rules slice.
Preview remains live at
https://deckd-app.roxai.click
(PM2 `deckd-app`), relay live at https://relay.roxai.click, landing at
https://deckd.roxai.click.

### Directives — implemented vs missing

| # | Directive | State | Evidence |
|---|-----------|-------|----------|
| 1 | Cards not knackered (P0) | **Done** | `PlayingCard` on 2.5:3.5 `SIZE_MAP`; `HandFan` bounds 2/10-card; web QA passes 375px+desktop |
| 2 | Branded card backs (3 options) | **Done** | `BUILTIN_CARD_BACKS` = brand/noir/crimson, all `unlockedByDefault:true`; `PlayingCard` resolves via `backAsset`; cosmeticsStore equip/unlock wired |
| 3 | Card fronts from vendored SVGs | **Done** | `CardFaceArtwork` + `CardCourt` from `vendor/card-fronts/`; react-native-svg pips/corner indices/court treatment recolored to palette |
| 4 | Game setup full redesign | **Done** | `HubLayer` stages recipe backs, player chips, option tokens, table-edge Deal/Host dock; flexed `ScrollView` over fixed dock at 375px |
| 5 | Presets redesign | **Done** | `PRESET_BACKS` maps each preset to a back; recipe cards + one-liner outcomes in HubLayer |
| 6 | Nav bar integration | **Superseded by 11→13** | — |
| 7 | Seamless setup→table transition | **Done** | shared `SurfaceMorphContext`, no route-wide page flip; `FlipCard` for faces only; reduce-motion respected |
| 8 | Logo wherever possible | **Done** | `brand.logo`/`assets/logo.svg` via `lib/assets.ts`; iOS touch icon + manifest live; back face uses brand logo |
| 9 | Table background texture | **Done** | `components/TableSurface.tsx` applies the selected theme's paper wash, inset frame, hairline rules, and deterministic `PAPER_GRAIN_PATH` inside `HubLayer` and `TableLayer`; 375px + desktop browser proof is clean |
| 10 | Preview mode: no hard locks | **Done** | store/lobby affordances keep lock visuals but taps not blocked; Master gate removed in LobbyLayer |
| 11 | Nav bar redesign (rail) | **Superseded by 13** | — |
| 12 | Card faces: paper not pixels | **Done** | paper grain fronts, warm ink/crimson suits, corner indices, French pips, court treatment, no gold |
| 13 | Nav v3: chips on table edge | **Done** | `GlobalNavBar` = thin 6px edge lip + 4 labelled chips (active lift/rim/shadow, reduce-motion stagger) + separate 2-back Deal deck object; `NAV_BAR_RESERVE` respected |
| 14 | Setup: staging the deck | **Done** | HubLayer recipe-card fan, player chips, option tokens, deck-object Deal, lobby chip; shared table surface |
| 15 | Priority: gameplay+visuals first | **Standing order** | build order enforced below; monetization parked |

### Engine / interaction state

- Event-sourced engine with zones (public/private/hidden), 52-card + jokers,
  seeded shuffle, presets (freeplay, deal-2, War, Go Fish, Old Maid, Crazy
  Eights, Sevens, blackjack-ish, poker-ish).
- Actions: draw, flip, discard/play, reorder, pass turn, ask, pair, books,
  suit runs, shuffle, end/reset.
- **Assisted freedom wired:** `selectAvailableActions` (affordance set) +
  `selectSuggestedAction` (one non-blocking next move) + `selectGuidanceState`
  (semantic phase). TableLayer renders the suggestion + "Also open:" copy
  without hiding alternate actions. Guidance is null while waiting on another
  player.
- **Turn ownership hardened:** TableLayer only wires hand gestures that the
  current affordance set allows, and the relay host rejects out-of-turn hand
  intents or moves outside the public discard zone. Waiting players can inspect
  the table without mutating their hand.
- **Recipe schema slice is now wired:** `src/engine/recipes.ts` defines the
  serialisable `Recipe` model and pure `executeRecipe`; the four built-ins are
  data definitions in `presets.ts`, and `gameStore` executes recipes for new
  sessions and solo next-hand deals. The old `Preset.setup()` remains only as a
  compatibility adapter while the manifest scaffold stays separate.
- Free-library rule paths now enforce playable v1 loops and emit `session/end`
  winners; Blackjack/Poker remain the existing rule-driven "ish" variants with
  their current readouts and action rails.
- Winner/end UI is still intentionally compact: `session/end` resolves the
  engine state and the existing TableLayer ended banner carries the handoff.

### Multiplayer state

- **Relay transport built and wired:** `lib/relayTransport.ts` (WebSocket
  client), `lib/relayProtocol.ts` (wire framing), `src/store/lobbyStore.ts`
  (relay session + roster), `src/store/multiplayerBridge.ts` +
  `src/store/syncLogic.ts` (host broadcast / guest fold / snapshot). Tests
  cover lobbyStore, syncLogic, multiplayerBridge.
- **LobbyLayer is the full relay flow** (landing/create/join/room) — the old
  BLE scan UI is gone. Hosting gated cosmetically (Master pass visual, no hard
  block per directive 10).
- **Entitlement wired:** `lib/entitlement.ts` HMAC token +
  `Purchases.addCustomerInfoUpdateListener` in `app/_layout.tsx`; RevenueCat
  keys empty (preview mode).
- **NOT verified end-to-end on two devices.** STATUS.md lists this as the
  remaining multiplayer gate.

### Tech debt still open (PARKED_IDEAS.md)

Unused assets (Gameboard.png/Pass.png), BLE dead weight (lib/ble.ts,
bleProtocol.ts, bleStore, native module), CI on wrong branch, expo-audio
unused, stale workspace file. All parked behind gameplay-first priority.

---

## Slice selection — `t_8be4b895` audit (2026-08-10)

**Selected surface: Presets / Library page — `app/list.tsx`** (the routed
`/list` screen, reached via the "Presets" nav chip). This is the single
highest-impact table-native surface to refine next.

**Why this surface (vision + priority):**
- Directive 15 build order is gameplay+visuals first; picking a recipe is the
  gateway to every game, so the library is the highest-traffic non-game
  surface. Store is monetization (parked); profile/settings are low-traffic
  config. The library is the one that materially advances the gameplay loop.
- DESIGN_PLAN §2 rejects "floating containers" and "pages"; the committed
  `/list` is a flat `colors.bg` screen with boxed `CardSection` shells — exactly
  the settings-form pattern Josh rejected for setup. The table, setup
  (HubLayer), and nav (GlobalNavBar) already read as one continuous table; the
  four routed pages do not, and `/list` is the most visible of them.
- A table-native redesign of `/list` is **shipped** in commit `4d6a51a` and
  deployed. The follow-up keeps its fanned recipe cards, Yours section, and
  chip/token actions intact; only narrow correctness and table-continuity
  fixes are allowed here.

**Existing shortcomings to fix (traced in the uncommitted `app/list.tsx`):**
1. **Render-phase SharedValue mutation (correctness bug).** `RecipeCard`
   calls `flip.value = withTiming(...)` directly in the component body
   (`app/list.tsx:278-280`). Mutating a Reanimated `SharedValue` during render
   on every prop change is a footgun (warns in dev, can desync on fast
   toggles). Move it into a `useEffect` keyed on `[active, reduceMotion]`.
2. **Duplicated `PRESET_BACKS`.** The same `PRESET_BACKS` map exists in both
   `app/list.tsx:20-25` and `components/layers/HubLayer.tsx:47-52`. Drift
   risk. Extract to one shared export (e.g. `src/engine/visuals.ts` or a small
   `src/lib/presetAssets.ts`) and import from both.
3. **Flat root background.** Root is `backgroundColor: colors.bg` (cool
   off-white `#FAFAFA`), not the warm table stock. The table-native version
   already wraps content in `<TableSurface mode="setup" />` — keep that as
   the material root and drop the opaque `colors.bg` so the page reads as the
   same surface as setup/play, not a separate screen.
4. The committed `/list` uses `CardButton`/`CardSection` shells (boxed
  containers) — the redesign already replaces these with recipe-card and
  chip/token primitives; keep that direction.

**Affected components + design-token usage:**
- `app/list.tsx` — the page (root container, recipe cards, owned cards,
  editor, clone list). Already imports `TableSurface`, `PlayingCard`,
  `NAV_BAR_RESERVE`, reanimated, lucide icons.
- `components/TableSurface.tsx` — shared material pass; already used by the
  uncommitted list. No change needed unless tone tuning is required.
- `components/PlayingCard.tsx` — recipe/owned card backs (size `lg`/`sm`/`xs`).
- `src/lib/theme.ts` — tokens used: `colors.bg` (drop as opaque root),
  `colors.cardPaper`, `colors.cardEdge`, `alpha.*`, `radii.*`, `shadow.*`,
  `space.*`, `textStyles.*`. No new colors needed; any new tone goes here
  first. No raw hex outside theme.ts.
- `NAV_BAR_RESERVE` (from `GlobalNavBar`) — bottom content padding (already
  respected in the uncommitted list, line 71).

**Responsive behavior at 375px (verified against the uncommitted layout):**
- Recipe rail = horizontal `ScrollView`, 124px cards with -14px stagger → ~3
  cards in view at 375px, scrolls horizontally. No overflow.
- Owned section uses `gap`-based stacking; cards are full-width with 44px-min
  action chips. Fits 375px.
- Clone-list rows are 48px min height; "Add a recipe" button is 44px min.
- `NAV_BAR_RESERVE` + `insets.bottom` padding keeps content clear of the nav.
- Action: confirm no horizontal overflow and all controls ≥44px after the
  render-mutation fix.

**Precondition (preserved in the working tree):** the HubLayer `TableSurface`
fade-in fix (`components/layers/HubLayer.tsx` — fades the setup surface from
0→1 with morph progress so it stops washing out Home) must ship alongside the
shared preset-asset extraction, since both touch the table-surface continuity
story. Do NOT discard it.

**Implementation recommendation for `t_7e03a0a6` (builder):**
1. Commit the uncommitted HubLayer `TableSurface` fade-in fix first (it's a
   one-block, already type-checked). Re-verify home is not washed out at 375px.
2. Finish `app/list.tsx`: fix the `RecipeCard` render-mutation (move
   `flip.value = withTiming(...)` into `useEffect`), extract `PRESET_BACKS`
   to a shared export, and keep `TableSurface` as the material root (drop the
   opaque `colors.bg` root).
3. Keep the recipe-card fan, owned-card stack, chip/token actions, and
   clone-list — they already match the directive 14 "staging the deck"
   language. No new primitives needed.
4. No new dependencies, no raw hex, TypeScript strict. Run typecheck, lint,
   jest (73 must stay green), expo-doctor.
5. Browser proof at 375×812: Home → Presets → select recipe → back; no
  horizontal overflow, controls ≥44px, no console/page errors. Desktop
  1440×900 geometry check.

**Acceptance checklist:**
- [x] HubLayer `TableSurface` fade-in fix committed; Home no longer washed
      out at 375px.
- [x] `RecipeCard` `flip` mutation moved out of render into `useEffect`.
- [x] `PRESET_BACKS` extracted to one shared export, imported by both
      `app/list.tsx` and `HubLayer.tsx`.
- [x] `/list` root uses `TableSurface` material, not opaque `colors.bg`;
      reads as the same surface as setup/play.
- [x] `npm run typecheck` pass; `npm run lint` 0/0; `npx jest --runInBand`
      73 pass; `npx expo-doctor` 20/20.
- [x] 375×812 browser proof: no horizontal overflow, all controls ≥44px,
      no console/page errors; desktop 1440×900 geometry check passes.
- [x] No new dependencies, no raw hex outside `src/lib/theme.ts`.
- [x] Commit to `cleanup/ready-to-build`; update STATUS.md with one bullet.

---

## Highest-impact next slices (prioritised)

Build order follows directive 15: visuals/gameplay first, monetization later.
Each slice: one surface, typecheck+lint+jest+expo-doctor, 375px web proof,
commit to `cleanup/ready-to-build`, deploy preview, verify 200.

### Slice A — Table surface paper grain (directive 9) [P0, visual]

**Why first:** the only directive still substantively missing; the `paperGrain`
module already exists and explicitly says it is "shared by the table surface";
it is the largest gap between "done" directives and the stated standard.

**Scope:**
- Add a `FeltBackground` (or fold into `TableLayer`/`HubLayer` root) that paints
  `colors.surface` + the deterministic `PAPER_GRAIN_PATH` as a quiet SVG
  overlay, ivory tone, no pattern tiles, no greens. Subtle.
- Apply to `TableLayer` root and the shared hub surface family so setup and
  play read as one continuous table.
- No new deps; SVG via react-native-svg (installed). No raw hex outside
  `src/lib/theme.ts`.
- Verify 375px + desktop: grain visible but quiet, no overflow, no jitter.

**Dependencies:** none. Self-contained visual slice.
**Files:** `components/layers/TableLayer.tsx`, `components/layers/HubLayer.tsx`
(shared surface), possibly a small `components/FeltBackground.tsx`.
**Stop criteria:** directive 9 reads done in a side-by-side; web QA passes;
gates green.

**Delivered (`t_e8f01b75`):** Added `components/TableSurface.tsx` as the local
material pass for both roots. It keeps the persistent canvas silhouette, then
adds a theme-aware translucent stock layer, quiet central paper wash, inset
hairline frame, table-edge rules, and the deterministic grain path. Setup uses
a slightly calmer pass than play so recipe cards remain the focal object; no
new dependency or raw color was introduced. Local Playwright proof completed
setup → Deal now → table → draw at 375×812 and 1440×900 with zero page/console
errors and no horizontal overflow.

**Follow-up visual correction (`t_e8f01b75`, Aug 10 2026):** The setup
`TableSurface` in `HubLayer` now fades from 0→1 with the existing home→setup
morph progress instead of painting over Home while both layers are mounted.
This preserves the continuous warm table at setup while restoring Home's
intended crimson/ink contrast. The post-fix browser pass covered 375×812 and
1440×900, with reduced-motion coverage at 375×812; widths matched each
viewport, key nav/deal controls stayed in bounds, and page/console errors were
empty. The routed Presets (`app/list.tsx`) redesign is already shipped; the
remaining follow-up here is the narrow shared-asset/correctness pass plus
native-device proof.

### Slice B — Recipe schema v1 (DESIGN_PLAN §6) [P0, gameplay foundation]

**Why:** directive 15 build order step (2). The manifest scaffold exists but is
unwired; the 4 code-based presets must become data so the free library
(War/Go Fish/Old Maid/Crazy Eights/Sevens) and AI generation become "recipes,
not code." This is the unlock for the whole game-library track.

**Scope:**
- Define `Recipe` types (deal pattern, actionPolicy, turnPolicy, winCondition,
  helpers, variants) per DESIGN_PLAN §6 schema.
- Implement `executeRecipe(recipe, input)` replacing each `Preset.setup()` body.
- Migrate the 4 existing presets to recipes with **identical behavior** — all
  71 tests must stay green (add recipe-specific tests).
- `customPresets.ts` upgrades to the schema; user presets are recipes saved
  locally.
- No new actions yet (`card/ask`, match rules) — those land with the free
  library in Slice C.

**Dependencies:** none (engine is framework-free, tests cover it).
**Files:** `src/engine/presets.ts` → `src/engine/recipes.ts` (or extend
presets), `src/engine/manifest.ts` (align with schema), `src/engine/types.ts`,
`src/store/presetsStore.ts`, engine tests.
**Stop criteria:** 4 presets are recipes, behavior identical, 71 tests green +
new recipe tests, `builtinPresets` exposes recipes.

### Slice C — Free game library (directive 15 step 3) [P1, gameplay]

**Why:** the "freedom needs recipes" thesis. War/Go Fish/Old Maid/Crazy
Eights/Sevens are zero-engine-risk recipes that prove the schema works and give
the app real games beyond deal-2.

**Scope:** one recipe + minimal engine addition at a time:
- War (2p) — flip, compare; pure recipe, no new action.
- Go Fish (2-6) — needs `card/ask` action + `allowAsk` policy.
- Old Maid (2-8) — joker = maid, pair-and-pass; `countPairs` helper.
- Crazy Eights (2-7) — `matchRule: suitRank`, eights wild.
- Sevens/Fan Tan (3-8) — `matchRule: sevenAround`.
- Each gets a recipe card (back + one-liner) in the HubLayer fan / Presets list.

**Dependencies:** Slice B (recipe schema). New engine actions behind schema
flags only.
**Files:** `src/engine/recipes.ts` (or per-game files), `src/engine/events.ts`
(new `card/ask`), `src/engine/selectors.ts`, engine tests, `app/list.tsx` /
HubLayer recipe fan.
**Stop criteria:** each game playable pass-and-play, rules enforced by recipe
flags, tests green, 375px proof.

### Slice D — Full Blackjack + Hold'em (directive 15 step 4) [P1, Josh's explicit ask]

**Why:** Josh named these explicitly. Blackjack already has a dealer + sum
helper; upgrade to full dealer logic (draw-to-16/stand-on-17, soft ace,
dealer toggle). Hold'em upgrades from "hole cards shell" to community table +
hand-ranking helper.

**Scope:**
- Blackjack recipe: dealer AI logic in engine, dealer on/off toggle,
  soft-ace handling, `showHandSum` already exists.
- Texas Hold'em recipe: communal zones (flop/turn/river), hand-ranking helper
  (no rule enforcement beyond deal order, per DESIGN_PLAN).
- Both appear as premium-tier recipe cards.

**Dependencies:** Slice B (schema). Hand-ranking is a helper, not a rule engine.
**Files:** `src/engine/recipes.ts`, `src/engine/selectors.ts` (rank helper),
`src/engine/types.ts` (communal zones already have `communalZoneId`), tests.
**Stop criteria:** full dealer cycle works; Hold'em deals community + ranks
hands; tests green.

### Slice E — Native device proof + two-device lobby [P1, verification]

**Why:** STATUS.md's two remaining "next actions." No native touch or
two-device lobby claim can be made without device evidence. This is a
verification slice, not a feature.

**Scope:**
- Run native build on a real phone: touch targets, safe areas,
  reduced-motion, card rendering at device width.
- Real two-device lobby test against `relay.roxai.click`: host creates, guest
  joins, full turn cycle, snapshot reconnect.
- Record evidence (screenshots/notes) in STATUS.md.

**Dependencies:** relay live (it is). A second device.
**Stop criteria:** both flows exercised on real targets; STATUS.md updated with
device evidence; no claim made without it.

---

## Current LOOP run — `t_9f20d120` (2026-08-11)

The authoritative audit order is active. Visual directives 1–14 are already
recorded as shipped in the prior audit/status trail, so this run takes the
highest-impact gameplay unlock rather than churn stable card chrome.

### Slices B/C — Recipe schema + free library rules (complete; preview deployed)

- Material language remains the warm ivory/crimson/ink table: recipes are the
  data behind the deck and recipe-card objects, not a new UI surface.
- Added the framework-free serialisable `Recipe` model and pure
  `executeRecipe` executor in `src/engine/recipes.ts`.
- Converted Freeplay, Deal 2, Blackjack, and Poker to data definitions. The
  `Preset` wrapper stays intentionally thin for existing UI/library callers;
  `gameStore` now executes the recipe for new sessions and solo next hands.
- Preserved round-robin ordering, poker setup behavior, community zone
  creation, and the virtual-house blackjack face policy. Added five focused
  recipe tests; the full suite is now 11 suites / 102 tests.
- Free-library rules landed in commit `e8de47f` after the schema commit: War,
  Go Fish, Old Maid, Crazy Eights, and Sevens now run through auditable
  primitive-event loops with contextual action rails.
- Exported bundle `entry-a0eda8d54b3eddd5411bd7d465e2e6e7.js` is live on
  `https://deckd-app.roxai.click`; public core-flow, 375px library loops, and
  1440px War geometry all pass with no console/page errors.

### Next decisions already made

1. `Preset` wraps `Recipe` until all UI/store callers consume recipe metadata;
   do not break the existing pass-and-play contract during the library build.
2. Keep the recipe executor in one `src/engine/recipes.ts` file through the
   first four new games; split per-game definitions only when the file becomes
   difficult to review.
3. Monetisation, RevenueCat, Rive, and AI generation remain parked.

## Decisions (to make or confirm)

1. **Recipe schema vs current Preset interface:** `Preset` wraps `Recipe` as a
   thin adapter so existing selectors/stores keep working during migration.
2. **Where recipes live:** single `recipes.ts` vs per-game files under
   `src/engine/recipes/`. Recommendation: per-game files once count > 4; keep a
   `recipes/index.ts` barrel.
3. **Premium library gating (parked):** per-recipe unlock vs Master bundle is
   a monetization decision — stay parked until gameplay is right (directive 15).
4. **AI generator (parked):** relay endpoint + schema validator + suit credits.
   Build only after the recipe schema + free library prove the pattern.

## Stop criteria for this LOOP audit task

This audit task (`t_5324ac11`) is complete when:
- `docs/LOOP_PLAN.md` reflects the current directives and repository reality
  (done — this file).
- The plan identifies the highest-impact next slices with dependencies,
  decisions, and stop criteria (done above).
- Verification/deployment requirements are noted (done below).
- No speculative features are planned (recipe schema + free library are
  directive 15 build order, not speculation).

The two downstream children execute against this plan:
- `t_e8f01b75` (visual) → Slice A is its highest-impact target.
- `t_6e8ffc01` (interactions) → Slices B/C/D are its highest-impact targets.

## Verification / deployment requirements (every slice)

- `npm run typecheck` (node --stack_size=8000 wired in package.json)
- `npm run lint` (0 errors, 0 warnings)
- `npx jest --runInBand` (71 tests must stay green; add tests for new behavior)
- `npx expo-doctor` (20/20)
- 375×812 web proof via `npm run dev:web` + `qa/deckd-visual-qa.cjs`; desktop
  geometry check at 1440×900
- Deploy after meaningful slices: `npx expo export --platform web` → refresh
  `app-serve/` → `pm2 restart deckd-app` → verify `https://deckd-app.roxai.click`
  returns HTTP 200 with `x-roxai-router: deckd-app`
- Commit each slice to `cleanup/ready-to-build` with a clear message
- Update `STATUS.md` with one or two concise bullets per meaningful slice

## Guardrails (unchanged)

- One surface per slice; no route-wide page flip.
- `src/lib/theme.ts` tokens for colors; no raw hex sprawl or new dependencies.
- Preserve pass-and-play behavior and the event-sourced engine.
- Keep PREVIEW MODE usable: monetization visuals may look locked but taps
  cannot hard-block testing.
- Do not claim native touch or real two-device lobby behavior without device
  evidence.