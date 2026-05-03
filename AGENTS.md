# Agent operating guide — Deckd

You are working on **Deckd**, a mobile card-game app (Expo SDK 54 + RN 0.81 + TypeScript strict). This file is the short operator's manual for agents (Cursor Composer, Background Agents, Cloud Agents, CLI). Read it before starting any non-trivial task.

## One-screen orientation

- **Product:** Mobile app for private card games, BLE-adjacent "pass-the-phone" multiplayer, no accounts. Crimson + off-white aesthetic, deck metaphor UI.
- **Stage:** Scaffold. Home, gameboard, and pass-phone screens are stubbed UI with hardcoded data. No real game state, no working BLE host mode yet.
- **USP:** BLE-local multiplayer. Implementation is **not real yet** — `react-native-ble-plx` is GATT-central-only. See `.cursor/skills/ble-realtalk/SKILL.md`.
- **Growth plan:** `MONETIZATION.md` — ship fast, ad-test, scale winners.
- **Design scope:** `design/HOME-NAV-PROMPT.md` describes only the home + global nav. Other screens have no design brief yet.

## Before starting any task

1. Read `.cursor/rules/deckd.mdc` (always applies) and any scoped rule matching the files you'll touch.
2. Read the last 10 entries in `STATUS.md` to avoid repeating work or undoing recent decisions.
3. For dependency changes: follow `.cursor/skills/dependency-docs-research/SKILL.md`. No guessed versions.
4. Confirm you're editing the **real** folder, not the empty `src/` placeholder (components live in `components/`, not `src/components/`).
5. If the task touches BLE, open `.cursor/skills/ble-realtalk/SKILL.md` first.

## Preferred workflows

| Situation | Mode | Why |
|---|---|---|
| "Explain X", "how does Y work" | **Ask mode** | No writes, cheap context. |
| Anything touching navigation, BLE, state architecture, or >3 files | **Plan mode** (Shift+Tab) | Surface decisions before code. |
| Scoped feature / refactor after a plan is approved | **Agent mode** | Default execution. |
| Multi-file mechanical refactor (migrate all hex literals to theme tokens, rename a symbol across the repo) | **Background Agent** | Runs in parallel while you keep working. |
| Open-ended research spike (BLE peripheral options, Reanimated perf questions) | **Cloud Agent** | Frees the local IDE entirely. |
| UI polish pass from a screenshot | **Composer with image attachment** | Vision models nail pixel values. |

## After any change

- Run `npm run typecheck`. It must pass.
- If you added or changed deps, run `npx expo-doctor` and confirm SDK-pinned versions.
- If you added or changed native config (`app.json`, plugins, permissions), note "needs prebuild" in `STATUS.md`.
- Append a one-line entry to `STATUS.md` in the format: `YYYY-MM-DD | area | change | followups`.
- Never run `git commit` / `git push` unless the user explicitly asks.
- Never run `expo prebuild`, `eas build`, or anything that writes into `ios/` / `android/` without explicit instruction.

## Auto-run allowlist (suggested Cursor setting)

Allow:
- `npm run typecheck`, `npm run lint`, `npm run web`
- `npx expo install <pkg>`, `npx expo-doctor`
- `git status`, `git diff`, `git log` (read-only)
- `node -e "..."` for quick scripts

Deny (require confirmation):
- `npm install` / `yarn add` with pinned versions (use `expo install`)
- `expo prebuild`, `eas build`, `eas submit`
- Anything that writes to `ios/`, `android/`, `.env*`
- `git commit`, `git push`, `git reset --hard`, `git clean`

## Hard limits

- Do NOT introduce a new state library beyond zustand + MMKV.
- Do NOT introduce a new styling system (NativeWind, styled-components, etc.).
- Do NOT claim BLE host mode works without a real-device verification note.
- Do NOT add dark mode, i18n, analytics, auth, or feature flags until requested.
- Do NOT refactor working UI screens unless the task asks for it.
- Do NOT commit external avatar CDN URLs — use `@assets/...` placeholders.

## Available project skills (read these when relevant)

- `.cursor/skills/dependency-docs-research/SKILL.md` — forces doc lookup before dep changes.
- `.cursor/skills/ble-realtalk/SKILL.md` — the truth about peripheral mode and what to propose instead.
- `.cursor/skills/deckd-theme-tokens/SKILL.md` — token map + migration pattern.
- `.cursor/skills/expo-router-patterns/SKILL.md` — how this app's nav actually works.
- `.cursor/skills/card-rendering/SKILL.md` — canonical `<PlayingCard>` contract.

## Available slash commands (`.cursor/commands/`)

- `/ship-check` — typecheck + lint + expo-doctor + STATUS append.
- `/new-screen <name>` — scaffold a new screen with theme + safe-area boilerplate.
- `/new-store <name>` — scaffold a zustand store persisted via MMKV.
- `/ble-audit` — audit BLE code for safety-rule violations.
- `/theme-migrate <file>` — pull hex literals into the theme module.

## Context-management tips

- Start with `@file app/_layout.tsx` + `@file components/GlobalNavBar.tsx` for any nav-adjacent task.
- For BLE work, include `@file lib/ble.ts` and the ble-realtalk skill — do not dump the whole `lib/`.
- For UI polish, attach a screenshot of the target design directly in chat — Composer's vision model matches colors and spacing far better than text.
- Avoid `@folder .` or `@codebase` in this repo at this stage — it sweeps in `node_modules` typings. Use targeted `@folder app`, `@folder components`, `@folder lib`.

## When in doubt

Ask. This is a scaffold and the owner is iterating fast — a one-line clarification now prevents a 200-line revert later.
