# Deckd LOOP plan

Updated: 2026-08-11

## North star

Ship the ready bar in `docs/AUDIT_2026-08-11.md`: Deckd must feel like one warm ivory/crimson/ink card table with playable games, clear rules, honest end states, and no page-like handoffs. Monetisation remains parked.

## Current decision

The free library, rules/replay baseline, solo Klondike, and the first real Hold'em betting pass are already present in this checkout. This run hardens Hold'em as a real table game before moving on: street progression is explicitly burn → community deal, guests cannot fork a private table while disconnected, and the poker QA harness asserts the staged sequence at phone and desktop widths. Parallel solo, UX, and multiplayer-E2E lanes remain out of scope here.

## Materials and interaction language

Gameplay remains the physical table: warm ivory paper, crimson ink, warm charcoal text, 1px rules, restrained depth, cards and chips as objects. Betting controls will read as table chips rather than a generic form; state changes will be explicit in the readout and action rail. No new dependencies, no raw component hex, no page transition, and no monetisation work.

## Slice order

1. Finish and verify the Hold'em hardening already in the working tree: serialisable burn state, legal staged street actions, recipient-safe guest role, and an executable QA contract.
2. Commit and deploy this betting slice; prove the public bundle, heads-up betting loop, 375×812 geometry, and 1440×900 geometry.
3. Next highest-impact slice: physical table motion for community-card streets and the end-state handoff. Animate only transform/opacity, preserve the shared table canvas, keep reduced-motion safe, and do not add dependencies.
4. Follow with continuity/home work: make the home deck the table's obvious entry point and keep setup → table as a surface morph, not a page swap.
5. Re-read `docs/LOOP_DIRECTIVES.md` after every deployed slice. Do not claim G1–G8 until the missing library, solo, animation, UX, and live multiplayer gates have actual evidence.

## Acceptance bar for this run

- A Hold'em session deals into a real pre-flop betting state with blinds and chip stacks.
- Only legal actions appear for the current player; check/call/raise/fold change state and never silently no-op.
- Pot and per-player contributions update after every betting action; a completed betting round advances exactly once.
- Every community street requires the explicit burn action before its flop/turn/river deal.
- Folded players cannot win showdown; the all-in/last-player path ends cleanly.
- Flop/turn/river/showdown still work after betting and the winner banner names the winner.
- A disconnected guest remains read-only and cannot create a private local fork.
- The QA harness passes with zero page/console errors at 375×812 and 1440×900; focused tests and all project gates remain green.

## Remaining after this plan

Anything still open will be chosen from the live audit after verification. Do not claim the full G1–G8 ready bar until every required game, solo path, animation, continuity, UX, and live E2E gate has real evidence.
