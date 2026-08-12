# LOOP Plan — Sevens (task t_f92aa485)

Goal: Sevens to the ready bar (G1/G2/G8) — playable, readable, verified at 375px + desktop.

## State found (verified 2026-08-12)

- Engine rules exist and are correct (`src/engine/rules.ts` sevens*): 7 opens a run,
  extend ±1 rank same suit, PASS only when nothing playable, last-card play ends the
  session. All 52 cards dealt up front → the game always terminates (no draw pile,
  no deadlock class). Preset exists (2-6 players), rules guide exists, hub card exists,
  hand hints exist, contextual-game exclusions exist (no dead draw pile object).
- One sevens engine test exists (open + grow). Crazy Eights shipped the sibling
  template (799fc5f) with 6 tests + a full QA script.

## Gaps to close

1. **Table render: suit runs, not a flat pile (P0, directive 1).** The communal row
   currently shows every played card in one row — up to 52 xs cards ≈ overflow at
   375px and unreadable. Build `SevensRuns`: 4 suit lanes, each run as a row of xs
   cards with the 7 anchored, per-suit labels. Pure layout helper in the engine
   (framework-free, unit-testable).
2. **Sevens end banner copy** — "You play out first" / "<name> plays out first"
   (same family as Crazy Eights).
3. **Engine tests** — pass path, win path (last card), termination sweep across
   seeds, readout shape, run layout helper.
4. **QA script** `qa/deckd-sevens-qa.cjs` — full loop at 375×812 and 1440×900:
   rules sheet, suit lanes on felt, readout, play to end, winner banner, replay,
   zero console errors, no overflow.

## Slices

1. Engine: `sevensRunLayout` helper + tests (pass/win/termination/layout/readout). DONE (a50520a).
2. Table: SevensRuns render + end banner copy. DONE (a50520a). Verified at 375px via QA + screenshots.
3. QA script green → gates → commit → proof. QA green; proof + review pending.

## Decisions

- Suit lanes over horizontal scroll: the runs ARE the game state; scroll hides it.
- xs cards for runs (decorative size, fits 13 across ≈ 240px at 375px); readout
  carries exact counts.
- Same winner copy family as Crazy Eights ("plays out first") — both are
  first-to-empty games.
