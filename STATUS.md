# Deckd status

Last update: 2026-08-08.

## Current baseline

Expo SDK 57, React Native 0.86, React 19, TypeScript strict. Expo Router app with layered surfaces: `home | hub | table | lobby | pass`. Zustand + MMKV local state. Event-sourced game engine. Pass-and-play flow with privacy veil, hand fan/stack, draw/discard/flip/pass-turn.

## Product direction (2026-08-08)

- BLE multiplayer is **dropped from the first build**. The native scaffold stays in the repo but is not a v1 dependency and must not be marketed.
- Multiplayer lobbies are the paid feature: a **Deckd Master** pass is required to host; guests join free.
- Pass tiers (verb-named): **Deal** 24h, **Draw** 3d, **Shuffle** 30d, **Master** lifetime.
- Store copy and product naming updated from "Deckd+" to "Deckd Master" (app/store.tsx, HomeLayer.tsx).

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx expo-doctor` passed 18/18 checks.
- `npm run dev:web` served `http://localhost:8081` with HTTP 200 and title `Deckd`.
- `npm run dev:phone` served `http://localhost:8082` with HTTP 200.

Security note: `npm audit fix` removed the easy fixes. Remaining audit warnings require breaking upgrades to React Native 0.86 / Expo 56, so they are parked until an intentional SDK upgrade.

## Immediate next actions

1. Rebuild `components/layers/TableLayer.tsx` into a real table surface.
2. Simplify `components/layers/HubLayer.tsx` into deck staging.
3. Split real menu/history flows.
4. Polish `components/PrivacyVeil.tsx` and pass ritual.
5. Spec the lobby relay server (host = source of truth, join codes, turn relay).
6. Keep desktop web and phone testing running during design iteration.

## Parked tracks

- BLE proof matrix and diagnostics (dropped from v1 scope).
- Rive animation runtime/assets.
- RevenueCat/IAP configuration (keys, App Store products, offering setup).
- Custom rules DSL and full custom game authoring.
