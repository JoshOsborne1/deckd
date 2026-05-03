---
description: Migrate hex color literals in a single file to `@theme` tokens. Usage, `/theme-migrate <file>`.
---

# /theme-migrate

Pull hex literals and magic spacing values in one file into the shared theme module. One file at a time — small, reviewable.

## Prereq

- If `src/lib/theme.ts` does not exist, create it from `.cursor/skills/deckd-theme-tokens/SKILL.md`.
- If the `@theme` path alias is not wired, use a relative import until it is (`../../src/lib/theme`).

## Steps

1. Read the target file.
2. List every hex literal, rgba string, and recurring magic number (radii 6/12/16/24, spacing 4/8/12/16/20/24/32).
3. Map each to its token:
   - `#B02020` → `colors.brand`
   - `#FAFAFA` → `colors.bg`
   - `#1A1A1A` → `colors.ink`
   - `#666`    → `colors.inkMuted`
   - `#999`    → `colors.inkSubtle`
   - `#EAEAEA` → `colors.borderStrong`
   - `#F0F0F0` → `colors.border`
   - …
4. Any literal with no matching token: **do not invent a name**. Keep it inline, add a comment `// TODO(theme): promote when used in 3+ files`, and mention it in the output so we can decide whether to add the token later.
5. Replace in `StyleSheet.create` only. Do not touch business logic, JSX, or comments unrelated to styling.
6. Run `npm run typecheck`. Fix any misspelled token names.
7. Visually diff the screen on `npm run web` — output must be pixel-identical.
8. Append a one-line `STATUS.md` entry: `YYYY-MM-DD | theme | migrated <file> to tokens | —`.

## Do not

- Do not migrate more than one file per invocation.
- Do not rename tokens mid-migration.
- Do not change font sizes to tokens — that's a separate decision pending 3+ call-site overlap.
- Do not touch the `.cursor/rules/` or `.cursor/skills/` files.
