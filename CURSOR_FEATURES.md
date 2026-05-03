# Cursor 3 features — cheatsheet for Deckd

A working reference for the features you actually want to use day-to-day. Grouped by "what problem does it solve?" — not by menu location. Windows-first shortcuts where relevant (replace `Ctrl` with `Cmd` on macOS).

> **TL;DR priority list** if you only adopt five things this week:
> 1. **Plan Mode** (`Shift+Tab`) for any change touching >1 file.
> 2. **AGENTS.md + `.cursor/rules/*.mdc`** — already installed; keep them updated.
> 3. **Custom slash commands** — `/ship-check`, `/new-screen`, `/new-store`, `/ble-audit`, `/theme-migrate`, `/status-append`.
> 4. **Background Agents** for mechanical refactors; **Cloud Agents** for research spikes.
> 5. **Auto-run allowlist** — stop confirming `npm run typecheck` forever.

---

## 1. Modes — the right tool per situation

| Mode | Shortcut | What it does | Use for |
|---|---|---|---|
| **Ask** | `Ctrl+L` then Ask toggle | Read-only chat with codebase context. No file writes. | "How does `GlobalNavBar` decide active state?" |
| **Agent** | `Ctrl+I` (default) | Full write access, runs tools, edits files. | Scoped implementation after plan is approved. |
| **Plan Mode** | `Shift+Tab` inside Agent | Agent gathers context + drafts a plan **before** writing code. You approve, then it executes. | Anything touching nav, BLE, state, or >3 files. |
| **Debug Mode** | Auto / explicit | Agent runs commands + reads output to troubleshoot. | Bugs that need runtime evidence, not just reading. |
| **Background Agent** | `Ctrl+E` (or Agent → Background) | Spawns a parallel agent that works while you keep coding. Returns a diff when done. | Mechanical refactors: "migrate all hex literals in `app/(tabs)/` to `@theme`." |
| **Cloud Agent** | Cloud Agents panel | Runs in Cursor's cloud, can operate on the repo remotely (incl. from phone). | Research spikes, long-running investigations, overnight tasks. |
| **Bugbot** | GitHub integration | Reviews PRs automatically in the browser. | Set up later when you're shipping through PRs. |

### Workflow: how to use Plan Mode

1. `Ctrl+I` → Composer opens.
2. `Shift+Tab` → switches to Plan Mode (top-left indicator changes).
3. Write the task. Attach files with `@`. Attach screenshots if UI.
4. Agent reads context, asks clarifying questions if needed, and produces a structured plan (steps + files + risks).
5. Review, edit, or approve. Switch back to Agent Mode (`Shift+Tab`) to execute.

### Workflow: Background Agent for mechanical work

Perfect first use-case for Deckd: **"Create `src/lib/theme.ts` from `.cursor/skills/deckd-theme-tokens/SKILL.md`, then migrate color literals in `app/(tabs)/index.tsx` only."** Fire it, keep working on gameboard, review the diff when you come back.

---

## 2. Context pills — `@` is the superpower

| Pill | What it does | Deckd tip |
|---|---|---|
| `@file <path>` | Pins one file to context. | Always pin `app/_layout.tsx` when touching nav. |
| `@folder <path>` | Pins a folder tree. | `@folder app` is fine. **Never** `@folder .` — sweeps `node_modules`. |
| `@codebase` | Uses full repo semantic index. | Good for "where is X used" — heavy; avoid for small tasks. |
| `@recent` | Recently edited files. | Resume after a break. |
| `@git` | Git diff / PR / branch state. | "Explain what my last commit changed." |
| `@docs <name>` | Indexed third-party docs. | Add Expo / React Native / ble-plx / zustand to your indexed docs once, reuse forever. |
| `@web <query>` | Live web search in-chat. | Dep/version questions when the skill triggers it. |
| `@cursor-rules` | Shows which rules are active in this chat. | Sanity-check before a big task. |
| `@link <url>` | Fetches and attaches a URL's content. | Paste a GitHub issue or MDN page. |
| Screenshot / image | Drag-drop into chat. | UI implementation — vision model extracts colors + spacing accurately. |

### Docs worth indexing (Cursor Settings → Features → Docs → Add)

