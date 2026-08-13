# Deckd Backlog — queued features & ideas

Living queue of deckd work. The loop watchdog dispatches from here when a card
finishes or dies. Lanes pick items marked `lane-ok`. Priority: P0 (Josh
explicit) > P1 (ready bar G1-G9) > P2 (polish).

Status legend: `queued` = ready to dispatch · `running` = a card/lane owns it ·
`done` = merged to origin · `parked` = needs Josh (accounts/keys/device).

---

## Game library (G1)

- [ ] **War** — `done` (preset, rules actions, table UI, win state; QA in deckd-library-qa).
- [ ] **Go Fish** — `done` (books on felt, end banner, engine deadlock fix; QA deckd-gofish-qa).
- [ ] **Old Maid** — `done` (pairs on felt, win state; library QA).
- [ ] **Crazy Eights** — `done` (contextual draw, empty-deck fewest-cards winner, banner; QA deckd-crazy-eights-qa).
- [ ] **Sevens** — `done` (suit-run board, pass-if-unplayable, winner banner; QA deckd-sevens + library QA).
- [ ] **Rules view + win states for every shipped game** — `done` (shared RulesSheet per recipe + end-state round/turn readout + replay; scoreboard across rounds not built — P2 if wanted).
- [ ] **Golf** — `done` (engine, rules, board UI, QA — commit 61239e7, merged + live).

## UX (G2, G5)

- [ ] **Hold-to-peek** — `queued` P0. Josh: "Hell yeah!" (directive 19, 2026-08-11). Long-press to peek your hand, release to re-veil. TableLayer interaction + motion. NOT YET STARTED (was never dispatched).
- [ ] **Nav v3: chips on the table edge** — `done` (lane deckd-para-nav3, commit 4fdc3b5 + proof bad3dfd; live).
- [ ] **Sound pass** — `done` (lane deckd-para-sound: expo-audio rework, uiStore mute, native replay fix; live).
- [ ] **Undo for freeplay-family games** — `queued`. Source: audit dispatch #9, G2. NOT YET STARTED.
- [ ] **Confirm dialogs** — `done` (lane deckd-para-uxpass, commit 432e3ea).
- [ ] **Hand sort** — `done` (lane deckd-para-uxpass, commit 1f7fc08).
- [ ] **First-run hints** — `done` (lane deckd-para-uxpass, commit d428510 — "Tap the deck to deal").
- [ ] **Turn indicator polish** — `queued`. Source: audit dispatch #9.
- [ ] **Empty states** — `done` (lane deckd-para-uxpass, commit 5417e78).

## Animation (G3)

- [ ] **Deal from deck object + settle** — `done` (lanes deckd-para-anim-fx + deckd-para-guestresume: card flight overlay, drag foundation, felt-space transitions, draw/discard arrivals animated).
- [ ] **Card move animation** — `done` (draw/discard arrivals animated per-game; poker/blackjack/sevens passes).
- [ ] **Pass ritual** — `done` (sevens pass chip slide + per-game passes; full felt-wide ritual still P2 if wanted).
- [ ] **Win celebration** — `done` (per-game: poker showdown cascade + pot pulse, blackjack hand-over pop, sevens winner banner).
- [ ] **Reduced-motion = plain fades** — `done` (reduced-motion QA green across surfaces).

## Visuals (directives 1, 2, 3, 8, 9, 12)

- [ ] **Card fronts: paper, not pixels** — `queued` P0. Josh: STILL NOT A FAN (directive 12). Vendor card-fronts (hayeah/notpeter) → RN-SVG components, deckd palette. Do not use raw SVGs as static assets.
- [ ] **Card backs wired** — `done` (3 backs exist, picker wired). Keep applying logo (directive 8).
- [ ] **Table texture** — `queued`. Paper grain on felt/ivory. Source: directive 9.
- [ ] **Rive personified animations** — `parked`. Mascot + premium motion. Needs Rive setup decision.

## Continuity (G4)

- [ ] **Surface morph hub→table, lobby→table** — `queued`. Source: audit dispatch #7.
- [ ] **Home-as-table redesign** — `queued`. Source: audit dispatch #7.
- [ ] **Drawer screens for store/profile** — `queued`. Source: audit dispatch #7.

## Multiplayer (G7)

- [ ] **Live 2-device proof** — `queued`. Blackjack + hold'em on two real devices against relay.roxai.click. Source: audit dispatch #10. (Lane deckd-para-mpe2e shipped hold'em live E2E harnesses with privacy assertions — automated proof exists; real-device proof still owed.)
- [ ] **Guest poker street control** — `done` (lane deckd-para-mpe2e: hold'em privacy + lobby sync gaps; guest hands private via viewerId selectors, E2E with privacy assertions).

## Backend / ops

- [ ] **RevenueCat webhook verification** — `parked`. Replace HMAC shortcut with server-side verification. Needs RevenueCat account.
- [ ] **Store products creation** — `parked`. App Store Connect / Play Console / RevenueCat products + keys (~1h, checklist in docs/MONETIZATION.md).

## Marketing

- [ ] **App store copy + screenshots** — `queued`. docs/STORE_COPY.md exists; needs screenshots from real builds.

---

## Lane dispatch notes (loop SHUT DOWN 2026-08-13)

- The autonomous loop is OFF: deckd-loop-watchdog, deckd-lane-watchdog,
  deckd-builder-watchdog, deckd-merge-deploy, and deckd-skill-index crons were
  all removed 2026-08-13 at Josh's request. Nothing dispatches from this
  backlog anymore. Work here happens on demand.
- Lanes must NOT touch files another lane is editing.
- Lane pattern (if revived): isolated worktree + own branch `deckd-para-<name>`
  + review gate before every commit + merge via deckd-merge-deploy cron when
  the lane card is done.
- 2-3 concurrent workers max: main card (default profile) + 1-2 lanes
  (generalist profile).
