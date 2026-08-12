# Deckd status

Last update: 2026-08-12 (Crazy Eights ready-bar slice — empty-deck fewest-cards winner, contextual draw, CE banner; branch `wt/deckd-loop`).

## Crazy Eights slice (2026-08-12, task t_c0e7d44e, commit `799fc5f`)

- Empty-deck deadlock now crowns the player with the fewest cards (classic rule) instead of the stuck current player; contextual draw keeps the turn when the drawn card is playable.
- Dead generic draw pile removed from the felt for contextual games (crazy-eights, sevens) — drawing lives on the action rail; readout carries remaining draw count so the info isn't lost.
- Dedicated Crazy Eights end banner ("plays out first" winner copy).
- `qa/deckd-crazy-eights-qa.cjs` proves the full loop at 375×812 and 1440×900: play, draw, empty-deck end state, winner copy, replay, zero console errors, no overflow. `qa/deckd-library-qa.cjs` re-run green for all five library games (no sibling regression from the shared pile branch).
- Gates: typecheck, lint 0 errors, jest 192/192 (6 new CE tests), expo-doctor 20/20, review gate passed.

## Go Fish slice (2026-08-12, task t_8b3ac033, commit `9492b33`)

- Go Fish books and Old Maid pairs now render on the felt as face-up card fans per player (accessible labels), instead of vanishing into a numeric readout. End banner shows the winner's book/pair count.
- Engine deadlock fix: Go Fish ends the round on a miss when the draw pile is empty (classic rules) instead of cycling turns forever between hands holding only distinct ranks. Hits with an empty deck still keep the turn.
- `qa/deckd-gofish-qa.cjs` proves the full loop at 375×812 and 1440×900: rules sheet, ASK rail, book on felt, winner + book count, replay, zero console errors, no overflow.
- Gates: typecheck, lint 0 errors, jest 182/182 (3 new engine tests), expo-doctor 20/20, review gate passed.

## Nav v3 slice (2026-08-12, lane `deckd-para-nav3`, commit `4fdc3b5`)

- `components/GlobalNavBar.tsx` reworked per directive 13: no nav bar. The bottom of the screen is the table's physical edge (thin felt lip, 1px crimson rule). Four flat cylinder chips (46px face, 1px rim, engraved lucide mark, tiny label) sit on the edge: Home, Store, Presets, Profile. Active chip raises 4px with crimson rim + soft shadow; press presses into the felt (scale 0.96 quick spring); settle spring on selection. Chips deal in from the edge one by one (40ms stagger); reduced motion = plain fade.
- Deal is not a nav item: it stays the deck object (card-back stack, logo on top) center-bottom above the edge, always present.
- `NAV_BAR_RESERVE` / `GLOBAL_NAV_HEIGHT` exports unchanged — surfaces keep their reserve.
- QA: `qa/deckd-nav3-qa.cjs` (375 + 1440, home/hub/store/list/profile, geometry + no-overflow + chip-face probe) and `qa/deckd-nav3-reduced-qa.cjs` (reduced-motion) green; existing `deckd-responsive-reduced-motion-qa.cjs` green on the table surface. Gates: typecheck, lint (0 errors), jest 169/169, expo-doctor 20/20.

## Deployment

- Landing page live at https://deckd.roxai.click (PM2 `deckd-landing` on 127.0.0.1:8084, router route `deckd-landing`, wildcard tunnel already covered it). Hero verified over HTTPS. Static server: `landing/serve.mjs`.
- App preview live at https://deckd-app.roxai.click (PM2 `deckd-app` on 127.0.0.1:8085, route `deckd-app`, static server: `app-serve/serve.mjs`).
- Relay live at https://relay.roxai.click (PM2 `deckd-relay`, route `deckd-relay`, port 8083).

## Current baseline

Expo SDK 57, React Native 0.86, React 19, TypeScript strict. Expo Router app with layered surfaces: `home | hub | table | lobby | pass`. Zustand + MMKV local state. Event-sourced game engine. Pass-and-play flow with privacy veil, hand fan/stack, draw/discard/flip/pass-turn. Multiplayer game-state sync over relay remains a separate paid-hosting path; pass-and-play stays inert without relay.

## Recipe schema slice (2026-08-11)

- `src/engine/recipes.ts` now owns the serialisable `Recipe` model and pure `executeRecipe` executor. Freeplay, Deal 2, Blackjack, and Poker are data definitions; `gameStore` executes recipes for new sessions and solo next hands while `Preset` remains a compatibility adapter.
- Added five recipe regression tests; Jest is now **104 tests / 12 suites**. Typecheck, lint (0 errors / 0 warnings), and expo-doctor **20/20** pass. Local web proof remains green at 375×812 and 1440×900; the visual QA probe's RN-Web scroll ancestor selector was made resilient to the current `150rngu` class form.

