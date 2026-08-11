# Deckd status

Last update: 2026-08-11 (free library rules + mobile overflow hardening — local gates green and preview redeployed; `t_9f20d120`).

## Deployment

- Landing page live at https://deckd.roxai.click (PM2 `deckd-landing` on 127.0.0.1:8084, router route `deckd-landing`, wildcard tunnel already covered it). Hero verified over HTTPS. Static server: `landing/serve.mjs`.
- App preview live at https://deckd-app.roxai.click (PM2 `deckd-app` on 127.0.0.1:8085, route `deckd-app`, static server: `app-serve/serve.mjs`).
- Relay live at https://relay.roxai.click (PM2 `deckd-relay`, route `deckd-relay`, port 8083).

## Current baseline

Expo SDK 57, React Native 0.86, React 19, TypeScript strict. Expo Router app with layered surfaces: `home | hub | table | lobby | pass`. Zustand + MMKV local state. Event-sourced game engine. Pass-and-play flow with privacy veil, hand fan/stack, draw/discard/flip/pass-turn. Multiplayer game-state sync over relay remains a separate paid-hosting path; pass-and-play stays inert without relay.

## Recipe schema slice (2026-08-11)

- `src/engine/recipes.ts` now owns the serialisable `Recipe` model and pure `executeRecipe` executor. Freeplay, Deal 2, Blackjack, and Poker are data definitions; `gameStore` executes recipes for new sessions and solo next hands while `Preset` remains a compatibility adapter.
- Added five recipe regression tests; Jest is now **102 tests / 11 suites**. Typecheck, lint (0 errors / 0 warnings), and expo-doctor **20/20** pass. Local web proof remains green at 375×812 and 1440×900; the visual QA probe's RN-Web scroll ancestor selector was made resilient to the current `150rngu` class form.

## Free library rules slice (2026-08-11, `t_9f20d120`)

- Added playable War, Go Fish, Old Maid, Crazy Eights, and Sevens presets on the serialisable recipe path. The rule layer emits auditable primitive events, preserves private/hidden zones, exposes contextual action rails, and includes deterministic engine coverage for setup, turns, books/pairs, discard matching, and suit runs.
- TableLayer now renders game-specific piles/readouts/guidance without leaking generic draw/discard gestures into rule games. The rule action rail keeps Blackjack/Poker visible and compacts rank-heavy actions at phone width.
- Mobile web overflow hardening: the ambient and privacy rails stay inside the canvas. This preserves the warm ivory/crimson table language while preventing a focused recipe card from horizontally shifting the entire app root on RN Web.
- Commit `e8de47f` is exported and live as `entry-a0eda8d54b3eddd5411bd7d465e2e6e7.js`; public core-flow, library, and desktop probes pass with zero page/console errors.

## Product direction

- BLE multiplayer is **dropped from the first build**. The native scaffold stays in the repo but is not a v1 dependency and must not be marketed.
- Multiplayer lobbies are the paid feature: a **Deckd Master** pass is required to host; guests join free.
- Pass tiers (verb-named): **Deal** 24h, **Draw** 3d, **Shuffle** 30d, **Master** lifetime.
- Store copy and product naming use "Deckd Master" (app/store.tsx, HomeLayer.tsx).

## Visual LOOP result

- **Material language:** one warm ivory/crimson/ink table world with deterministic paper grain, hairline rules, restrained shadows, and no active green/gold/blue decorative language.
- **Cards:** stable branded 2.5:3.5 shells, warm paper fronts with French pips/corner indices/court treatment, canonical Deckd/Noir/Crimson backs, and bounded fan/stack depth at phone size.
- **Setup:** `HubLayer` is a deal-prep ritual on the shared table surface: recipe cards/back previews, one-line outcomes, player chips, option tokens, and table-edge Deal/Host actions. Its flexed `ScrollView` lets all five token controls scroll above the fixed action dock at 375px.
- **Navigation:** `GlobalNavBar` treats the bottom as a thin 6px table lip with four labelled tactile chips, active lift/rim/shadow, reduced-motion-safe stagger, and a separate two-back card-deck Deal anchor; `NAV_BAR_RESERVE` keeps game surfaces clear.
- **Motion and guidance:** setup/table remain a surface morph with physical card motion only; the opening hand staggers in while later drawn cards settle immediately into the measured fan, draw/discard press feedback remains, and the engine/table expose a single non-blocking next-useful-move suggestion while preserving alternate actions. Hand gestures and relay intents now follow the derived turn affordances, so waiting players can review their hand without accidentally changing it.
- **Preview mode:** store/lobby affordances retain their locked-looking monetization language but do not hard-block taps during testing.
- **Table surface paper pass (Aug 10 2026):** `TableSurface` now adds the selected theme's translucent paper stock, inset frame, hairline edge rules, and deterministic grain inside both setup and live play. The hub and table share a local material pass instead of relying only on the ambient canvas; the HubLayer stock now fades in with the home→setup morph so Home keeps its intended contrast.

