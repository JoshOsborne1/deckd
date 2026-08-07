# Deckd

Deckd is an Expo/React Native card-table app. The v1 target is deliberately narrow: **a polished pass-and-play card table on one phone**. BLE nearby multiplayer, custom rules, Rive, and real IAP are parked until the core loop feels good.

## Current status

- Expo SDK 54, React Native 0.81, React 19, TypeScript strict.
- Expo Router app with a layered main surface: `home | hub | table | lobby | pass`.
- Zustand + MMKV local state.
- Event-sourced game engine.
- Pass-and-play flow, privacy veil, hand fan/stack, draw/discard/flip/pass-turn interactions.
- Native BLE scaffold exists, but BLE multiplayer is **not a v1 dependency** and must not be marketed as working until real-device proof exists.

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

For native BLE/dev-client work, Expo Go is not enough. Use:

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
- `lib/` — BLE, storage, IAP, transport helpers.
- `modules/deckd-ble/` — native BLE scaffold. Leave it alone unless explicitly working on BLE proof.
- `docs/` — current project scope and workflow only.

Read `docs/MVP_SCOPE.md` and `docs/ITERATION_WORKFLOW.md` before changing product direction.