## Free library rules slice (2026-08-11, `t_9f20d120`)

- Added playable War, Go Fish, Old Maid, Crazy Eights, and Sevens presets on the serialisable recipe path. The rule layer emits auditable primitive events, preserves private/hidden zones, exposes contextual action rails, and includes deterministic engine coverage for setup, turns, books/pairs, discard matching, and suit runs.
- TableLayer now renders game-specific piles/readouts/guidance without leaking generic draw/discard gestures into rule games. The rule action rail keeps Blackjack/Poker visible and compacts rank-heavy actions at phone width.
- Mobile web overflow hardening: the ambient and privacy rails stay inside the canvas. This preserves the warm ivory/crimson table language while preventing a focused recipe card from horizontally shifting the entire app root on RN Web.
- Commit `e8de47f` is exported and live as `entry-fcc97988da5b703e58d6cbfb5940e178.js`; public core-flow, library, and desktop probes pass with zero page/console errors.

## Rules/help + replay slice (2026-08-11, `b5205e4`)

- Added a shared `RulesSheet` with plain-English steps, end conditions, and table notes for every built-in recipe. Setup and live table both expose the same rules surface with a 48px Back to the table target and the existing warm paper/scrim language.
- Offline pass-and-play end states now show a round/turn readout and offer Replay table or Back to setup; replay re-deals the same seats through the event-sourced store. Table icon controls also have explicit accessible names for QA and assistive tech.
- `qa/deckd-rules-replay-qa.cjs` proves setup rules, live rules, end state, replay, 375×812 bounds, zero document overflow, and zero browser errors against the public preview.

## Solo Klondike slice (2026-08-11, current LOOP continuation)

- Added a serialisable one-player Klondike recipe with deterministic 28-card tableau / 24-card stock setup, public tableau/foundation zones, draw-one stock, waste recycle, exposed-card flips, alternating-colour run moves, foundation validation, and a 52-card win event.
- Added the table-native `KlondikeLayout`, setup player-range guard, shared rules copy, fresh-deal replay path, focused engine coverage (109 tests total), and `qa/deckd-klondike-qa.cjs` for the real 375×812 + 1440×900 setup → rules → draw/recycle → end → new-deal flow.

## Hold'em betting slice (2026-08-11, `t_6bb2127e`)