## Game engine + surface batch (Aug 10 2026, `8f47622`)

- **Per-game rules engine** (`src/engine/rules.ts`): blackjack (TWIST/STICK/STAND, dealer auto-plays to 17, bust/winner calc; dealer is the LAST seat so pass-and-play opens on a real player) and poker (BURN/FLOP/TURN/RIVER/SHOWDOWN, FOLD/CHECK/CALL/RAISE, 5-of-7 showdown evaluator). Generic presets keep the original draw/flip/PASS UI. Rules emit only primitive events; guests route via `game_action` relay intent.
- **Court cards:** full-panel custom Dealer/Host/Master SVG art in the house palette, mirrored like real courts. **Pip fix:** pips pixel-positioned below the corner zone, corners painted last.
- **Store preview:** felt stage with staggered fan entrance and a flippable card showing the K♠ Master court. **FlipCard tap bug fixed:** invisible layout spacer no longer intercepts touches.
- **Nav:** felt-sweep screen transition (reduce-motion-safe), bottom padding raised, deal text removed from the centre button.
- **Presets library (Aug 10 2026):** the fanned recipe-card redesign is shipped in `4d6a51a` and keeps `/list` on the same table stock; the follow-up only centralizes preset back assets and removes render-phase animation mutation.

## Rules engine fix pass (Aug 10 2026, `571daa6` + `7970086`)

- **Poker was dead end-to-end:** `communal:0` zone was never created, so `canApplyEvent` silently rejected every flop/turn/river deal. Presets now build the community zone; TableLayer renders the community row (xs cards + street label, inline) under the piles.
- **Hand evaluator tiebreaks:** numeric element-wise compare (string `join` made pair of 10s lose to pair of 9s); `beats()` helper.
- **Immutable-state draw indexing:** flop and blackjack dealer draw re-read `cardIds[0]` (pure rules never mutate), dealing the same card repeatedly. Both index into the pile by drawn count now.
- **Empty-draw hygiene:** TWIST/BURN/FLOP/TURN/RIVER hidden when the draw pile is empty; blackjack falls back to STICK only.
- **Rule bar at 375px:** horizontally scrollable instead of truncating labels (`F...`).
- **Ended state:** "You take the table" winner copy (was "You takes the table"); PASS TURN hidden once ended.
- **Online blackjack house seat:** gameStore appends a virtual `house` player (last seat = dealer) when creating a blackjack session. Previously the last REAL player was the dealer — in a 2-player online lobby the guest never got a turn. Pass ritual copy: "You're choosing" (was "You is choosing").
- **Poker unit suite added:** communal zone, flush, straight/wheel, flop deals land, numeric-tiebreak regression. **82 tests total.**

## Solo blackjack + offline shell (Aug 10 2026, `cc06d8e` + `c017844`)

