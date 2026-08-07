# Deckd status

Last cleanup: 2026-06-22.

## Current baseline

The current source was promoted from the latest `deckdherm` snapshot into the root repo. Historical markdown, Cursor command packs, old audit plans, Rive plans, and broad monetization notes were removed.

## Cleanup results

- Root project is now the latest usable Deckd source, not the stale GitHub clone plus nested bundle.
- Markdown reduced to the current essentials only:
  - `README.md`
  - `AGENTS.md`
  - `STATUS.md`
  - `.cursor/context.md`
  - `docs/MVP_SCOPE.md`
  - `docs/ITERATION_WORKFLOW.md`
  - `docs/PARKED_BLE.md`
- `.cursor` was reduced to a compact context file and one always-on rule.
- Added CI at `.github/workflows/ci.yml`.
- Added ready scripts for simultaneous desktop and phone iteration:
  - `npm run dev:web` on port `8081`
  - `npm run dev` / `npm run dev:phone` on port `8082`
  - `npm run check`

## Verification

After cleanup:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx expo-doctor` passed 18/18 checks.
- `npm run dev:web` served `http://localhost:8081` with HTTP 200 and title `Deckd`.
- `npm run dev:phone` served `http://localhost:8082` with HTTP 200.

Security note: `npm audit fix` removed the easy fixes. Remaining audit warnings require breaking upgrades to React Native 0.86 / Expo 56, so they are parked until an intentional SDK upgrade.

## Product decision

V1 is pass-and-play. BLE, Rive, real IAP, custom rules DSL, and paid acquisition are parked until the one-phone card table is good.

## Immediate next actions

1. Rebuild `components/layers/TableLayer.tsx` into a real table surface.
2. Simplify `components/layers/HubLayer.tsx` into deck staging.
3. Split real menu/history flows.
4. Polish `components/PrivacyVeil.tsx` and pass ritual.
5. Keep desktop web and phone testing running during design iteration.

## Parked tracks

- BLE proof matrix and diagnostics.
- Rive animation runtime/assets.
- RevenueCat/IAP.
- Custom rules DSL and full custom game authoring.
