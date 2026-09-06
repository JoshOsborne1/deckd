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
- Landed cleanup slice: Slice 4c, Old Maid dedicated pair-and-draw table
- Evidence: Old Maid local and public QA 46 assertions across 375x812 and 1440x900, 324/324 Jest, Expo Doctor 18/18, 5.96 MB export
- Next queued slice: Slice 4d, Klondike re-shoot + fix pass

## Quality bar

Every landed slice keeps TypeScript strict, lint at 0 errors and 0 warnings,
all Jest tests green, task-specific QA green, fresh screenshots at 375x812 and
desktop width, and an HTTP 200 check on the public preview when deployed.

## Source of truth

Read `AGENTS.md` and this file before implementation. Read the relevant section
of `docs/CLEANUP_2026-09-03.md` for the active visual slice. Do not create a
competing current brief. Mark replaced decisions as superseded and archive
retired candidates under `_archive/YYYY-MM-DD/`.
