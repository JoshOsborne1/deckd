# Deckd design plan: a deck, not an app

Status: 2026-08-09. Josh's direction after rejecting the current cards, nav bar,
and game setup page. This plan supersedes the older "aesthetic lift" roadmap
items. It is the design thesis + product architecture for the game system.

---

## 1. The thesis: freedom needs recipes

Josh's words: "The game promotes freedom. It's a deck of cards — play how you
want, when you want, whenever you want. But too much freedom becomes a problem;
users need control & options."

The resolution is not less freedom, it's **structure that disappears when you
don't need it**:

- **Freeplay is the blank deck.** It stays one tap away, always. No rules, no
  setup, no friction. The deck on the table IS the freeplay state.
- **Presets are recipes.** A recipe is a small, readable definition of a game:
  deal pattern, allowed actions, turn order, win condition, helpers. Recipes
  give freedom a skeleton so the game can't fall apart.
- **The engine executes any recipe.** Games are data, not code. That one
  decision makes the whole product possible: a 20-game library, user-made
  games, and an AI generator all become the same thing — recipes.

The product metaphor is literal: you buy a deck, you pick a game, you play.
Deckd is the table, the deck, and the library. Everything else (store, passes,
suits) wraps that.

## 2. Design language: objects on a table, not UI on a screen

Every control should read as a physical object on the felt/paper table. The
rejected patterns: boxed cards with shadows (nav v1), a chrome bar (nav v2),
settings-form layouts (setup page), flat digital card faces.

Object classes we use:

| Object | Use | Looks like |
|---|---|---|
| Playing card | Cards, preset previews, store items | 2.5:3.5, paper grain, corner indices, real pips |
| Deck | The Deal action | Small stack of card backs sitting on the table, logo on top |
| Chip | Destinations, player count, small choices | Flat cylinder, 1px rim, engraved mark, label below |
| Token | Option toggles | Small round/hex token, press to flip state |
| Recipe card | A game in the library | Card back fanned; tap flips to face with name + one-liner |

No floating containers. No "pages". One continuous table surface, shared by
home, setup, table, lobby, pass. Navigation moves objects, not screens.

## 3. Cards: what's wrong and the fix

Current complaints: flat, digital, no texture, no physicality.

1. **Paper stock.** Face background warm ivory (`#FAF6EF` family, add token),
   with the same deterministic grain used by `FeltBackground` so faces are
   paper, not white rectangles. Faces get a soft 1px inner edge + a very
   subtle drop shadow only where the card overlaps another (stack depth),
   never floating shadows.
2. **Corner indices both corners** (rank + suit), plus real French pip layouts
   from the vendored SVGs (`vendor/card-fronts/` — hayeah + notpeter already
   in repo, licensed). Red = `#C43A3A`-family ink/crimson, black = warm ink
   `#2A2420`, not pure black/red.
3. **Court cards** get the classic frame + figure treatment from the vendored
   sources, recolored to the palette. No AI redraws, no gold (branding rule).
4. **Backs.** Default ivory/crimson logo back stays. Noir and Crimson backs
   (assets exist) wire into the picker. Backs are the same paper stock with
   the printed pattern — they should feel like the same physical deck.
5. **Motion.** Keep the existing deal stagger, draw spring, discard pulse,
   FlipCard. Add: dealt cards land with a 1-2px settle (tiny spring after
   landing). Verify at 375px and desktop; no overlap, no jitter, no clipping
   (directive 1 stays the P0 gate).

## 4. Nav: chips on the table edge

Rejected twice: card shells, then a rail bar. Both read as "a bar". New
concept — **the table edge**:

- No nav bar. The bottom of the screen is the table's physical edge, a thin
  felt lip (4-6px ivory/crimson rule, no container).
- **Four chips sit on the edge**: Home, Store, Presets, Profile. Chip = flat
  cylinder (circular, 1px rim, engraved lucide mark, tiny label under it),
  44px+ target, no shadow unless active.
- **Active chip** is raised ~4px with a soft shadow + colored rim (crimson).
  Press = chip presses INTO the felt (scale 0.96, quick spring). Inactive =
  flush with the felt, muted ink.
- **Deal is not in the nav.** Deal is the deck: a small stack of 2-3 card
  backs (logo on top) sitting on the table, center-bottom, just above the
  edge. Tap = deal animation into the table. It's an object, not a button.
- Appear animation: chips deal-in from the edge one by one (stagger 40ms,
  spring), reduce-motion = plain fade. The deck object is always present.
- Works on all surfaces (home, setup, table, store, profile, lobby, pass).
  Game surfaces keep their reserve height — the edge is part of the table.

## 5. Setup page: staging the deck

