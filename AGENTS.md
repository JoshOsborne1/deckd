# Deckd agent guide

## Product rule

Build the v1 app around pass-and-play first. Do not expand scope unless Josh explicitly asks.

V1 is:

- one-phone pass-and-play
- 2 to 6 players
- standard deck plus optional jokers
- draw, discard/play, flip/reveal, reorder, pass turn, reset/end
- strong table, hub, nav, and pass ritual UI
- local profile and local cosmetics

V1 is not:

- BLE multiplayer
- custom rules DSL
- Rive runtime
- real IAP/RevenueCat
- auth, analytics, social, cloud sync

## Source truth

- `docs/MVP_SCOPE.md` — what to build now.
- `docs/ITERATION_WORKFLOW.md` — how to use Cursor/GLM/Grok and test continuously.
- `STATUS.md` — current repo state and next actions.
- This file — agent rules.

## Code rules

- TypeScript strict. No `any` unless unavoidable and explained.
- Components live in `components/`, not `src/components/`.
- App routes live in `app/`.
- Game logic belongs in `src/engine/` and should stay framework-free.
- State belongs in `src/store/` with zustand + MMKV.
- No new state library, styling library, auth, analytics, i18n, or feature flags without explicit approval.
- No raw color sprawl. Use `src/lib/theme.ts` or add tokens there first.
- Do not hand-edit generated `ios/` or `android/` folders.
- Do not claim BLE works without a logged real-device matrix.

## Workflow

Before changes:

1. Check `git status --short`.
2. Read `STATUS.md` and the relevant doc in `docs/`.
3. For UI work, run `npm run dev:web` and keep the app visible.
4. For phone work, run `npm run dev` or `npm run dev:phone`.

After changes:

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

For meaningful work, update `STATUS.md` in one or two concise bullets. Do not re-create giant historical logs.

## Cursor guidance

Use Composer/Agent for small slices. Avoid massive repo-wide prompts. Good prompts name exact files, define the user-visible behavior, and end with the checks to run.

Preferred loop:

1. Edit one surface, usually `TableLayer`, `HubLayer`, `GlobalNavBar`, or `PrivacyVeil`.
2. Verify in desktop web.
3. Verify on phone for touch/safe-area/gesture feel.
4. Commit the slice.
