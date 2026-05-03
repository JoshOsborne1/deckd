---
description: Run typecheck, lint (if configured), expo-doctor, and append a STATUS.md entry summarizing the current change.
---

# /ship-check

Use before handing a change back to the user or opening a PR. Does the minimum that separates "I think it works" from "verified clean."

## Steps

1. Run `npm run typecheck`. If it fails, stop and report errors — do not proceed.
2. Run `npm run lint` if an ESLint config exists (`.eslintrc*` or `eslint.config.*`). If it doesn't, skip and note that lint is not yet configured.
3. Run `npx expo-doctor`. Surface any warnings verbatim; do not auto-fix unless trivially obvious and scoped.
4. Look at `git status` and summarize the changed files in one paragraph.
5. Propose a one-line `STATUS.md` entry in the format `YYYY-MM-DD | area | change | followups` and append it (confirm with the user first if the change is significant).
6. Remind the user of anything that still needs device verification (BLE, haptics, audio, native config).

## Output format

Return a short report:

```
✔ typecheck — OK
✔ lint — OK | ⚠ skipped (no config)
⚠ expo-doctor — 1 warning: react-native-ble-plx peer expects ...
Changed: app/game/index.tsx, components/PlayingCard.tsx
Proposed STATUS entry: 2026-04-17 | gameboard | extracted <PlayingCard> | device test on iOS hand-fan animation
Device verification needed: no (no native surface touched)
```