- **Solo mode:** Hub 1-player chip (blackjack-only: auto-switches preset, disabled for others), blackjack preset `minPlayers: 1` + `solo` flag, virtual `house` seat as dealer, `startNextHand` re-deals a fresh hand, HAND OVER banner ("You beat the house" / "House wins this hand") + Next hand CTA.
- **Offline shell:** service worker `public/sw.js` (precache shell, network-first navigations with cache fallback, stale-while-revalidate assets) registered in `+html.tsx`; `serve.mjs` serves hashed build assets `max-age=31536000, immutable`.
- **Proven live in browser:** full solo loop (deal → TWIST → bust → house auto-play → HAND OVER → Next hand → fresh deal) and offline cold launch (server stopped, app boots from cache with game state intact).
- **Tests: 87 total** (2 new solo tests: one-player session, next-hand re-deal). Detail in `references/solo-offline-batch-2026-08-10.md`.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed (0 errors, 0 warnings).
- `npx jest --runInBand` passed **11 suites / 102 tests**, including War, Go Fish, Old Maid, Crazy Eights, Sevens, poker communal-zone, evaluator tiebreak, flop-deal, and blackjack dealer-play regressions.
- `npx expo-doctor` passed 20/20 checks.
- Public smoke: `DECKD_QA_URL=https://deckd-app.roxai.click node qa/deckd-visual-qa.cjs` passed Home → setup → Deal 2 each → table → ten-card draw → `PASS TURN` → pass veil. The script reported all required surface flags true and `errors: []`.
- Public setup scroll probe reported `tokenCount: 5` and `tokensAboveDock: true`; asset cache-busting is available through `DECKD_QA_CACHEBUST` for CDN previews.
- Public geometry probe passed at 375×812 and 1440×900: document/body scroll widths matched each viewport, visible nav/deal controls stayed in bounds, and console/page errors were empty. The fresh public run served the deployed current bundle.
- `qa/deckd-visual-qa.cjs` now asserts the pass veil as well as setup, card, table, guidance, and browser-error checks.
- Public two-client relay proof passed with `qa/deckd-lobby-two-client.cjs`: independent 375×812 host + guest clients created/joined room `NN6H24`, both reported `Relay: connected` and `Players: 2`, both reached the synced table, and a host draw propagated to the guest (`47 LEFT`; guest saw the host's three-card opponent hand); errors were empty.
- Public online-blackjack proof passed with `qa/deckd-lobby-blackjack-qa.cjs` (Aug 10): host created a blackjack lobby, stuck, guest resumed and got TWIST/STICK/STAND, twisted via `game_action` (HAND 5 → 15), host saw the guest's third card, zero console errors. This is the first real E2E proof that guests can play blackjack online.
- Reduced-motion web proxy proof passed with `qa/deckd-responsive-reduced-motion-qa.cjs`: Playwright `prefers-reduced-motion: reduce` was true, Home → setup → table stayed at 375×812 with 44px+ controls and document/body scroll widths of 375; errors were empty. This is not native-device proof.
- Local browser proof for `TableSurface` passed at 375×812 and 1440×900: setup → Deal now → table → draw completed, document/body scroll widths matched the viewport, key controls stayed in bounds, and console/page errors were empty.
- Local post-fix visual proof passed at 375×812 and 1440×900: Home contrast remained healthy, setup/table stayed continuous, menu/deck controls remained in bounds, and page/body widths matched the viewport with no browser errors. Reduced-motion local proxy also passed at 375×812.
- Local free-library proof passed with `qa/deckd-library-qa.cjs`: 375×812 War → Go Fish → Old Maid → Crazy Eights → Sevens flows each exposed and executed a real action, retained turn/readout copy, stayed at document/body/root width 375, and reported no browser errors. `qa/deckd-desktop-qa.cjs` passed War at 1440×900 with stable root geometry and in-bounds Home/Profile/FLIP controls.

## Decisions

- Setup/table remain a single-surface morph with physical card motion; no route-wide rotateY/page-turn transition was added because the brief rejects page-like handoffs.
- Preview mode stays usable without RevenueCat products or keys; entitlement/product setup is not faked.
- Lobby relay sessions intentionally survive the mounted layer changing from lobby → hub/table; the explicit Home action remains the leave path. This is required for a host to keep broadcasting after setup.
- No native touch or physical two-device claim is made until those flows are exercised on the actual targets; this machine currently has no ADB device or emulator, while the live iPhone is not remotely automatable from this host.

## Immediate next actions

1. Continue the gameplay-first audit order from the deployed free-library baseline; the current slice is exported and live.
2. Run a native device touch/safe-area/reduced-motion pass (physical iPhone + Android).
3. Keep RevenueCat product/key work, Rive, and solitaire/premium-library expansion behind the gameplay-first priority.

## Parked tracks

- BLE proof matrix and diagnostics (dropped from v1 scope).
- Rive animation runtime/assets.
- RevenueCat/IAP configuration (keys, App Store products, offering setup).
- Custom rules DSL and full custom game authoring.
