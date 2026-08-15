# Deckd visual audit — 2026-08-15

Source: fresh screenshot sweep of EVERY game surface at 375×812 (deviceScaleFactor 2)
against the live local build (127.0.0.1:8085), reviewed pixel-by-pixel. Evidence:
`.vischeck-sweep/*.png` (15 shots: home, hub, 11 games, freeplay, freeplay pass).

Josh's call: **"the games are still a buggy mess — they need a major visual check
and redesign."** Confirmed. The animation/pass work shipped mechanics, but the
surfaces they animate are visually broken. This document is the redesign brief.

## The disease, in one line per game

| Surface | Verdict | Worst issue |
|---|---|---|
| Home | OK-ish | sparse, marketing feel persists |
| Hub | OK-ish | recipe fan fine, options tokens cramped at 375 |
| Freeplay | BROKEN | "Next Useful Move" box collides with nav chips; Presets chip clipped under it; weak DISCARD dashed box |
| Freeplay pass | BROKEN | radar/target veil graphic; "PASS DEVICE TO" dangles; faint "press and hold" hint |
| Blackjack | BROKEN | TWIST + STICK + STAND (STICK and STAND are the same action); white info overlay covers player's cards; "46 LEFT" badge clipping the card; huge mid dead space |
| Poker | BROKEN | POT/STACK shown TWICE (stat bar + red pill); MUCK button looks like a stray element; blocky low-res diamond pips; giant mid dead space |
| War | not re-checked | (sweep shot exists, mechanics QA green) |
| Go Fish | not re-checked | (sweep shot exists, mechanics QA green) |
| Old Maid | not re-checked | (sweep shot exists, mechanics QA green) |
| Crazy Eights | BROKEN | five floating red "PLAY J / PLAY A / ..." buttons in a void — legacy web-button look; duplicate guidance copy; flat fan perspective |
| Sevens | BROKEN | hand clipped at both screen edges (no scroll, no scale); suit runs lost in the empty center where the board should read |
| Klondike | BROKEN | face-down cards show faint low-contrast "D" logo (reads as placeholder); tableau columns squashed; Queen of Spades cut off by screen edge; DRAW STOCK button disconnected from the stock pile (bottom vs top) |
| FreeCell | not re-checked | (sweep shot exists) |
| Pyramid | BROKEN | pyramid off-center (right-leaning); abstract face art without readable rank/suit; stock/waste tacked left; huge mid dead space; "24" badge font mismatch |
| Golf | BROKEN | tableau cards vertically CRUSHED into illegible slivers (aspect distortion); floating DRAW button in a void; stock counter badge overlaps card art |

## Root causes (all cross-game)

1. **No coherent card front design.** The deck mixes styles: abstract geometric
   pips (pyramid), cartoonish low-fi faces (crazy eights J), traditional blocky
   faces (blackjack 5♦). Different games literally render different decks.
   Directive 12 ("paper, not pixels", P0, Josh: "STILL NOT A FAN") was never
   delivered — `vendor/card-fronts/` (hayeah MIT + notpeter PD) still unported.
2. **Card back "D" logo reads as placeholder** — faint, low contrast on the
   white back. The three branded backs exist but the default reads cheap.
3. **Every table has a dead vertical band** in the middle. Surfaces are
   top-heavy (opponent/house/board) + bottom-heavy (hand/actions) with nothing
   bridging them. The "one continuous table space" thesis isn't met.
4. **Action UI floats in the void** — no container, no anchor, no hierarchy:
   PLAY buttons (crazy eights), DRAW (golf/pyramid), MUCK (poker), rule rail
   (sevens). Utility icons drift as thin outlines next to solid red pills.
5. **Dashed placeholder boxes everywhere** — DISCARD, WASTE, COMMUNITY zones
   look like wireframe stubs, not game furniture.
6. **Nav deck object** (directive 13) renders as an oversized tilted sticker
   that overlaps the nav edge on every surface.
7. **Redundant copy:** YOUR TURN twice (crazy eights), POT/STACK twice (poker),
   guidance duplicated in box + pill.
8. **Info badges clip card art** — "46 LEFT", "24", "17" counters overlap card
   faces instead of sitting beside them.
9. **Pass veil** is a radar target, not a veil; "PASS DEVICE TO" is a dangling
   preposition; hold-hint is nearly invisible.

## What "done" means on the old backlog (corrected)

- Animations: deal/move/flip/win ARE shipped and animated. The pass ritual is
  only a chip slide + veil, and the veil itself needs the redesign below.
  "Full felt-wide ritual" was parked as P2 — still parked.
- Games: mechanics all work (jest 225 + QA green). The MESS is visual.
- The real incomplete list is: **visual redesign of every game surface**
  (this doc), hold-to-peek (P0 directive 19), card fronts (P0 directive 12),
  lobby→table morph, live 2-device proof, parked monetisation.

## Redesign scope (dispatch order)

1. **Card faces (P0, directive 12).** Port vendored fronts → RN-SVG components,
   ONE coherent deck: warm ivory paper stock, crimson/ink suits, corner indices
   both corners, classic courts. Same component for every game. This kills the
   style-mixing disease at the root.
2. **Card back default.** Strengthen the branded back contrast (the logo needs
   to read at 375px as "a deck of Deckd cards", not "a placeholder").
3. **Per-game table layouts.** Kill the dead band, un-crush the cards:
   - Golf: 7×5 tableau must keep card aspect ratio — stacked overlap + smaller
     gap, or a scrollable tableau.
   - Klondike: tableau columns breathe; queen never clips the edge; DRAW STOCK
     sits adjacent to the stock/waste row.
   - Pyramid: center the pyramid; readable faces; stock/waste integrated under it.
   - Sevens: hand fits 375px (scale or horizontal scroll); runs move up into
     the dead band; instruction text never under cards.
   - Crazy eights: tap-card-to-play (kill the PLAY J / PLAY A button wall);
     single guidance line.
   - Blackjack: kill STAND (TWIST/STICK only); info overlay never covers the
     player hand; badge beside card, not on it.
   - Poker: single POT/STACK readout; MUCK integrated as a real zone; pips
     come from the new deck component.
   - Freeplay: guidance box never collides with nav chips.
4. **Pass veil.** Replace radar graphic with a soft felt seal/veil; fix copy
   ("Pass to Player 2"), hold hint readable.
5. **Zones.** DISCARD/WASTE/COMMUNITY get real felt furniture (solid inset
   wells, not dashed boxes).
6. **Nav deck object.** Integrate into the edge — it should read as the deck
   sitting on the table, not a sticker.
7. **Dead copy sweep.** One YOUR TURN, one guidance line, one pot readout.

## Gates per slice

`npm run typecheck` + `npm run lint` + `npx jest` + `npx expo-doctor`, then
re-shoot that game via `qa/deckd-visual-sweep.cjs` and eyeball the diff before
deploy. Deploy each slice to deckd-app.roxai.click. Commit per slice.

## Evidence

`.vischeck-sweep/` holds the 15 raw shots. Re-run sweep anytime:
`node qa/deckd-visual-sweep.cjs` (needs the local server on 8085: `pm2 start deckd-app`).
