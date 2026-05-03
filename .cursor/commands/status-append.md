---
description: Append a well-formed entry to STATUS.md and optionally bubble up any unresolved followups.
---

# /status-append

Keep `STATUS.md` as the project's running memory. Use at the end of any task that produced a real change.

## Steps

1. Look at `git status` + `git diff --stat` to see what actually changed.
2. Propose a one-line entry in the format:
   ```
   YYYY-MM-DD | <area> | <change> | <followups or —>
   ```
   - `<area>` — one of: `cursor-env`, `nav`, `gameboard`, `pass`, `home`, `ble`, `theme`, `store`, `types`, `build`, `deps`, `docs`.
   - `<change>` — past-tense, active voice, ≤ 10 words.
   - `<followups>` — terse notes if there is an obvious unblocked next step, or `—`.
3. Show the user the proposed line. Confirm before writing.
4. Insert at the top of the `## Change log` section (newest first).
5. If the followups field is not `—`, also append a bullet to the "Immediate high-leverage tasks" section **only if** this task uncovered a new one or completed an existing one (strike it through or remove it).

## Examples

```
2026-04-17 | theme     | Created src/lib/theme.ts + migrated home screen | Migrate pass.tsx + gameboard next
2026-04-17 | ble       | Documented peripheral-mode decision (option D — BLE handoff + LAN) | Prototype handoff exchange
2026-04-17 | nav       | Deleted (tabs) group, flattened to root Stack | Verify GlobalNavBar active-path logic on real device
```

## Do not

- Write multiple entries per invocation (one line per task).
- Invent an area not in the list above — extend the list in `AGENTS.md` first.
- Use first-person voice ("I extracted..."). Use declarative past tense.