- `https://docs.expo.dev/` — Expo SDK 54 reference
- `https://reactnative.dev/docs/0.81/` — RN 0.81
- `https://docs.swmansion.com/react-native-reanimated/` — Reanimated 4
- `https://docs.swmansion.com/react-native-gesture-handler/` — Gesture Handler
- `https://dotintent.github.io/react-native-ble-plx/` — ble-plx (important: read the peripheral note)
- `https://zustand.docs.pmnd.rs/` — zustand v5
- `https://github.com/mrousavy/react-native-mmkv` — MMKV v4

---

## 3. Project memory — the files Cursor reads automatically

All of these are **already set up in this project** after the env pass:

| File | Role | When agents read it |
|---|---|---|
| `AGENTS.md` | Operator manual for any agent | At the start of most sessions |
| `.cursor/rules/deckd.mdc` | Always-on project rules | Every prompt |
| `.cursor/rules/*.mdc` (scoped) | Rules that auto-apply when matching files are touched | On-demand |
| `.cursor/skills/*/SKILL.md` | Domain playbooks the agent reads when relevant | When their trigger matches |
| `.cursor/commands/*.md` | Custom slash commands | When user types `/` |
| `.cursor/context.md` | Quick-glance orientation | Small and cheap — often read first |
| `STATUS.md` | Running change log / memory | At the start of any task |
| `README.md` | Public-facing project intro | Less critical to agents; still read |
| `.cursor/hooks.json` | Event hooks (opt-in) | Automatically on events — currently disabled |

### Rule frontmatter format

```md
---
description: short description of when this rule applies
alwaysApply: true                      # applies to every prompt
globs:                                 # OR: applies when these files are touched
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
---
```

Only one of `alwaysApply: true` or `globs:` per rule. Keep rules short — if they exceed ~200 lines, split into a skill instead.

### Skill vs rule — quick decision

- **Rule** = constraint. "Never write X. Always import Y from Z."
- **Skill** = procedure / body of knowledge. "How to migrate hex literals. How to scaffold a store. Why peripheral mode is broken."

Rules are declarative; skills are instructional.

---

## 4. Custom slash commands

This project ships with 6 commands under `.cursor/commands/`:

| Command | Purpose |
|---|---|
| `/ship-check` | Typecheck + lint + expo-doctor + STATUS entry. Run before every handoff. |
| `/new-screen <name> [--flow <flow>]` | Scaffold a screen with theme + safe-area boilerplate. |
| `/new-store <name> [--persist]` | Scaffold a zustand store with optional MMKV persistence. |
| `/ble-audit` | Read-only audit of BLE safety rules. |
| `/theme-migrate <file>` | Migrate hex literals in one file to `@theme`. |
| `/status-append` | Append a well-formed entry to `STATUS.md`. |

Use `/` in any chat to list them. You can add more at any time — just drop a new markdown file into `.cursor/commands/`.

---

## 5. Settings you should tune today

Open Cursor Settings (`Ctrl+,`) and walk through these:

### Models

- **Agent default:** Claude Opus 4.7 or GPT-5.4 Codex for planning and complex refactors.
- **Fast default:** Composer 2 Fast for multi-file RN edits — it's tuned for this exact shape.
- **Cmd+K / inline:** Composer 2 or Composer 2 Fast. Keep inline edits on a fast model.
- **Tab completion:** Enable. React Native JSX + `StyleSheet.create` autocomplete is genuinely good.

### Auto-run (YOLO) allowlist

Let these run without confirmation:

```
npm run typecheck
npm run lint
npm run web
npx expo install *
npx expo-doctor
git status
git diff *
git log *
node -e *
npx tsc --noEmit *
```

Keep **denied** (or leave as default-confirm):

```
npm install *            ← prefer expo install for SDK-pinned deps
expo prebuild *
eas build *
eas submit *
git commit *
git push *
git reset --hard *
rm -rf *
```

### Features

- **Codebase indexing:** ON. Re-index after large refactors.
- **Privacy mode:** your call — off gives you better models; on keeps prompts out of training.
- **MCP servers:** already populated in your setup (`cursor-ide-browser`, Figma, HF, BrowserStack). You don't need project-level MCP on top.
- **Notifications:** ON for Background Agent / Cloud Agent completion — the whole point is fire-and-return.

