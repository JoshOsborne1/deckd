# LOOP PLAN — Golf solitaire (task t_bc707a9a)

## Goal

Ship **Golf** to the audit ready bar — the final named solo-pillar game
(audit §3.1 item 14, BACKLOG `queued`: "Flip-and-match short rounds"). Same
table world, same animation quality, same recipe/store path as FreeCell and
Pyramid. Solo-only, 1 player, offline-capable.

## Rules (classic Golf solitaire)

- 7 columns x 5 cards face-up = 35 tableau cards. 17-card stock.
- Draw one card from the stock face-up to the waste.
- A tableau card (top of a column) plays onto the waste when its rank is
  adjacent to the waste top (±1, with A-K wrap). Kings are dead and never play.
- Empty waste (start of round): draw must open it; tableau cards cannot start
  it (classic behaviour, prevents degenerate first tap).
- Win = all 35 tableau cards removed. Loss = stock empty and no legal play.
- After a win or loss: New deal (startNextHand re-deals same seat).

## Slices

1. **Engine layout** — `src/engine/solitaire.ts`: `GOLF_TABLEAU_COUNT`,
   `GOLF_COLUMN_DEPTH`, `golfTableauZoneId`, `GOLF_STOCK`, `GOLF_WASTE`,
   `buildGolfLayout` (35 face-up tableau + 17 face-down stock), `isGolfWon`,
   `golfPlaysOnWaste` (adjacency with A-K wrap, Kings rejected, empty waste
   rejected). `src/engine/recipes.ts`: `layout: 'golf'` dispatch.
   `presets.ts`: `golfPreset` (min/max 1, backs `back-brand`, actionPolicy
   draw+play only, turnPolicy free, winCondition scoreTarget).
   `gameStore.ts`: `orderedDeckForPreset` fixed-52 for golf (jokers off).
2. **Rules** — `src/engine/rules.ts`: `golfActions` (DRAW while stock; FINISH
   when won; END TABLE when stuck: stock empty + no legal play),
   `golfApply` (`draw` -> stock top to waste face-up; `play:<columnIndex>` ->
   validate tableau top + adjacency + not King + waste exists, move to waste,
   emit `session/end` on the final clearing move), `golfReadout`
   (TABLEAU n/35 · STOCK m). Register `golf` in `GAME_RULES`.
3. **Rules guide + UI wiring** — `rulesGuide.ts` golf card; `presetAssets.ts`
   golf back; `HubLayer` PRESET_OUTCOMES, SOLO_PRESETS, kicker copy;
   `TableLayer` isSolitaire list; `SolitaireBoard`: `solitaireGameId`,
   eyebrow, win copy, `GolfBoard` (7 tap-to-play columns of xs cards, top
   stock+waste row, legal top cards highlighted, accessible labels).
4. **Tests** — `solitaire.rules.test.ts`: layout counts (35/17), draw to
   waste, empty-waste cannot start, legal adjacent play, Kings blocked
   (incl. vs Ace), END gating, readout. `storePath.solitaire.verify.test.ts`:
   golf 35+17 through the store path. `rulesGuide.test.ts`: golf listed.
5. **QA + proof** — `qa/deckd-golf-qa.cjs` (375x812 + 1440x900: setup ->
   rules sheet -> draw -> play columns -> END TABLE/stuck end state -> new
   deal, zero console errors, no overflow). Gates: typecheck, lint, jest,
   expo-doctor. Commit, run delivery-proof, request review.

## Decisions (made, not deferred)

- A-K wrap ON (classic). Kings blocked from tableau (classic).
- Waste opens only via stock draw (classic, avoids accidental first play).
- Loss state: FINISH only when won; stuck-loss exposes END TABLE so the
  round closes honestly, banner copy "No more moves" + New deal.
- Separate `golf:stock` / `golf:waste` zones (not generic `draw`/`discard`)
  so no generic table UI leaks draw/discard controls into the golf surface.
- `play:<columnIndex>` (0-6), not cardId: the rules resolve the column top
  itself, keeping the UI tap target stable across plays.
- Back: `back-brand` (matches the other solitaire games).

## Status (2026-08-12)

- Slices 1-5 DONE. Full gates green: typecheck, lint (0 errors), 217 Jest
  tests (21 suites, incl. 8 new Golf rules tests + store-path + guide list),
  Expo Doctor 20/20.
- Browser QA: `qa/deckd-golf-qa.cjs` PASS at 375x812 and 1440x900 — setup
  -> Golf board (7 columns, readout, DRAW), live rules sheet, autonomous
  play to terminal END TABLE (17 draws, legal plays), end banner + New deal
  re-deal, zero page/console errors, no horizontal overflow.
- Remaining: commit candidate, run delivery-proof.py, attach proof, clear
  model override, request review with reviewer=builder.