Rejected: current HubLayer reads as a settings form ("Choose the table
recipe", chips in rows, options toggles, CTA buttons). The redesign is a
**deal-prep ritual on the felt**:

1. **Recipe cards fanned on the felt.** Presets are card backs (each preset
   already maps to a back: freeplay = brand, deal-2 = crimson, blackjack =
   noir, poker = crimson). A fan of 4-5 backs; tap one → it flips and slides
   forward showing name, one-line description, player range. Selected recipe
   stays flipped; others rest as backs.
2. **Player count = chips.** A small row of chips (2-6) placed on the felt;
   selected chip is raised + colored rim. Same chip language as the nav.
3. **Options = tokens.** Include jokers, fan style (wide/tight/stack),
   auto-reshuffle — as physical tokens that flip state, not switches in a row.
   Recipe-specific options appear only when the recipe needs them (e.g.
   blackjack: dealer toggle, decks count).
4. **The deal.** The same deck object from the nav sits on the felt, bottom
   center. "Deal now" IS the deck. Tap it → cards fly to hands (existing
   stagger). "Host a lobby" becomes a chip/token beside the deck: "This table
   with friends" — same recipe picker is used by lobby hosts; guests see the
   chosen recipe when they join.
5. **No page look.** The hub morph stays (home ↔ hub), but the surface is the
   table: felt, rail, well, vignette — same as the play surface. Setup and
   play are one continuous space; dealing from setup lands you in the game
   without a page transition (directive 7 stands).

## 6. Recipe architecture (the unlock)

Current: `Preset.setup()` is code. 4 presets. Adding a game = writing code +
re-testing. To get a library + user games + AI generation, presets become
**data**, executed by the engine.

### Recipe schema v1 (data, not code)

```ts
interface Recipe {
  id: string;
  name: string;
  oneLiner: string;           // "Match the suit or rank. Eights are wild."
  minPlayers: number;
  maxPlayers: number;
  backs: string[];            // which card back(s) represent this recipe
  deal: {
    pattern: 'roundRobin' | 'perPlayer' | 'none';
    rounds: number;           // cards per player per round
    face: 'up' | 'down' | 'upDown' | 'mixed';
    to: 'hand' | 'table';     // face-down to table = community later
    dealer?: boolean;         // blackjack-style dealer hand
  };
  actionPolicy: {
    allowDraw: boolean;
    allowDiscard: boolean;    // any discard vs match rule
    matchRule?: 'suitRank' | 'rank' | 'suit' | 'sevenAround' | 'none';
    allowFlip: boolean;
    allowPassTurn: boolean;   // false = everyone acts every round
    allowAsk?: boolean;       // Go Fish style ask-player
    allowPlay?: boolean;      // play to table zone (poker-style)
  };
  turnPolicy: 'roundRobin' | 'dealerFirst' | 'free';
  winCondition: 'none' | 'firstEmptyHand' | 'scoreTarget' | 'lastHolding';
  helpers?: {
    showHandSum?: boolean;    // blackjack
    rankHand?: boolean;       // poker hand ranking
    scoreMelds?: boolean;     // rummy/cribbage scoring
    countPairs?: boolean;     // old maid / go fish pairing
  };
  variants?: { jokers?: boolean; wilds?: string[]; targetScore?: number };
}
```

v1 recipes cover: War, Go Fish, Old Maid, Crazy Eights, Sevens, President-lite,
Blackjack (with dealer), Texas Hold'em shell (community table), Rummy-lite
(manual melds + score helper), 31/Blitz. Trick-taking primitives (follow suit,
trump, trick winner) are recipe v1.5 — one schema addition, then Hearts,
Spades, Euchre, Oh Hell unlock.

### Migration

- `presets.ts` refactors to: schema types + `executeRecipe(recipe, input)`
  replacing each `setup()` body. The 4 existing presets become the first 4
  recipes (identical behavior — all existing engine tests must stay green).
- `customPresets.ts` (manifest DSL scaffold, already exists) upgrades to the
  schema. User presets are recipes saved locally.
- New actions needed by recipes: `card/ask` (Go Fish), `card/claim` (Cheat),
  match-rule validation on discard, trick capture. Each is a small engine
  addition behind the schema flags.

## 7. Game library (52-card classics, turn-based, pass-and-play friendly)

Simultaneous-reaction games (Snap, Egyptian Ratscrew, Speed) are out for
pass-and-play v1.

### Free tier (v1, simple rules, zero engine risk)
1. Freeplay (exists)
2. Deal 2 each (exists)
3. War (2p) — flip, compare. Kids + quick rounds.
4. Go Fish (2-6) — ask/collect. Needs `card/ask`.
5. Old Maid (2-8) — joker = maid, pair-and-pass. Natural pass-and-play.
6. Crazy Eights (2-7) — match suit/rank, eights wild. `matchRule: suitRank`.
7. Sevens / Fan Tan (3-8) — shedding around the 7s.

### Premium tier (full rules + helpers, the paid library)
8. Blackjack (2-7) — full dealer: draw-to-16/stand-on-17, dealer on/off
   toggle, hand sum helper, soft ace handling. **Josh's explicit ask.**
9. Texas Hold'em (2-10) — community cards, optional blinds/chips, hand
   ranking helper, no rule enforcement beyond deal order (matches current
   "shell" direction, upgraded to full table play).
10. Rummy (2-6) — melds/runs, score helper, draw+discard.
11. Gin Rummy (2) — knock + deadwood scoring.
12. Hearts (3-6) — trick-taking, avoid hearts + queen of spades.
13. Spades (4) — bidding UI + partner logic (v1.5 engine).
14. Euchre (4) — trump, partner (v1.5 engine).
15. Cribbage (2-4) — pegging board + scoring helper (strong fit: helper
    pattern already proven with blackjack).
16. President (3-6) — shedding with rankings.
17. Cheat / Liar (2-6) — bluff claims (v1.5: `card/claim`).
18. 31 / Blitz (2-8) — push-your-luck, 3 cards + draw.
19. Five-card draw (2-6) — discard/replace round.
20. Pontoon (2-6) — UK blackjack variant (cheap: blackjack recipe + toggles).

### Later (heavy: bidding/partnership/complex scoring)
Bridge, Whist, 500, Canasta, Big Two, Oh Hell.

### Solitaire singles (free, "whenever you want" solo moments)
Klondike, FreeCell, Pyramid, Golf. One shared draw/flip engine + 4 layouts.
Strong fit for the "play when you want" part of the thesis.

## 8. AI game generator: suits as credits

Josh's idea, sharpened: **a hosted endpoint (the relay already exists on the
RoxAI stack) that takes a plain-English prompt and returns a validated
recipe.** Not a custom-trained model — a cheap hosted LLM (Nous/Grok family)
prompted with the schema, output validated against it before it becomes a
playable recipe.

