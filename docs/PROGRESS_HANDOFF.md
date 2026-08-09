# Deckd progress handoff (2026-08-09)

Snapshot for future work. Live directive source: `docs/LOOP_DIRECTIVES.md`.
Live state log: `STATUS.md`. Loop machinery: `docs/LOOP_RUNBOOK.md`.

## Where the product is

V1 = pass-and-play (free) + multiplayer lobbies (Deckd Master hosts, guests
join free). Preview-mode rule is locked in: NO hard locks, everything
testable; locks are visual only. BLE dropped from v1.

Live surfaces:
- Preview web app: https://deckd-app.roxai.click (PM2 `deckd-app` :8085, static export)
- Landing: https://deckd.roxai.click (PM2 `deckd-landing` :8084)
- Relay: https://relay.roxai.click (PM2 `deckd-relay` :8083)
- Repo branch: `cleanup/ready-to-build`, pushed.

## Done and verified (2026-08-09)

- **Branding**: canonical `assets/logo.svg` (potrace vector), all Expo app
  assets + web icon set + PWA manifest regenerated from it. Icon pipeline:
  `hermes/scripts/make-deckd-icons.py` (svglib 150dpi render + trim).
  Pitfall recorded: potrace's `translate(0,H) scale(0.1,-0.1)` wrapper must
  be preserved or every path lands outside the viewBox.
- **Preview mode**: Master-pass hard gate removed from
  `LobbyLayer.handleCreate`; lobby hosting testable (verified live, room
  created with no alert). Locks stay visual.
- **Nav bar redesign** (directive 11): five floating card shells replaced
  with one continuous table-edge rail, icon + label, active crimson rule.
  Shipped in `78415d3` + `ef566ae`; verified at 375px on the live preview.
- **Table material**: `FeltBackground` deterministic paper/felt grain tinted
  from equipped theme, shared Home/Hub/Table/Pass.
- **Card rendering P0**: branded backs above paper fallback, cold-load
  preload, HandFan real-container measurement, SVG fronts from vendored
  `vendor/card-fronts/` (hayeah MIT, notpeter public domain).
- **CI fix**: invalid top-level `splash` key in app.json removed (was
  failing expo-doctor on every push, causing GitHub failure emails).
- **Loop machinery**: watchdog v2 (newest-active-card tracking, `--board
  default` everywhere, respawn only when none active); stale loop-body
  directives replaced with pointer to LOOP_DIRECTIVES.md; spurious cards
  archived; kanban board clean. Runbook: `docs/LOOP_RUNBOOK.md`.

## Next work (in priority order, from LOOP_DIRECTIVES.md)

1. Card-back picker wiring: Noir + Crimson assets exist, store preview-unlock
   already works, picker UI pending (default stays `back-brand`).
2. Setup page redesign (HubLayer): staging-a-deck-on-the-table feel, not a
   settings form (directive 4).
3. Presets redesign: readable at a glance, card-like on the table (directive 5).
4. Table background texture: confirmed done via FeltBackground (directive 9),
   verify on all surfaces.
5. Logo everywhere: apply to store, hub, settings, profile, pass (directive 8).
6. Multiplayer end-to-end: relay exists, real 2-device lobby test still owed;
   guest hands private via viewerId selectors; host auth HMAC minted but
   RevenueCat keys are empty placeholders.

## Known quirks / things that bite

- Kanban board flaps with concurrent sessions: ALWAYS `hermes kanban
  --board default <cmd>`.
- Loop cards complete with no summary; inspect via git log, not kanban.
- `curl -o /dev/null -w %{size_download}` reads 0 on this box; use
  download-to-file checks.
- Static assets immutable-cached: bump `?v=` on every JS/CSS change.
- Worker owns `app/index.tsx` + STATUS.md edits at handoff time; don't
  clobber uncommitted work. Commit your own docs separately.
