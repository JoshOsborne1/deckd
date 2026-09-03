# Deckd LOOP Runbook

> SUPERSEDED 2026-09-03: autonomous loop retired by Josh 2026-08-13; kept as history. Live brief is docs/CLEANUP_2026-09-03.md; continuous work runs via the deckd-cleanup cron job.

**STATUS: LOOP SHUT DOWN 2026-08-13 (Josh).** All loop crons removed; the
machinery described below is inert but fully documented for revival. See
`docs/HANDOFF_2026-08-13.md` for the shutdown snapshot.

How the autonomous Deckd loop works, what each piece does, what broke (and got
fixed) on 2026-08-09, and how to start/stop/repair it next time.

## What the loop IS

One persistent goal card on the kanban board, driven by a self-directed
"builder" worker. It re-plans every slice from the docs, implements, gates,
deploys to the live preview, and keeps going until it decides the standard is
met (completes with `STANDARD MET`). A watchdog cron keeps exactly ONE card
alive forever.

The loop is the *machine*. Josh's wishes flow in through
`docs/LOOP_DIRECTIVES.md`, which the worker MUST read first every run and which
WINS over every other doc.

## Components

| Piece | File | Role |
|---|---|---|
| Goal card body | `C:\Users\Wrekin\AppData\Local\hermes\scripts\deckd-loop-body.txt` | The worker's briefing: goal, spec order, how to work, gates, deploy |
| Watchdog | `C:\Users\Wrekin\AppData\Local\hermes\scripts\deckd-loop-watchdog.py` | Cron (every 30m, no_agent): keep exactly one active loop card; respawn when the card dies without `STANDARD MET` |
| Directives | `deckd\docs\LOOP_DIRECTIVES.md` | JOSH'S LIVE RULES. Read first by every worker. Changes between runs, always re-read |
| Worker plan | `deckd\docs\LOOP_PLAN.md` | The worker's own living plan (rewritten each slice) |
| Working repo | `C:\Users\Wrekin\Documents\workspace\deckd` | Branch `cleanup/ready-to-build`, pushed every slice |
| Preview | https://deckd-app.roxai.click | PM2 app `deckd-app` serving `app-serve/` from the exported `dist/` |

## Lifecycle

1. Watchdog ticks every 30 min via cron `deckd-loop-watchdog` (no_agent mode:
   silent when healthy, prints only when it acts).
2. It lists the DEFAULT board (`--board default` always), finds the NEWEST
   card titled `Deckd LOOP: build the vision...`.
3. Healthy states (`running`/`ready`/`todo`) → silent.
   `done` with summary starting `STANDARD MET` → silent (goal achieved).
   `done` without it, `blocked` (unblock-able), or missing → respawn a fresh
   card with the body file, then `dispatch`.
4. The worker (profile `builder`) reads LOOP_DIRECTIVES.md FIRST, then the
   other docs, writes its plan to LOOP_PLAN.md, and works one slice at a time:
   implement → verify → gates → commit → deploy → next.
5. Slice deploy: `npx expo export --platform web`, `rm -rf app-serve/_expo
   app-serve/assets app-serve/index.html app-serve/metadata.json`,
   `cp -r dist/* app-serve/`, `pm2 restart deckd-app`, verify 200.

## Things that broke (2026-08-09) and the fixes

1. **Watchdog v1 hardcoded one task id** (`LOOP_TASK = "t_edcfc356"`) and never
   passed `--board`. Once that card was done-without-STANDARD-MET, the cron
   spawned a NEW loop card every 30 minutes → 4 loop cards alive at once
   (1 running, 2 ready duplicates, 1 blocked). Fixed in v2: track the NEWEST
   Deckd LOOP card on the default board; only respawn when NO active card
   exists. Archived the 3 stray cards.
2. **Board flap:** other sessions (profile canaries) switch the active kanban
   board, which made `hermes kanban list/comment/show` without `--board`
   operate on the wrong board ("unknown task t_20d0aa72"). Fix: ALWAYS pass
   `--board default` in the watchdog AND when manually inspecting loop cards.
3. **Stale directives in the loop body** listed 2026-08-09 morning items (nav
   bar, particles) as "CURRENT". Replaced with a pointer: the ONLY live list
   is LOOP_DIRECTIVES.md; historical items marked DONE.
4. **No visibility:** loop cards complete with `latest_summary: NONE` — nobody
   can see what a card did. Next improvement (see below).

## How to operate it

- **Check health:** `hermes kanban --board default list | grep -i deckd` —
  want exactly one `● running` (or `ready`), zero extra `ready` loops.
- **Inject a directive:** edit `deckd\docs\LOOP_DIRECTIVES.md`, commit, push.
  The running worker re-reads it every slice (it's in the spec list). No card
  comment needed (comments get lost in board flapping).
- **Stop the loop:** `hermes cron remove <id>` (list first), archive the loop
  card, kill the worker (`hermes kanban reclaim <id>`).
- **Restart the loop:** re-enable/`hermes cron run <id>` or run the watchdog
  script manually: `python ...\deckd-loop-watchdog.py` — it bootstraps a card
  if none exists.
- **Force a new card now:** archive the current loop card, then run the
  watchdog — it respawns fresh with the current body file.

## Open improvements (next time)

1. **Progress summaries.** Goal-mode workers only report at the end. Add to
   the loop body: "comment progress on your card after every 2 slices" so the
   trail is inspectable mid-run (`hermes kanban --board default log <id>`).
2. **Preview auto-verify.** The worker deploys but nothing verifies the
   preview after. Add a final gate line: `curl -s -o /dev/null -w "%{http_code}"
   https://deckd-app.roxai.click/` must be 200 before commit. (The 0-byte
   curl `-o /dev/null` quirk on this box: check the downloaded file size too.)
3. **Blocked-card hygiene.** Cards that hit `failure_limit` (e.g. iteration
   budget x3) sit blocked until the watchdog unblocks or a human archives.
   v2 watchdog now respawns when unblock fails — but consider archiving
   blocked loops with a `failure_limit` diagnostic immediately.
4. **Board-flap root cause.** `--board default` is a workaround; the real fix
   is stopping other profiles from switching the global active board, or
   making loop tooling board-agnostic. Watchdog is already board-agnostic.
5. **Cost guard.** Every respawn is a fresh `builder` (Codex/Luna) worker with
   up to 40 goal turns. If a card loops without visible repo progress (no new
   commits), the watchdog should flag it instead of blindly respawning — a
   "no progress in N minutes" check on `git log` would catch a stuck loop.