- **Prompt**: "a 2-4 player game where you collect pairs and the person with
  the most pairs wins" → LLM emits recipe JSON → schema validator rejects
  anything the engine can't run → user saves it to their preset library.
- **Suits = the currency.** One suit = one generation. Earn: 1 free suit per
  day (never hard-gates — preview-mode rule stands). Buy: suit packs in the
  store (e.g. 5 suits £1.99, 15 suits £4.99). Master pass includes unlimited
  generation — the "creator" perk.
- **Safety rails**: validator is the guard (no arbitrary code, schema only),
  generation rate-limited per user, generated recipes are tagged "AI-made"
  until the user plays them once and confirms they work (then it's theirs).
- **Why it works as monetization**: the recipe builder is free, so power
  users can hand-build any game. Suits sell convenience + imagination: "make
  me a game about..." beats a blank form. Same pattern as Cursor's composer
  vs raw prompting — the wrapper is the product.

## 9. Monetization map

| Surface | Free | Paid |
|---|---|---|
| Freeplay + deal-2 + War + Go Fish + Old Maid + Crazy Eights + Sevens | ✓ | |
| Premium library (blackjack full, hold'em, rummy, hearts, spades, cribbage…) | | per-recipe unlock or Master pass |
| Lobby hosting | | Deckd Master pass (existing) |
| AI generator | 1 suit/day | suit packs; unlimited with Master |
| Custom recipe builder | ✓ (local) | |
| Cosmetics (backs, tables) | preview-unlock taps | purchases (existing store) |

Preview-mode rule (directive 10) is unchanged: nothing hard-locked, locks
visual only, everything testable.

## 10. Build order

1. **Visual pass (now, Luna loop)**: cards (paper stock, indices, grain),
   nav (chips + deck object), setup page (recipe fan on felt). Directives
   updated; ship + verify at 375px.
2. **Recipe schema** (engine): types, `executeRecipe`, migrate 4 presets,
   all 62 tests stay green.
3. **Free library**: War, Go Fish, Old Maid, Crazy Eights, Sevens — each a
   recipe + tiny engine addition (`card/ask`, match rules).
4. **Full Blackjack + Hold'em** (Josh's explicit priority): dealer toggle,
   hand helpers, community table.
5. **Premium library push**: Rummy, Gin, Hearts, Cribbage, President, 31,
   Pontoon, Five-card draw. Trick-taking v1.5 (Spades, Euchre, Oh Hell).
6. **AI generator**: relay endpoint, schema validator, suit credits, store
   packs, Master perk.
7. **Solitaire singles** + lobby game-picker polish + real 2-device test.

Each slice: typecheck, lint, jest, expo-doctor, deploy preview, verify 375px.

---

Source of truth notes: this plan is the design/product authority; the LOOP
directives doc gets the actionable slice directives; STATUS.md keeps the
verified-state log. Conflicts: this plan wins over ROADMAP.md aesthetic-lift
items; PREVIEW MODE rule and branding rules (logo from canonical asset, no
gold) always stand.
