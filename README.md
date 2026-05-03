# Deckd

Expo (React Native) app using Expo Router.

## Tech stack

- Expo SDK 54, React Native 0.81
- expo-router, react-native-reanimated, react-native-ble-plx (native / dev build when used)
- TypeScript

## Layout

- `app/` — routes (`index`, `game`, `pass`, `store`, `games`, `profile`, …)
- `src/components/` — shared UI
- `src/lib/theme.ts` — spacing / default colors for wiring (edit freely)
- `lib/` — app utilities (assets, storage, BLE stubs)

## Run

```bash
npm install
npm start
```

Use `npm run ios`, `npm run android`, or `npm run web` as needed.

## Product note

Home + global bottom navigation intent is described in `design/HOME-NAV-PROMPT.md` only.
