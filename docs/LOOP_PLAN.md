# Deckd LOOP plan

Updated: 2026-08-11

## North star

Ship the ready bar in `docs/AUDIT_2026-08-11.md`: Deckd must feel like one warm ivory/crimson/ink card table with playable games, clear rules, honest end states, and no page-like handoffs. Monetisation remains parked.

## Current decision

The previous run shipped Klondike draw-one and the free-library/rules/replay baseline. The highest-impact remaining slice in this checkout is Hold'em completeness: the existing poker route exposes street buttons and placeholder betting actions, but it has no real blind/chip/pot accounting or betting-round progression. I will strengthen that path before starting new game families or visual-only polish. Parallel solo, UX, and multiplayer-E2E lanes are out of scope for this run.

## Materials and interaction language

Gameplay remains the physical table: warm ivory paper, crimson ink, warm charcoal text, 1px rules, restrained depth, cards and chips as objects. Betting controls will read as table chips rather than a generic form; state changes will be explicit in the readout and action rail. No new dependencies, no raw component hex, no page transition, and no monetisation work.

## Slice order

1. Audit the current poker recipe, event reducer, multiplayer bridge, table surface, and QA harness; define a minimal serialisable betting contract that preserves primitive event sync.
2. Implement Hold'em betting state and legal action derivation: blinds/starting stacks, fold/check/call/raise, pot/contributions, round completion, street advance, and showdown winner state. Keep host as street/deal authority unless the existing live contract requires otherwise.
3. Add focused engine/store tests and update the poker QA flow so a real betting round is exercised before the community streets and showdown.
4. Make the table readout and action rail communicate pot, stack, current bet, and winner without crowding 375px; retain existing card/table materials and reduced-motion behavior.
5. Run browser proof at 375×812 and 1440×900, then run typecheck, lint, Jest, expo-doctor, export, deploy, and public verification.
6. Re-read the live directives and status after the slice. If Hold'em is materially complete, choose the next highest-impact ready-bar gap rather than stopping at a checklist item.

## Acceptance bar for this run

- A Hold'em session deals into a real pre-flop betting state with blinds and chip stacks.
- Only legal actions appear for the current player; check/call/raise/fold change state and never silently no-op.
- Pot and per-player contributions update after every betting action; a completed betting round advances exactly once.
- Folded players cannot win showdown; an all-in/last-player path ends cleanly.
- Flop/turn/river/showdown still work after betting and the winner banner names the winner.
- Rules/help copy explains the betting loop in plain English.
- Focused tests and all project gates remain green; live preview is rebuilt and verified at mobile and desktop widths.

## Remaining after this plan

Anything still open will be chosen from the live audit after verification. Do not claim the full G1–G8 ready bar until every required game, solo path, animation, continuity, UX, and live E2E gate has real evidence.
