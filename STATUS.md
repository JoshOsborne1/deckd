# Deckd status

Last update: 2026-08-10 (LOOP relay verification slice).

## Deployment

- Landing page live at https://deckd.roxai.click (PM2 `deckd-landing` on 127.0.0.1:8084, router route `deckd-landing`, wildcard tunnel already covered it). Hero verified over HTTPS. Static server: `landing/serve.mjs`.
- App preview live at https://deckd-app.roxai.click (PM2 `deckd-app` on 127.0.0.1:8085, route `deckd-app`, static server: `app-serve/serve.mjs`).
- Relay live at https://relay.roxai.click (PM2 `deckd-relay`, route `deckd-relay`, port 8083).

## Current baseline

Expo SDK 57, React Native 0.86, React 19, TypeScript strict. Expo Router app with layered surfaces: `home | hub | table | lobby | pass`. Zustand + MMKV local state. Event-sourced game engine. Pass-and-play flow with privacy veil, hand fan/stack, draw/discard/flip/pass-turn. Multiplayer game-state sync over relay remains a separate paid-hosting path; pass-and-play stays inert without relay.

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
- **Motion and guidance:** setup/table remain a surface morph with physical card motion only; the opening hand staggers in while later drawn cards settle immediately into the measured fan, draw/discard press feedback remains, and the engine/table expose a single non-blocking next-useful-move suggestion while preserving alternate actions.
- **Preview mode:** store/lobby affordances retain their locked-looking monetization language but do not hard-block taps during testing.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed (0 errors, 0 warnings).
- `npx jest --runInBand` passed 7 suites / 71 tests.
- `npx expo-doctor` passed 20/20 checks.
- Public smoke: `DECKD_QA_URL=https://deckd-app.roxai.click node qa/deckd-visual-qa.cjs` passed Home → setup → Deal 2 each → table → ten-card draw → `PASS TURN` → pass veil. The script reported all required surface flags true and `errors: []`.
- Public setup scroll probe reported `tokenCount: 5` and `tokensAboveDock: true`; asset cache-busting is available through `DECKD_QA_CACHEBUST` for CDN previews.
- Public geometry probe passed at 375×812 and 1440×900: document/body scroll widths matched each viewport, visible nav/deal controls stayed in bounds, and console/page errors were empty. The fresh public run served the deployed current bundle.
- `qa/deckd-visual-qa.cjs` now asserts the pass veil as well as setup, card, table, guidance, and browser-error checks.
- Public two-client relay proof passed with `qa/deckd-lobby-two-client.cjs`: independent 375×812 host + guest clients created/joined room `D6R3PV`, both reported `Relay: connected` and `Players: 2`, both reached the synced table, and a host draw propagated to the guest (`47 LEFT`; guest saw the host's three-card opponent hand); errors were empty.
- Reduced-motion web proxy proof passed with `qa/deckd-responsive-reduced-motion-qa.cjs`: Playwright `prefers-reduced-motion: reduce` was true, Home → setup → table stayed at 375×812 with 44px+ controls and document/body scroll widths of 375; errors were empty. This is not native-device proof.

## Decisions

- Setup/table remain a single-surface morph with physical card motion; no route-wide rotateY/page-turn transition was added because the brief rejects page-like handoffs.
- Preview mode stays usable without RevenueCat products or keys; entitlement/product setup is not faked.
- Lobby relay sessions intentionally survive the mounted layer changing from lobby → hub/table; the explicit Home action remains the leave path. This is required for a host to keep broadcasting after setup.
- No native touch or physical two-device claim is made until those flows are exercised on the actual targets; this machine currently has no ADB device or emulator, while the live iPhone is not remotely automatable from this host.

## Immediate next actions

1. Run a native device touch/safe-area/reduced-motion pass.
2. Complete the real 2-device lobby test against the deployed relay.
3. Keep RevenueCat product/key work, Rive, and broader game-library expansion behind the gameplay-first priority.

## Parked tracks

- BLE proof matrix and diagnostics (dropped from v1 scope).
- Rive animation runtime/assets.
- RevenueCat/IAP configuration (keys, App Store products, offering setup).
- Custom rules DSL and full custom game authoring.
