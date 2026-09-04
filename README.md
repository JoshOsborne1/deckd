# Deckd

Status: supporting project overview. Canonical current brief: `CURRENT.md`.


Deckd is an Expo/React Native card-table app. The v1 target is deliberately narrow: **a polished pass-and-play card table on one phone, plus multiplayer lobbies hosted by a Deckd Master**. BLE nearby multiplayer is dropped from the first build. Rive, custom rules, and real IAP configuration are parked until the core loop feels good.

## Current status

- Expo SDK 57, React Native 0.86, React 19, TypeScript strict.
- Expo Router app with a layered main surface: `home | hub | table | lobby | pass`.
- Zustand + MMKV local state.
- Event-sourced game engine.
- Pass-and-play flow, privacy veil, hand fan/stack, draw/discard/flip/pass-turn interactions.
- Multiplayer lobbies are the paid feature: a Deckd Master pass is required to host, guests join free. Passes: Deal (24h), Draw (3d), Shuffle (30d), Master (lifetime).
- Native BLE scaffold exists in the repo but is **not** a v1 dependency and must not be marketed as working.

## Setup

```bash
npm install
npm run check
```

## Live desktop development

```bash
npm run dev:web
```

This starts Expo Web on port `8081`. Open the printed localhost URL in the desktop browser. Use this for fast UI/layout iteration with Cursor Composer.

## Phone testing

For UI-only work, try the LAN QR from:

```bash
npm run dev
```

This runs on port `8082` so `npm run dev:web` can keep desktop web alive on `8081`.

For native dev-client work, Expo Go is not enough. Use:

```bash
npm run dev:phone
npm run build:android-dev   # Android dev client when needed
npm run build:ios-dev       # iOS dev client when needed
```

If LAN QR fails from WSL/Windows networking, use:

```bash
npm run dev:tunnel
```

## Quality gates

Run before handoff:

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## Project map

- `app/` — route screens and root layout.
- `components/` — reusable UI and layered game surfaces.
- `src/engine/` — framework-free card/game engine.
- `src/store/` — zustand stores.
- `lib/` — BLE (parked), storage, IAP, transport helpers.
- `modules/deckd-ble/` — native BLE scaffold. Leave it alone unless explicitly working on BLE proof.
- `docs/` — current project scope and workflow only.

Read `docs/MVP_SCOPE.md` and `docs/ITERATION_WORKFLOW.md` before changing product direction.
