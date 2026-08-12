# Deckd LOOP plan

Updated: 2026-08-12 (Go Fish slice, task t_8b3ac033)

## Current read

Go Fish is mostly built already: recipe preset, ask/books/win rules
(`src/engine/rules.ts` goFish*), rules guide copy, `gameStore.gameAction`
routing for `card/ask`, and the TableLayer rule-action rail with ASK buttons,
contextual guidance, and a `BOOKS n · HAND n` readout. Engine tests cover
deals, asks, hits, book collection, and turn retention.

What is NOT ready (gaps vs G1/G2):

1. **Books are invisible on the felt.** Books land in the public
   `table:<player>` zone but TableLayer renders nothing there. Cards vanish
   from the hand with only a numeric readout — a "silent" game state change,
   exactly the class G2 bans. Old Maid pairs have the same gap.
2. **Deadlock when the draw pile empties.** With an empty deck and remaining
   hands holding only distinct ranks, every ask misses and `turn/end` cycles
   forever — no FINISH action is offered (it only appears with an empty hand
   or no target). Classic Go Fish ends the round on a miss with an empty
   deck. No engine test covers this.
3. **No dedicated Go Fish QA proof.** The library probe only checks that an
   ASK button exists and a BOOKS readout appears. No full flow (setup →
   rules → ask → hit/miss → book on felt → end → replay) at 375 and desktop.

## Current slice — Books on the felt + deadlock fix + proof

1. Engine: in `goFishApply`, when the ask misses AND the draw pile is empty,
   end the round with the book winner instead of cycling the turn. Add
   regression tests (empty-deck miss ends round; hit with empty deck keeps
   the turn; normal miss still passes).
2. TableLayer: render `table:<player>` zones on the felt for Go Fish (books
   of 4) and Old Maid (pairs of 2) — face-up mini card groups labelled per
   player, horizontally scrollable at 375px, accessible labels for QA.
   Go Fish keeps the draw pile visible (fishing); discard slot is unused for
   these games and stays as-is.
3. End banner: Go Fish winner copy shows the winning book count when known.
4. QA: `qa/deckd-gofish-qa.cjs` — full Go Fish loop at 375x812 and 1440x900
   against the local dev server: start preset, read rules, ASK a held rank,
   verify a book appears on the felt with an accessible label, end the round,
   verify winner banner + replay, zero console errors, no overflow.
5. Gates (typecheck, lint, jest, expo-doctor) green, commit `[verified]`,
   deploy preview, update STATUS.md.

## Decision log

- Scope: Go Fish to the ready bar, plus the shared Old Maid pair rendering
  (same `table:<player>` gap, one component fixes both). No changes to
  Backlog status marks (watchdog owns them).
- No pass-ritual veil work here: the turn-swap UX for contextual games is
  already shipped and QA-probed; the pass ritual + hold-to-peek is its own
  queued slice (directive 19, backlog UX). Not duplicated.
- Deadlock rule chosen: miss + empty deck ends the round (classic Go Fish).
  This is deadlock-free: after the deck empties, the first miss ends play.

## Acceptance bar for this run

- Go Fish plays from setup to winner with books visibly on the felt at
  375px and desktop; no deadlock with an empty draw pile.
- Old Maid pairs visible on the felt.
- All four gates green; new engine tests + new QA script pass.
