# Deckd Loop System Design

Date: 2026-08-11
Author: Josh's agent (GLM-5.2)
Status: building

## Problem

The Deckd build loop is not autonomous. It requires manual intervention to:
- Start stopped worker gateways
- Reclaim exhausted/dead kanban cards
- Create new work cards from the build plan
- Trigger merges and deploys
- Detect and recover from stalls

The status cron reports but cannot act. The merge cron merges but cannot create work. No single component watches the whole system and keeps it running.

## Architecture

```
LOOP DRIVER (cron, every 5m, agent)
├── Reads kanban DB directly (SQLite)
├── Checks: any loop card running?
│   ├── YES + healthy heartbeat → do nothing
│   ├── YES + stale (no heartbeat > 30m) → reclaim
│   ├── YES + exhausted/blocked → reclaim + create fresh card
│   └── NO (idle) → create next card from build plan
├── Checks: gateway states
│   ├── Builder gateway stopped + work queued → start it
│   └── Generalist gateway stopped + parallel lanes queued → start it
├── Checks: reviewed lanes ready to merge
│   └── Triggers merge cron
├── Checks: merged work not deployed
│   └── Triggers deploy from origin
└── Reports summary to Discord #crons

BUILD PLAN (docs/LOOP_DIRECTIVES.md + docs/AUDIT_2026-08-11.md)
├── Ordered list of remaining build items
├── Each item: title, assignee, body, acceptance criteria
└── Driver reads next incomplete item and creates a card

QUALITY GATES (unchanged, already working)
├── Mechanical gate: typecheck + lint + jest + expo-doctor + security scan
├── Independent review: delegate_task reviewer, fail-closed JSON verdict
├── Merge gate: deckd-merge-gate.py + merge cron (15m)
└── Deploy: deckd-deploy-from-origin.py (from clean origin)

STATUS (improved)
├── Status cron (20m): truthful board, verified markers, overdue detection
├── Loop driver (5m): action-oriented, creates/reclaims/dispatches
└── Dashboard: single markdown/HTML page Josh can open anytime
```

## Component Details

### 1. Loop Driver (`scripts/deckd-loop-driver.py`)

Python script. Runs as a cron job every 5 minutes with an agent pass (needs reasoning to create good card bodies). The script does deterministic checks, the agent makes decisions.

**Deterministic checks (script):**
- Query kanban.db: any card with status `running` and assignee in (builder, generalist)?
- Query: any card with status `ready` and consecutive_failures < failure_limit?
- Query: any card with status `blocked`?
- Query: any reviewed but unmerged lane branches?
- Check gateway states via `hermes profile list`
- Check PM2 health for deckd services
- Read build plan from `docs/LOOP-DIRECTIVES.md` (or hardcoded remaining items)

**Agent decisions:**
- If idle and no ready card: create a new card for the next build plan item
- If exhausted: reclaim the dead card, create a fresh one with remaining work
- If gateway stopped: note it in the report (can't start from inside gateway)
- If lanes reviewed: trigger merge
- If merged but not deployed: trigger deploy

**Output:** structured JSON for the agent to read, plus a summary for Discord #crons.

### 2. Gateway Auto-Start (`scripts/deckd-start-worker-gateways.ps1`)

PowerShell script. Runs as a scheduled task or cron. Starts stopped worker gateways when work is queued for them.

- Check `hermes profile list` for stopped gateways
- Check kanban.db for ready/running cards assigned to each profile
- If work queued + gateway stopped: start it via `Start-Process`
- Log to #crons

### 3. Status Cron Fixes (`scripts/deckd-loop-status.py`)

Already substantially fixed. Remaining issue: `verified_done()` count is wrong (6/10 instead of 7/10) because solo + multiplayer are merged to origin but the markers don't check origin ancestry for those items.

Fix: items 8 (solo), 9 (UX), 10 (multiplayer) should check `origin/cleanup/ready-to-build` ancestry for their lane branches, same as `parallel_lanes()` already does.

### 4. Dashboard (`scripts/deckd-loop-dashboard.py`)

Python script. Generates a single markdown file with the complete system state:
- Build plan with status dots
- Active kanban cards
- Lane states
- Gateway states
- Deploy health
- Last 5 commits to origin
- Last 5 cron outputs

Output: `C:\Users\Wrekin\Documents\workspace\deckd\docs\LOOP-DASHBOARD.md`

Josh can open this file anytime to see the full state. Also delivered via the status cron.

## Build Plan Items (from AUDIT_2026-08-11.md)

| # | Item | Status | Assignee |
|---|------|--------|----------|
| 1 | Recipe schema | DONE | - |
| 2 | Free library v1 | DONE | - |
| 3 | Free library v2 | DONE | - |
| 4 | Rules, help, win states | DONE | - |
| 5 | Hold'em completeness | IN PROGRESS | builder |
| 6 | Animation pass | NOT STARTED | builder |
| 7 | Continuity pass | NOT STARTED | builder |
| 8 | Solo pillar | DONE (merged) | - |
| 9 | UX pass | DONE (merged) | - |
| 10 | Multiplayer E2E | DONE (merged) | - |

Remaining: Hold'em finish (item 5), animation (item 6), continuity (item 7), then hold-to-peek.

## Token Optimization

From the Pi audit:
- Skills index: 17,660 → 14,118 chars (already done)
- Tool deferral: 10 big-schema tools deferred on Discord (already done)
- Result caps: terminal 20k, read_file 50k, web_extract 20k (already done)
- Ollama Cloud does NOT prompt-cache: every token saved is real money saved

Loop-specific optimizations:
- Loop driver runs every 5m but only creates cards when idle (most ticks: no action, minimal tokens)
- Status cron runs every 20m, script does all computation, agent only formats (minimal tokens)
- Merge cron runs every 15m, only acts when lanes are reviewed (most ticks: no action)
- Worker cards use goal_mode with max_turns to prevent runaway sessions
- Independent review uses the cheapest approved model (Nous/Luna)

## Quality Harness

From the existing system + Sol audit:
1. Mechanical gate: typecheck + lint + jest + expo-doctor + security scan (before every commit)
2. Independent review: delegate_task reviewer with fail-closed JSON verdict
3. Merge gate: mechanical + smart review before any lane merges to origin
4. Deploy: from clean origin, verify bundle identity
5. Status: truthful, provenance-tagged, fail-loud

New additions:
6. Loop driver: auto-recovery for exhausted/dead cards
7. Gateway monitor: auto-start stopped gateways
8. Dashboard: full system state at a glance

## Testing on Deckd

1. Build the loop driver script
2. Fix the status cron count
3. Reclaim the exhausted card + create a fresh one
4. Start the builder gateway
5. Wire the loop driver as a cron (5m)
6. Wire the gateway auto-start as a cron (10m)
7. Let it run and verify it creates work, dispatches, and recovers autonomously
8. Verify the dashboard shows the full state