### Keyboard — memorize these

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Inline edit at cursor |
| `Ctrl+I` | Open Composer (Agent mode) |
| `Ctrl+L` | Open chat |
| `Shift+Tab` (in Composer) | Toggle Plan ↔ Agent |
| `Ctrl+E` | Background agent |
| `Ctrl+Shift+L` | New chat tab |
| `Ctrl+P` | File picker (doubles as @-file) |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+/` | Comment toggle |
| `Ctrl+.` | Quick fix / code action |
| `F12` | Go to definition |
| `Alt+F12` | Peek definition |
| `Shift+F12` | Find references |
| `Ctrl+Shift+F` | Search in repo |
| `Ctrl+Shift+B` | Toggle sidebar |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+\`` | Restore checkpoint (undo an agent turn) |

---

## 6. Cursor 3 features you're probably not using yet

### a. Checkpoints / time-travel
Every agent turn creates a checkpoint. You can roll back the whole workspace to any prior turn with one click (sidebar → chat history → "Restore"). Means you can **let the agent try risky refactors** and bail cheaply.

### b. Multi-file diff review
After an agent turn, the diff UI shows every changed file in a tabbed panel. You can accept/reject file-by-file or even hunk-by-hunk — you do not have to accept the whole turn or nothing.

### c. Canvases (`.canvas.tsx`)
For analytical artifacts — data explorations, planning dashboards, visualizations — Cursor renders live React canvases next to the chat. Not a fit for app code, but perfect for a **"Deckd growth dashboard"** that pulls from your ad spend / retention CSVs.

### d. Agent attach + screenshots
Drag-drop an image into Composer. The model reads pixel colors and layout. For this project: paste the Figma home mock and ask the agent to compare against `app/(tabs)/index.tsx` — it will tell you where the implementation drifts.

### e. MCP (Model Context Protocol) servers
You already have good ones configured globally (`cursor-ide-browser`, Figma, HF Skills, BrowserStack). High-value workflows to try:

- **Figma MCP:** paste a frame URL → agent generates a React Native component. Use `figma-implement-design` skill.
- **`cursor-ide-browser`:** the agent can open `npm run web`, take screenshots, and iterate visually. Perfect for UI polish.
- **BrowserStack:** once you have a build, run mobile tests on real devices from an agent.

### f. Cloud Agents from your phone
Install the Cursor mobile app → kick off a Cloud Agent from anywhere ("research BLE peripheral libraries for Expo managed workflow, produce a 1-pager"). It runs on a cloud machine with the repo cloned and messages back when done.

### g. Bugbot for PRs
When you start using PRs, enable Bugbot on the repo — it reviews every PR with a senior-dev pass, catches obvious bugs and anti-patterns, and posts inline comments.

### h. Agent teams / subagent delegation
For very large tasks (full screen implementation from a Figma spec), Agent can delegate to specialized subagents — an `explore` agent to map context, an implementation agent to write code, a reviewer. You don't invoke these manually; Agent chooses when.

### i. Hooks (`.cursor/hooks.json`)
Run commands automatically on events (`afterFileEdit`, `beforeShellExecute`, `afterAgentTurn`, etc.). Project has `.cursor/hooks.json` scaffolded with **disabled** examples — enable one at a time when you want them.

### j. Statusline customization
Put session context above the prompt (current model, token usage, git branch, STATUS.md last entry). Small but addictive. See `C:\Users\JT_Os\.cursor\skills-cursor\statusline\SKILL.md` in your global skills.

### k. Skill installer
`C:\Users\JT_Os\.cursor\skills\skill-installer\SKILL.md` — one-shot install community skills into your global skills folder. Handy for trying new workflows without copy-pasting.

### l. Custom rule generator for design systems
`figma-create-design-system-rules` skill — point it at a Figma library and it generates `.cursor/rules/*.mdc` for your design system automatically. Relevant once your Figma becomes the source of truth.

---

## 7. Workflows tailored to this project

### Building out a new screen
1. `Ctrl+I` → Plan Mode.
2. `/new-screen settings` (or `--flow onboarding welcome`).
3. Attach Figma/screenshot if you have one.
4. Approve plan, let it execute.
5. `/ship-check`.
6. `/status-append`.

