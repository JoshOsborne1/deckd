# Deckd parked ideas (not building yet)

Status: 2026-08-09. Josh's direction: gameplay + visuals FIRST. Everything
below is designed or brainstormed but deliberately NOT in the immediate build.
This file exists so no idea is lost. Revisit after the game library + visuals
are right.

## Monetization routes (all designed, none built yet)

- **Suits as credits** (Josh's idea): 1 free suit/day; suit packs in store
  (e.g. 5 suits £1.99, 15 suits £4.99); Master pass = unlimited generation.
  Hosted LLM endpoint (relay stack) prompts a recipe schema; validator
  rejects anything the engine can't run. Generated recipes tagged "AI-made"
  until played once. Builder stays free — suits sell convenience.
- **Premium library paywall**: per-recipe unlock vs Master pass bundle.
  Free tier: Freeplay, Deal 2, War, Go Fish, Old Maid, Crazy Eights, Sevens.
  Premium: Blackjack, Hold'em, Rummy, Gin, Hearts, Spades, Euchre, Cribbage,
  President, 31, Pontoon, Cheat, Five-card draw.
- **Deckd Master perks expansion**: hosting (already the v1 paid feature) +
  unlimited AI generation + all premium recipes.
- **Cosmetics**: existing store (backs, tables) — preview-unlock taps stay,
  purchases are placeholder until RevenueCat keys exist.

## Game library (designed, deferred)

- Full recipe schema (`docs/DESIGN_PLAN.md` §6) — presets become data.
- Free v1: War, Go Fish, Old Maid, Crazy Eights, Sevens.
- Premium v1: Blackjack (full dealer + toggle), Texas Hold'em (community +
  hand ranking helper), Rummy, Gin Rummy, Cribbage, President, 31/Blitz,
  Pontoon, Five-card draw, Cheat.
- Trick-taking v1.5 (engine addition): Hearts, Spades, Euchre, Oh Hell, Whist.
- Heavy/partnership later: Bridge, 500, Canasta, Big Two.
- Solitaire singles (free, "play when you want"): Klondike, FreeCell,
  Pyramid, Golf — one shared draw/flip engine + 4 layouts.
- Out of scope for pass-and-play: Snap, Egyptian Ratscrew, Speed
  (reaction-based).

## Product ideas (not yet specced)

- **Custom rules DSL / recipe builder UI**: manifest scaffold exists
  (`src/engine/customPresets.ts`); user-facing builder is post-library.
- **Rive mascot animations**: personified card-back mascot reacting to
  deals/flips/wins. Rive runtime parked.
- **Win/end celebration**: confetti / mascot moment on win condition.
- **Lobby join animation**: player chips popping into the room.
- **Invite share links**: join code + link for the growth loop
  (host pays, guests join free — the viral surface).
- **App store copy + screenshots**: needs the new visuals first.
- **Pricing validation research**: Grok comparison of card-game app pricing.
- **RevenueCat/IAP config**: keys, products, offerings, webhook entitlement
  sync. Empty placeholders today (preview-mode rule: nothing hard-locked).

## Tech debt / tidy-up (carried from ROADMAP.md, still open)

- Delete/wire unused assets: `Gameboard.png` (469KB), `Pass.png` (295KB).
- Strip BLE dead weight: lib/ble.ts, bleProtocol.ts (keep framing — reuse
  for relay), bleStore, native module, BLE permissions, LobbyLayer BLE UI.
- `hasDeckdPlus` → `hasMasterPass` rename across cosmeticsStore.
- Store alert copy references nonexistent MONETIZATION.md — fix.
- CI only runs on main; active branch is cleanup/ready-to-build.
- expo-audio dep unused (wire sound or remove).
- deckd.code-workspace references C:/Users/JT_Os path.
- Old deckd-kanban board (50 tasks, stale) — archive/delete.
- npm audit warnings need breaking Expo/RN upgrade — park until intentional.
- CI actions Node 20 deprecation — bump checkout/setup-node to v5 in a quiet
  moment.
