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
- [ ] **Golf** — `queued`. Flip-and-match short rounds. Source: solo lane brief (if time).

## UX (G2, G5)

- [ ] **Hold-to-peek** — `queued` P0. Josh: "Hell yeah!" (directive 19, 2026-08-11). Long-press to peek your hand, release to re-veil. TableLayer interaction + motion. Next slice after current pillars.
- [ ] **Nav v3: chips on the table edge** — `queued` P0. Josh: nav bar STILL BAD (directive 13, supersedes 11). Chips sitting on the table rail, not a bar. GlobalNavBar + HomeLayer + theme.
- [ ] **Sound pass** — `queued`. expo-audio: deal, flip, discard, win sounds + mute toggle in settings. useTableSound.ts exists (require() style, needs rework). Source: audit dispatch #9.
- [ ] **Undo for freeplay-family games** — `queued`. Source: audit dispatch #9, G2.
- [ ] **Confirm dialogs** — `queued`. End-session, reset, destructive actions. Source: audit dispatch #9.
- [ ] **Hand sort** — `queued`. Sort by suit/rank toggle. Source: audit dispatch #9.
- [ ] **First-run hints** — `queued`. One-time coach marks on first session. Source: audit dispatch #9.
- [ ] **Turn indicator polish** — `queued`. Source: audit dispatch #9.
- [ ] **Empty states** — `queued`. Store/profile/list empty states. Source: audit dispatch #9.

## Animation (G3)

- [ ] **Deal from deck object + settle** — `queued`. Deck object is the deal; cards land with 1-2px settle spring. Source: audit dispatch #6, directive 12.
- [ ] **Card move animation** — `queued`. Draw/discard/play moves animated with settle physics. Source: audit dispatch #6.
- [ ] **Pass ritual** — `queued`. Source: audit dispatch #6.
- [ ] **Win celebration** — `queued`. Source: audit dispatch #6.
- [ ] **Reduced-motion = plain fades** — `queued`. Source: G3.

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

- [ ] **Live 2-device proof** — `queued`. Blackjack + hold'em on two real devices against relay.roxai.click. Source: audit dispatch #10.
- [ ] **Guest poker street control** — `queued`. Guests can only bet; street progression host-only. E2E for guest poker. Source: audit.

## Backend / ops

- [ ] **RevenueCat webhook verification** — `parked`. Replace HMAC shortcut with server-side verification. Needs RevenueCat account.
- [ ] **Store products creation** — `parked`. App Store Connect / Play Console / RevenueCat products + keys (~1h, checklist in docs/MONETIZATION.md).

## Marketing

- [ ] **App store copy + screenshots** — `queued`. docs/STORE_COPY.md exists; needs screenshots from real builds.

---

## Lane dispatch notes

- Lanes must NOT touch files the main card is editing (rules.ts, TableLayer while War is in flight).
- Lane pattern: isolated worktree + own branch `deckd-para-<name>` + review gate before every commit + merge via deckd-merge-deploy cron when the lane card is done.
- 2-3 concurrent workers max: main card (default profile) + 1-2 lanes (generalist profile).
