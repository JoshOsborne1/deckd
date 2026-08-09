# Deckd status

Last update: 2026-08-09 (LOOP visual pass).

## Deployment

- Landing page live at https://deckd.roxai.click (PM2 `deckd-landing` on 127.0.0.1:8084, router route `deckd-landing`, wildcard tunnel already covered it). Hero verified over HTTPS. Static server: `landing/serve.mjs`.
- Relay at https://relay.roxai.click (PM2 `deckd-relay`, route `deckd-relay`, port 8083).

## Current baseline

Expo SDK 57, React Native 0.86, React 19, TypeScript strict. Expo Router app with layered surfaces: `home | hub | table | lobby | pass`. Zustand + MMKV local state. Event-sourced game engine. Pass-and-play flow with privacy veil, hand fan/stack, draw/discard/flip/pass-turn. **Multiplayer game-state sync over relay (T2): host broadcasts engine events, guests fold them; guest hands stay private; pass & play inert.**

## Product direction (2026-08-08)

- BLE multiplayer is **dropped from the first build**. The native scaffold stays in the repo but is not a v1 dependency and must not be marketed.
- Multiplayer lobbies are the paid feature: a **Deckd Master** pass is required to host; guests join free.
- Pass tiers (verb-named): **Deal** 24h, **Draw** 3d, **Shuffle** 30d, **Master** lifetime.
- Store copy and product naming updated from "Deckd+" to "Deckd Master" (app/store.tsx, HomeLayer.tsx).

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed (0 errors, 0 warnings).
- `npx jest` passed 62/62 tests (engine, lobby, sync, multiplayer, and entitlement suites).
- Bridge integration: host broadcasts session-start + deal events; guest folds them and mirrors host state (draw pile count, players, phase); guest draw_card intent → host applies + broadcasts; card moves propagate to guest discard; pass & play with no relay stays inert.
- Guest privacy: guest sees own hand via viewerId-based selectors; host hand zone is private to host-cid (verified via selectLocalHand).
- T3 visual lift: SVG French suit glyphs, classic pip layouts, warm paper/grain card faces, court/ace frames, gold card-back inset, one-shot home mascot, deal-entry stagger, and draw/discard feedback are implemented.
- LOOP visual pass: home nav is shrink-safe at phone widths with the center Deckd logo isolated from static suit particles; the default ivory table and the alternate formerly-green felt theme now stay in the warm-white/crimson language.
- T9 motion polish: session-start keyed deck-origin deal stagger, 0.96 draw press spring, 1.05 discard pulse, reduced-motion-safe mascot intro, and sliding pass veil are implemented.
- Mobile action rail polish: shuffle/history/end controls retain 44px targets, and the pass CTA is shrink-safe inside the 320–375px content width instead of clipping at the edges.
- Setup material pass: the Hub options rail now uses the same warm ivory rule surface as the table instead of a generic white card; nav corner-suit decoration was removed so the center control stays focused on the Deckd logo.
- Pass ritual material pass: the privacy veil now keeps the warm ivory stock, restrained crimson rules, and table rail/well atmosphere behind the hold-to-reveal step instead of switching to a flat white page.
- Web QA: the exported public preview was exercised at 375×812 through home → setup → Deal 2 each → dealt table → pass veil. Nav, Hub CTA, and all four table action children stayed inside the viewport; browser console/page errors were empty.
- Preview deployment: `app-serve` was rebuilt from the current export and PM2 `deckd-app` restarted; `https://deckd-app.roxai.click/` returned the current web bundle and passed the same 375px interaction script.

Security note: `npm audit fix` removed the easy fixes. Remaining audit warnings require breaking upgrades to React Native 0.86 / Expo 56, so they are parked until an intentional SDK upgrade.

## Immediate next actions

1. Run a real device touch/safe-area pass on the native build.
2. Complete the real 2-device lobby test against the deployed relay.
3. Split real menu/history flows behind the existing table actions.
4. Keep the pass veil and table surface polish aligned while native feedback lands.
5. ~~Wire the real HMAC masterToken (Deckd Master entitlement) into `hostLobby`.~~ Done (T4): `lib/entitlement.ts` mints `HMAC-SHA256(secret, clientId)` from `EXPO_PUBLIC_DECKD_MASTER_SECRET`; `lobbyStore.hostLobby` sends it; `app/_layout.tsx` installs a RevenueCat customer-info listener mapping the `master` entitlement to `hasMasterPass`.
6. Keep desktop web and phone testing running during design iteration.

## Parked tracks

- BLE proof matrix and diagnostics (dropped from v1 scope).
- Rive animation runtime/assets.
- RevenueCat/IAP configuration (keys, App Store products, offering setup).
- Custom rules DSL and full custom game authoring.
