# Deckd Animation Pass — per-game spec (Josh, 2026-08-12)

Josh's directive: **"It's not a 1 does all."** Every game gets its own
animation treatment. This doc is the contract the animation lanes build
against. Shared foundation first (one system), then per-game passes.

Priority: P0. Built by Luna (framework + drag & drop + transitions) and
GLM-5.2 (per-game passes) in parallel lanes. Monetisation untouched.

---

## 0. The complaints → the fixes

| Complaint | Fix |
|---|---|
| "Buttons like 'play 6' instead of dragging the card" | Card hold + drag & drop replaces the rule-action rail wherever a card is the object (crazy eights, sevens, klondike/freecell, go fish plays). Buttons stay ONLY for non-card actions (fold/check/call/raise, host street controls, pass). |
| "Broken viewports, overlapping buttons" | P0 gate (directive 1): every surface clean at 375×812 AND 1440×900. Action rail only when needed, no overflow, no clipped text. |
| "Page transitions" | One continuous felt space: hub→table = deal lands you in play, lobby→table = morph, store/profile = felt drawers. No page pops anywhere. |
| "Individual custom game animations" | Per-game pass below. |

---

## 1. Shared foundation (Luna lane: deckd-para-anim-fx)

### 1.1 CardHold + drag & drop (the big one)
- New component `CardDragHandle` / hook `useCardDrag`: react-native-gesture-handler
  Pan gesture on hand cards when `rules.canDrag(state, cardId)` is true.
- Pick: card lifts (scale ~1.08, shadow grows, zIndex to top), haptic 'light',
  slight rotate follows drag. Hold threshold ~120ms / 6px before lift so taps
  still work.
- Drag: card follows finger 1:1, snaps rotation to 0 while airborne.
- Drop targets: zone surfaces (table center, foundation, suit runs, books
  piles) highlight when hovered (felt glow ring, 1px crimson).
- Land: spring to target slot with 1-2px settle (same physics as deal).
- Cancel (drop outside target): spring back to hand slot, haptic 'soft'.
- Reduced motion: drag still works but no lift/rotation, snap instead of
  spring.
- Accessibility: drop targets remain reachable via an action fallback
  (long-press menu) so DnD is never the ONLY way to play.

### 1.2 Move choreography (used by every game)
- `CardFlight`: absolute-positioned overlay that animates a card from A to B
  (withTiming/withSpring on translateX/Y + rotate + scale). Deck → hand, hand →
  table, hand → discard, table → foundation.
- Deal: cards fly from the deck object to hand slots, 40ms stagger, spring
  settle (1-2px), haptic per 3rd card.
- Discard: short arc + 8-12° rotation into the discard pile, settle.
- Flip: existing FlipCard, ensure used for every reveal.

### 1.3 Page transitions (one felt space)
- Extend SurfaceMorph: hub→table (deal lands, no page swap), lobby→table,
  home→hub already exists.
- Store/profile/settings become felt drawers (slide over surface with
  dimmed felt, table edge visible above), NOT routes.
- Felt-sweep kept as the direction cue; reduce-motion = cross-fade.
- NAV reserve respected on every surface.

### 1.4 Win celebration + pass ritual
- Win: card burst (6-10 cards fan outward from winner's pile) + banner
  spring; haptic 'success'. Per-game variant hooks (see per-game).
- Pass ritual: veil slide + seal expand (exists planned), add hand-over card
  arc to the next player.

---

## 2. Per-game passes (GLM lane: deckd-para-anim-games)

### 2.1 Freeplay / Deal 2
- Fan spread on deal with stagger, reorder = wiggle on lift, discard pulse.
- No win state — session-over gets a gentle table clear (cards sweep to deck).

### 2.2 Blackjack
- TWIST: card slides from the shoe edge (deck object), lands with settle.
- Dealer auto-play: cascade, one card per 250ms, dealer flips hole card with
  FlipCard.
- Bust: hand cards shake (x ±3px, 3 cycles) + crimson flash on value pill.
- Hand over: winner cards pop scale 1.06, banner springs in.

### 2.3 Poker / Hold'em
- Burn: card slides to side muck with 90° rotate.
- FLOP: 3 cards fan open from deck (middle card first, wings after, 80ms).
- TURN/RIVER: slide in + small settle.
- Showdown: reveal cascade (each card flips 200ms apart), best-hand pill
  pulses crimson.
- Bet action: pot chips pulse scale 1.04 on CALL/RAISE.

### 2.4 War
- FLIP: both cards FlipCard simultaneously; BATTLE slam (scale 1.1 → 1.0,
  fast spring, haptic 'heavy').
- Win pile: sweep arc of cards from loser to winner with 30ms stagger.

### 2.5 Go Fish
- ASK: a token (fish pip) arcs from asker to target, target's cards rustle
  (hand wiggle).
- Pair: both cards fly to the player's book pile, land stacked, settle.
- Book: FeltStack pulses + label pops.

### 2.6 Old Maid
- Pass: card arcs from hand to next player's hand (hot potato, quick arc).
- Pair: cards merge mid-air then land on book pile.
- Maid reveal: card flips slowly (600ms), held pause 400ms, then gasp pulse
  on the holder's hand.

### 2.7 Crazy Eights
- Play by DRAG (foundation 1.1): card slides to center, suit-change ring
  pulse when an 8 is played (crimson ring expands + fades).
- Draw-until-playable: cascade of draws with 60ms stagger, unplayable cards
  arc to discard.

### 2.8 Sevens
- Seven opens: card deals to center with a ring pulse (game starts).
- Runs: played cards snake out left/right with 90ms slide per card.
- Pass: chip slides to next player.

### 2.9 Klondike
- Full drag & drop: stacks lift as a unit, cascade deal (12 cards, 50ms
  stagger), foundation snap with settle, win = cascade of cards to
  foundations + banner.

### 2.10 FreeCell
- Drag & drop singles/stacks, column fan spread on drop, auto-move to
  foundation = card flies + settle.

### 2.11 Pyramid
- Deal: pyramid fan from bottom row up (3 rows, 80ms per row).
- Pair: two cards fly toward each other, merge mid-air, land on discard.

### 2.12 Golf
- Flip reveal with settle, matched pair pulse, round end = table clear
  sweep.

---

## 3. Reduced motion (every pass)
- All springs → plain fades/snaps. No arcs, no slams, no shake. Haptics stay
  (they're not motion). Verified via the reduce-motion QA script.

## 4. Quality gates (every slice)
- typecheck, lint, jest, expo-doctor, 375px + desktop visual QA, deploy to
  deckd-app.roxai.click.
- Drag & drop must have a non-DnD fallback (accessibility).
- No new deps beyond gesture-handler + reanimated (already installed).

## 5. File ownership
- anim-fx lane: components/CardDrag*, lib/motion.ts additions, SurfaceMorph,
  app layout transitions, drawers.
- anim-games lane: TableLayer per-game render branches, rules.ts action
  specs (drag metadata), game-specific components. DO NOT touch each other's
  files. Both avoid the main card's in-flight files until Crazy Eights lands.
