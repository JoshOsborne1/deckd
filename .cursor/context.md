# Deckd — quick orientation

**This file is a pointer. For actual operating guidance, read `AGENTS.md` at the repo root.**

## 30-second briefing

- Expo SDK 54 + RN 0.81 + TypeScript strict. Managed workflow.
- Routing: expo-router 6 (file-based, `app/`).
- State: zustand + MMKV (via `lib/storage.ts`) + SecureStore.
- Animation: Reanimated 4 + Gesture Handler.
- BLE: `react-native-ble-plx` — **central only; host mode is not implemented**.
- Design: crimson `#B02020` on off-white `#FAFAFA`; Plus Jakarta Sans (bundled, not yet loaded).

## Where to look

| Need | Go to |
|---|---|
| Operating manual for agents | `AGENTS.md` |
| Always-on project rules | `.cursor/rules/deckd.mdc` |
| Scoped rules (router / BLE / theme / reanimated) | `.cursor/rules/*.mdc` |
| Project skills | `.cursor/skills/*/SKILL.md` |
| Slash commands | `.cursor/commands/*.md` |
| Current state + followups | `STATUS.md` |
| Cursor 3 features cheatsheet | `CURSOR_FEATURES.md` |
| Product design scope (home + nav) | `design/HOME-NAV-PROMPT.md` |
| Growth / monetization plan | `MONETIZATION.md` |

## Hard rules (the short list)

1. Don't invent a BLE host implementation — read `ble-realtalk` skill first.
2. Don't proliferate hex literals — use the theme.
3. Don't edit `ios/` or `android/` — managed workflow, changes go through `app.json`.
4. Update `STATUS.md` after meaningful changes.
5. Ask before adding a dependency, new state library, or new styling system.
