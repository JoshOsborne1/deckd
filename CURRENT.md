# Deckd current state

Status: current

This is the canonical live brief for Deckd. Supporting history lives in
`STATUS.md`; the cleanup queue lives in `docs/CLEANUP_2026-09-03.md`. Older
plans and dated audits are historical or superseded unless this file points to
them.

## Product

Deckd is an Expo and React Native card-table app. The current product target is
polished pass-and-play on one phone, with Deckd Master hosted lobbies. The
physical-card rebuild also defines hot-seat, personal-device, dual-end, and
Phone Deck surface modes. BLE and Multipeer Connectivity are out of scope.

## Live project state

- Repo: `C:/Users/Wrekin/Documents/workspace/deckd`
- Active branch: `rebuild/physical-cards`
- Public preview: `https://deckd-app.roxai.click`
- Preview origin: PM2 `deckd-app`, main checkout `app-serve/`, port 8085
- Landed cleanup slice: Slice 5, architecture background (2026-09-07)
- Evidence: event-log compaction caps at 500 events with baseline folding, zustand narrow selectors on chrome (HomeLayer/HubLayer/TableShell/UtilityDrawer/useTableSession), per-icon lucide imports, QA consolidated 39 scripts to 2 (deckd-visual.cjs + deckd-lobby-e2e.cjs), web-only RevenueCat stub removes the inert web paywall SDK from the bundle, 329/329 Jest, lint and typecheck clean, 3.15 MB raw entry / 823 KB gzip (was 5.97 MB export), live
- Next queued: owed P0 hold-to-peek dual-end mode, then the live 2-device lobby proof (needs Josh's hands)

## Quality bar

Every landed slice keeps TypeScript strict, lint at 0 errors and 0 warnings,
all Jest tests green, task-specific QA green, fresh screenshots at 375x812 and
desktop width, and an HTTP 200 check on the public preview when deployed.

## Source of truth

Read `AGENTS.md` and this file before implementation. Read the relevant section
of `docs/CLEANUP_2026-09-03.md` for the active visual slice. Do not create a
competing current brief. Mark replaced decisions as superseded and archive
retired candidates under `_archive/YYYY-MM-DD/`.