### Implementing a feature that touches BLE
1. Read / attach `.cursor/skills/ble-realtalk/SKILL.md`.
2. Plan Mode: **"Implement BLE room handshake using option D (BLE handoff + LAN). Do not touch peripheral-mode code."**
3. Agent proposes; you review; execute.
4. `/ble-audit`.
5. Verify on real device before any `STATUS.md` "done".

### Migrating to theme tokens
1. Background Agent: `/theme-migrate app/(tabs)/index.tsx`.
2. While it runs, keep building elsewhere.
3. Review the diff.
4. Repeat for next file. Do not batch the whole repo — reviewability matters.

### Research spikes (e.g. "which BLE peripheral option should we pick?")
1. Cloud Agent: paste the `ble-realtalk` skill's four options and ask for a detailed 1-pager with pros/cons, code snippets, deployment complexity, and a recommendation for Deckd's constraints.
2. Come back in 10 minutes. Decide. Commit the decision to `STATUS.md`.

### Pixel-polish an existing screen
1. Attach Figma screenshot + actual screen screenshot.
2. Composer: "Reconcile these two. Keep layout; fix spacing, color, and font-weight drift. Use `@theme` tokens."
3. Visual diff on `npm run web`.

### Debugging a hard bug
1. Switch to Debug Mode (or let Cursor propose it).
2. Agent will run commands, read logs, narrow the problem. Give it `@file` hints for relevant areas.
3. Keep the loop tight — each failed attempt should produce *new* evidence.

---

## 8. Pitfalls (early-stage specific)

- **Context overload.** On a scaffold, `@codebase` or `@folder .` bloats the prompt with empty `src/`, `hooks/`, `types/`, and worst of all `node_modules/` typings. Be specific.
- **Accepting a whole turn blindly.** Use file-by-file or hunk-by-hunk accept. Especially for `StyleSheet.create` blocks.
- **Letting the agent "improve" the navigation.** It'll rewrite `GlobalNavBar` or the `(tabs)` group every time without a plan. Use Plan Mode first.
- **Dep drift.** Never skip `npx expo install` for SDK-pinned packages — the `dependency-docs-research` skill enforces this but you have to let it run.
- **Stale STATUS.md.** If nobody updates it, agents stop trusting it. Update it consistently for 2 weeks — it becomes institutional memory.
- **Running `expo prebuild` casually.** It rewrites `ios/`/`android/`. Deny by default.

---

## 9. Quick reference — file locations

```
.cursor/
  rules/
    deckd.mdc                      ← always-on project rules
    expo-router.mdc                ← scoped: app/**, GlobalNavBar
    ble-safety.mdc                 ← scoped: lib/ble*.ts + BLE screens
    theme-tokens.mdc               ← scoped: app/**, components/**, src/**
    reanimated.mdc                 ← scoped: anywhere animation lives
  skills/
    dependency-docs-research/      ← forces doc lookup before dep changes (pre-existing)
    ble-realtalk/                  ← truth about peripheral mode
    deckd-theme-tokens/            ← token map + migration pattern
    expo-router-patterns/          ← nav model + scaffold
    card-rendering/                ← <PlayingCard> contract
  commands/
    ship-check.md
    new-screen.md
    new-store.md
    ble-audit.md
    theme-migrate.md
    status-append.md
  context.md                       ← quick-glance pointer
  hooks.json                       ← opt-in event hooks (disabled)

AGENTS.md                          ← operator manual
STATUS.md                          ← running memory
CURSOR_FEATURES.md                 ← this file
```

---

## 10. When to revisit this setup

Rules and skills should evolve with the product. Good triggers to update them:

- **New major feature area** (e.g. a real game engine under `src/engine/`) — add a scoped rule and probably a skill.
- **Framework upgrade** (Expo SDK 55, Reanimated 5) — update versions in `.cursor/rules/deckd.mdc` and the reanimated rule.
- **Architectural decision** (BLE option chosen) — update `.cursor/skills/ble-realtalk/SKILL.md` to reflect the commitment, and potentially rename it `ble-handshake` or `lan-transport` depending on the path taken.
- **Repeated agent mistakes** — if the agent keeps doing the same wrong thing, that's a missing rule. Add one.

The whole `.cursor/` tree is version-controlled; treat it like code.
