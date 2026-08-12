# Deckd LOOP plan

Updated: 2026-08-12 (Crazy Eights slice, task t_c0e7d44e)

## Current read

Crazy Eights is mostly built from the Go Fish / Old Maid runs: recipe preset
(52-card deck, roundRobin 5 rounds, max 6 players), match-suit/rank rules,
wild eights, draw-one-then-pass, win on last card, rules guide copy, guidance
copy in TableLayer, per-card PLAY rail.

What is NOT ready (gaps vs G1/G2):

1. **Wrong-winner on empty deck.** When no card fits and the draw pile is
   empty, the rules rail offers FINISH and `crazyEightsApply('end')` ends the
   session with `winnerId = viewerId` — the CURRENT (stuck) player. Classic
   Crazy Eights ends with the fewest-cards player winning. Same bug in the
   draw-when-deck-empty fallback (line ~736). This is the Old Maid
   `players[0]` bug class.
2. **Dead deck object on the felt.** Contextual games set
   `canUseGenericHandActions = false`, so the draw-pile Pressable in the
   generic piles branch is always disabled for crazy-eights and sevens — a G2
   dead button (Old Maid's slice hid the pile; CE and sevens still show one).
3. **No CE end banner copy.** Ended banner falls through to generic "takes
   the table". CE deserves its own winner line.
4. **Draw count disappears** once the pile is hidden; move it into the
   readout (HAND n · TOP r · DRAW n).
5. **No dedicated CE QA proof.** The library probe only checks an action
   exists. No full flow (setup → rules → play match → draw-fits keeps turn →
   draw-miss passes → end → winner banner → replay) at 375 and desktop.

## Current slice — empty-deck winner + dead pile + CE banner + proof

1. Engine (`src/engine/rules.ts`):
   - `crazyEightsFewestCardsWinner(state)`: winner = player with fewest hand
     cards (seat order breaks ties). Used by `end` and the draw-when-empty
     fallback instead of `viewerId`.
   - Readout gains `· DRAW n` when the pile is non-empty.
   - Regression tests in fish-maid.test.ts: draw-that-fits keeps the turn,
     draw-that-misses passes, last-card play wins, empty-deck FINISH picks
     fewest-cards player over the stuck current player, and a 10-seed greedy
     termination sweep (no deadlock; winner always defined).
2. TableLayer:
   - Hide the draw-pile deck object for contextual games (crazy-eights,
     sevens share the generic piles branch; go-fish/old-maid already handled).
     The rule rail owns DRAW; the discard slot stays as the match target.
   - Ended banner: CE title "You play out first" / "{name} plays out first".
3. QA: `qa/deckd-crazy-eights-qa.cjs` — full loop at 375x812 and 1440x900:
   start preset, read rules, PLAY a matching card, draw-fits keeps turn,
   draw-miss passes, discard top visible on the felt, play to end, winner
   banner, replay, zero console errors, no overflow.
4. Gates (typecheck, lint, jest, expo-doctor) green, commit `[verified]`,
   deploy preview, update STATUS.md.

## Decision log

- Empty-deck end rule: fewest-cards wins, seat order breaks ties (classic
  Crazy Eights; the deck is exhausted and play stalls).
- No starter card on the discard: first player may play any card (matches
  the current engine; Go Fish/Old Maid open the same way).
- Dead draw pile hidden for ALL contextual games (crazy-eights, sevens,
  go-fish, old-maid) — the rule rail owns the draw action; the count moves
  into the readout instead of a dead "N LEFT" button.
- Draw that fits keeps the turn (classic rule), draw that misses auto-passes.
- No changes to Backlog status marks (watchdog owns them).

## Acceptance bar for this run

- Crazy Eights plays from setup to winner with a live discard target on the
  felt, correct empty-deck winner, no dead draw pile, CE end banner, replay.
- All four gates green; new engine tests + new QA script pass.
