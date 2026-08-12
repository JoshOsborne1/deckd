# Deckd LOOP plan

Updated: 2026-08-12 (Old Maid slice, task t_798a1d52)

## Current read

Old Maid is mostly built from the Go Fish run: recipe preset (53-card deck,
roundRobin 27 rounds), pair/draw/end rules, rules guide copy, TableLayer
contextual rail (PAIR UP / DRAW CARD), FeltStack pair rendering, end banner
with pair count, HubLayer copy. Engine tests cover deal + pair + draw.

What is NOT ready (gaps vs G1/G2):

1. **Winner logic bug.** `oldMaidWinner` returns the FIRST player with an
   empty projected hand in seat order. In 3+ player games, a player who
   emptied earlier is declared winner when someone else empties. The winner
   must be the player who JUST emptied (current > 0, projected 0). The
   `end`/no-target fallbacks also hardcode `state.players[0]` as winner —
   wrong when the current player holds the maid and loses.
2. **No maid reveal.** The payoff moment is missing: when the round ends,
   the banner says "X takes the table" but never shows who holds the maid.
   Old Maid's whole drama is the loser stuck with the joker.
3. **Dead draw pile on the felt.** Old Maid deals all 53 cards, so the
   draw pile is always 0 and rendered disabled ("0 LEFT") — a G2 dead
   button. Go Fish keeps the pile (fishing); Old Maid should hide it.
4. **No dedicated Old Maid QA proof.** The library probe only checks an
   action exists. No full flow (setup → rules → pair → draw → pairs on
   felt → end → maid reveal → replay) at 375 and desktop.

## Current slice — winner fix + maid reveal + dead pile + proof

1. Engine (`src/engine/rules.ts`): `oldMaidWinner` picks the player who
   just emptied (current hand > 0, projected 0), falling back to any empty
   hand defensively. `end` and no-target fallbacks pick a non-current
   player instead of `players[0]`. Regression tests in fish-maid.test.ts:
   3-player game where an earlier-emptied player must NOT win; draw that
   empties the target → target wins; pair that empties the actor → actor
   wins.
2. TableLayer: hide the draw pile for old-maid (keep for go-fish). Ended
   banner: old-maid title "X dodged the maid" / "You hold the maid" when
   the viewer is stuck; render the maid joker face-up in the banner with
   "Maid stays with {name}" copy.
3. QA: `qa/deckd-oldmaid-qa.cjs` — full loop at 375x812 and 1440x900:
   start preset, read rules, PAIR UP, DRAW CARD, pairs on felt with
   accessible label, play to end, winner banner + maid reveal, replay,
   zero console errors, no overflow.
4. Gates (typecheck, lint, jest, expo-doctor) green, commit `[verified]`,
   deploy preview, update STATUS.md.

## Decision log

- Winner rule: the player who empties their hand first wins (classic Old
  Maid). The maid holder is the last player with cards.
- Maid reveal is text + the joker card rendered in the end banner — no new
  components, no new deps.
- Draw pile hidden for old-maid only; go-fish unchanged.
- No changes to Backlog status marks (watchdog owns them).

## Acceptance bar for this run

- Old Maid plays from setup to winner with pairs on the felt, the maid
  revealed at end, no dead draw pile, correct winner in 3+ player games.
- All four gates green; new engine tests + new QA script pass.
