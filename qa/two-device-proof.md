# Two-device live proof — step-by-step test script

Prepared 2026-09-07 by the cleanup worker (task t_f199d6ac). This is the owed
G7 proof: a real 2-device run of the online lobby against the live relay.
The automated two-client E2E (`qa/deckd-lobby-e2e.cjs`, 3 phases) already
passes against this same build; this script is the human confirmation on
physical devices. It is a WAITING report until Josh runs it.

## What is live right now

- App: https://deckd-app.roxai.click (exported build, entry-72cfe27a, HTTP 200)
- Relay: wss://relay.roxai.click/ws (PM2 deckd-relay, port 8083)
- Branch: rebuild/physical-cards @ 6cbd2bb (335/335 Jest, lint 0/0, typecheck clean)

No app install needed: both devices just open the web preview in Safari or
Chrome. Any network works (the relay is public, not LAN).

## Prep (2 minutes)

1. Two phones (or phone + laptop). Name them HOST and GUEST for this run.
2. On both: open https://deckd-app.roxai.click in a fresh tab.
3. If either shows a stale "GAME IN PROGRESS / Resume" or "SESSION OVER"
   screen, use a private/incognito tab instead (stale localStorage is the
   only known flake source).
4. Keep both screens unlocked and the tab in the foreground.

## Phase 1 — Lobby sync (Deal 2 each)

1. HOST: tap "Host a lobby" (home card). Landing shows "Play with friends".
2. HOST: tap "Host a lobby" (landing primary button). Wait for
   "Relay: connected" and a 6-character ROOM CODE. Read the code aloud.
3. GUEST: tap "Host a lobby", then "Join with a code". Type the code, tap
   "Join room". Wait for "Relay: connected".
4. Both: wait for "Players: 2" on both screens.
   PASS = both show 2 players.
5. HOST: tap "Start the table", pick "Deal 2 each", tap "Deal now".
   HOST sees PASS TURN and their hand.
6. GUEST: tap "Start the table". GUEST sees "Live" and PASS TURN, and their
   own hand face-up. HOST's hand must show as card backs (2 CARDS pill).
   PASS = guest sees own cards, host's cards hidden.
7. HOST: tap the draw pile. Both screens must show the pile drop to 47
   (HOST sees "Draw pile, 47", GUEST sees the same count).
   PASS = both counts match after one draw.
8. HOST: tap PASS TURN. GUEST's turn indicator lights up.
   PASS = turn moved without any device handoff.

## Phase 2 — Online blackjack (guest acts remotely)

1. HOST: end the table (flag / end session), then "Start the table" again
   and pick "Blackjack". HOST sees TWIST/STICK.
2. HOST: tap STICK. STICK disappears from HOST's rail (turn passed).
3. GUEST: tap "Start the table". GUEST sees "Live" and TWIST/STICK with
   "YOUR TURN" (or the hand value pill).
4. GUEST: tap TWIST. Both screens must show the guest's hand value change
   (HAND N pill) or BUST.
   PASS = guest's remote action changed both screens.
5. HOST: finish the hand (STICK / let the house play). Both screens agree
   on the winner banner.

## Phase 3 — Poker streets + privacy (optional but recommended)

1. HOST: new table, pick "Poker". HOST sees POT and the bet rail
   (FOLD/CHECK/CALL/RAISE).
2. GUEST: "Start the table". GUEST sees "Live" and POT.
3. HOST: play the streets — BURN, FLOP, TURN, RIVER, SHOWDOWN — closing
   each betting round with CHECK/CALL as prompted. GUEST's screen follows
   each street.
4. PRIVACY CHECK: at every point, GUEST must see HOST's hole cards as
   backs, never faces. If a host card ever flips face-up on the guest
   screen, that is a P0 privacy leak — screenshot it and stop.
5. PASS = showdown reached and both screens show the same winner.

## Pass criteria

- Phase 1 steps 4, 6, 7, 8 all PASS.
- Phase 2 step 4 PASS.
- Phase 3: streets follow on both screens and no host card ever leaks
  face-up to the guest (privacy check clean).
- Zero red screens / JS error toasts on either device.

## If something fails

1. Screenshot both devices (the failing screen and the other one).
2. Note the step number and what each screen showed.
3. Report back with the screenshots; do not retry the same step more than
   twice (a repeatable failure is a real bug, not a flake).

## After the run

- All PASS: tick the "Owed proof" box in docs/CLEANUP_2026-09-03.md
  progress tracker and add a STATUS.md bullet with the date, devices used,
  and phases passed. The multiplayer claim is then backed by a real
  2-client run.
- Any FAIL: file the evidence; the fix goes back through the normal slice
  flow before the proof is re-run.