- Texas Hold'em now plays a real betting loop: 100-chip starting stacks, 5/10 blinds, fold/check/call/raise with pot and per-player contribution accounting, round completion, and street advance gated on a closed betting round. Fold-to-last-live-player ends the hand immediately; showdown reveals live hands and names the winner.
- New `PokerBettingState` on `GameState.game.betting` drives legal action derivation (`pokerActions`/`pokerApply`). A new `game/bet` primitive event records each action, preserving the event-sourced multiplayer bridge. `turn/set` events move the action between live players; `game/street` resets round contributions.
- TableLayer renders a pot/bet/stack ledger and per-opponent chip pills in the warm ivory/crimson table language. Poker guidance copy explains betting turns vs street advance; community cards and the end-state banner use transform/opacity motion with reduced-motion safety. Rules guide copy explains the blind/bet/showdown loop in plain English.
- Online poker actions remain host-authoritative primitive events; guests route `game_action` intents and stay read-only when disconnected. Lobby exit clears online game state, and both live QA harnesses clear persisted event logs before each client run.
- `qa/deckd-poker-qa.cjs` exercises the full heads-up loop (CALL → CHECK → BURN → FLOP → CHECK×2 → BURN → TURN → CHECK×2 → BURN → RIVER → CHECK×2 → SHOWDOWN → winner) at 375×812 and 1440×900 against the public preview with zero browser errors and a verified pot update. Jest is now **117 tests / 13 suites** (4 new poker betting tests). Typecheck, lint (0/0), expo-doctor 20/20 pass. Bundle `entry-b22501971faac29052ff07470e658aa1.js` is live.

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
- `npx jest --runInBand` passed **13 suites / 113 tests**, including the shared rules-guide contract, War, Go Fish, Old Maid, Crazy Eights, Sevens, Klondike, poker blinds/betting-round/raise/fold-to-win, evaluator tiebreak, flop-deal, and blackjack dealer-play regressions.
- `npx expo-doctor` passed 20/20 checks.
- Public smoke: `DECKD_QA_URL=https://deckd-app.roxai.click node qa/deckd-visual-qa.cjs` passed Home → setup → Deal 2 each → table → ten-card draw → `PASS TURN` → pass veil. `qa/deckd-rules-replay-qa.cjs` also passed setup/live rules, end state, replay, and 48px sheet action bounds. Both scripts reported required flags true and `errors: []`.
- Public setup scroll probe reported `tokenCount: 5` and `tokensAboveDock: true`; asset cache-busting is available through `DECKD_QA_CACHEBUST` for CDN previews.
- Public geometry probe passed at 375×812 and 1440×900: document/body scroll widths matched each viewport, visible nav/deal controls stayed in bounds, and console/page errors were empty. The fresh public run served deployed bundle `entry-fcc97988da5b703e58d6cbfb5940e178.js`.
- `qa/deckd-visual-qa.cjs` now asserts the pass veil as well as setup, card, table, guidance, and browser-error checks.
- Public two-client relay proof passed with `qa/deckd-lobby-two-client.cjs`: independent 375×812 host + guest clients created/joined room `NN6H24`, both reported `Relay: connected` and `Players: 2`, both reached the synced table, and a host draw propagated to the guest (`47 LEFT`; guest saw the host's three-card opponent hand); errors were empty.
- Public online-blackjack proof passed with `qa/deckd-lobby-blackjack-qa.cjs` (Aug 10): host created a blackjack lobby, stuck, guest resumed and got TWIST/STICK/STAND, twisted via `game_action` (HAND 5 → 15), host saw the guest's third card, zero console errors. This is the first real E2E proof that guests can play blackjack online.
- Reduced-motion web proxy proof passed with `qa/deckd-responsive-reduced-motion-qa.cjs`: Playwright `prefers-reduced-motion: reduce` was true, Home → setup → table stayed at 375×812 with 44px+ controls and document/body scroll widths of 375; errors were empty. This is not native-device proof.
- Local browser proof for `TableSurface` passed at 375×812 and 1440×900: setup → Deal now → table → draw completed, document/body scroll widths matched the viewport, key controls stayed in bounds, and console/page errors were empty.
- Local post-fix visual proof passed at 375×812 and 1440×900: Home contrast remained healthy, setup/table stayed continuous, menu/deck controls remained in bounds, and page/body widths matched the viewport with no browser errors. Reduced-motion local proxy also passed at 375×812.
- Local/public free-library proof passed with `qa/deckd-library-qa.cjs`: 375×812 War → Go Fish → Old Maid → Crazy Eights → Sevens flows each exposed and executed a real action, retained turn/readout copy, stayed at document/body/root width 375, and reported no browser errors. `qa/deckd-desktop-qa.cjs` passed War at 1440×900 with stable root geometry and in-bounds Home/Profile/FLIP controls.
- Public Hold'em completion proof passed with `qa/deckd-poker-qa.cjs` against `entry-b22501971faac29052ff07470e658aa1.js`: 375×812 and 1440×900 heads-up CALL → CHECK → BURN → FLOP → CHECK×2 → BURN → TURN → CHECK×2 → BURN → RIVER → CHECK×2 → SHOWDOWN → winner banner, 15 actions, pot update, zero browser errors.
- Latest public two-client relay proof passed with `qa/deckd-lobby-two-client.cjs`: independent 375×812 host + guest clients created/joined a room, both reached the synced table, a host draw propagated to the guest, privacy mirror counts remained correct, and errors were empty. This is the live relay claim for this run; no native-device claim is made.

## Physical card-motion slice (2026-08-11)

- `HandFan` now gives every mounted card one deck-line arrival: opening cards keep the measured stagger, while later draws enter immediately and settle into the measured fan without replaying the opening batch.
- A new discard card now lands with a bounded translate/rotate/settle motion while retaining the existing pulse; reduced motion stays a plain fade/settle.
- Local Metro proof passed `qa/deckd-visual-qa.cjs` at 375×812 and `qa/deckd-desktop-qa.cjs` at 1440×900 with zero page/console errors, stable root geometry, no document overflow, and all setup/table/pass milestones true. Typecheck, lint, 117 Jest tests, and Expo Doctor 20/20 are green.
- Public preview now serves the new bundle with HTTP 200; visual QA passed at 375×812 and 1440×900, and the reduced-motion proxy stayed in bounds with `prefers-reduced-motion: true`, zero errors, and no horizontal overflow.

## Home continuity slice (2026-08-11, `2812e7d`)

- Replaced the home marketing stack (stats card, hero banner, store carousel, and Master promo) with a table-native deal surface: warm `TableSurface` stock, hairline table marker, canonical Deckd card-back deck object, sparse setup guidance, and a small shared-table host action.
- Home now recognizes an unfinished local table and offers a compact Resume slip with the recipe name, seat count, and turn count. The existing single progress timeline still gates Home controls during the Home → Hub morph, and the first-run hint dismisses on the deck action.
- Local exact viewport proof passed at 375×812 and 1440×900; public preview serves `entry-972c442e96ac34b4d78fa5a2f8786089.js` with HTTP 200. Public responsive/reduced-motion, desktop, and full visual QA all passed with zero page/console errors, no overflow, and in-bounds controls.

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
