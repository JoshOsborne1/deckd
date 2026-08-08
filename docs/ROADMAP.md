# Deckd build roadmap

Status: 2026-08-08. Product: pass & play (free) + multiplayer lobbies (Deckd Master pass required to host, guests join free). BLE dropped from v1.

## Model assignments

| Model | Role in this project |
|---|---|
| **Luna** (gpt-5.6-luna, Codex) | All UI/frontend build work, component work, animation code, store screens. This is the executor. Best value top tier: 93% agentic coding, 84.3 terminal at $0.40/M. |
| **Sol** (gpt-5.6-sol, Codex) | Architecture decisions, multiplayer protocol design, final review of big slices. Reserved for serious intelligence, NOT routine UI (6% better than Luna on WebDev at 25x the price). |
| **DeepSeek V4 Flash** (default) | Chat, planning, docs, research, quick fixes, this roadmap. Legit agentic worker (82.7 terminal) at $0.11/M. |
| **Grok 4.5** | Market research, competitor analysis, app store copy research, pricing validation. |
| **GLM-5.2** | Backup for chat/planning when DeepSeek has issues. Strong at pure code gen (79.7 LiveBench coding). Weak at unguided terminal work (24.5 Terminal-Bench) — keep ops runbook-guided or reassign to Luna. |
| **Rive** (external tool) | Personified character animations. Not a model, but the animation runtime we adopt. |

Kimi K3 is NOT in the pool (per-token, not available on our plan). UI ranking that matters: Luna first for price/quality, Sol only if Luna visibly fails.

## Category: UI

### What exists
- Single-surface morph pipeline (home/hub/table/lobby/pass) with Reanimated, material-emphasized easing, reduce-motion support. This is genuinely good architecture.
- Home layer: hero CTA, store preview carousel, Deckd Master tile, sale row.
- Hub layer: preset picker, player count, options, deal CTA. 788 lines, dense.
- Table layer: opponents row, draw/discard wells, action bar, hand fan/stack, hand lock.
- Privacy veil + pass ritual: polished, hold-to-reveal.
- Store screen: catalogue, themes, passes (renamed to Deckd Master).
- Profile, settings, list (presets) screens. Global nav bar.
- Theme tokens: Plus Jakarta Sans, off-white/crimson, felt greens, radii/space/shadows.

### What needs to exist
1. **Aesthetic lift** (the vision check called it "utilitarian, not premium"). Felt needs texture/depth, cards need richer faces, home needs the clipped grey circle fixed and store preview spacing fixed.
2. **Lobby UI rebuild**: current LobbyLayer is BLE scan UI. Replace with: create lobby (join code display), join lobby (code entry), lobby room (players list, ready states, host controls). Host sees "Master" badge.
3. **Pass gating UI**: "Deal to friends" and "Invite nearby" buttons must route to the Master paywall, not a BLE lobby.
4. **Store pass cards**: rename "View bundle" buttons to "Get Deal pass" etc. Add pass tier comparison.
5. **Mobile QA pass**: 375px check, safe areas, 44px tap targets, no native select, no default browser controls.
6. **Empty states**: table empty state, lobby empty state, store empty state.

## Category: Animation

### What exists
- Surface morph (home↔hub) with staggered windows. Good.
- Deal entry transforms (deal.ts), hand fan/stack layout math (stack.ts). Worklet-safe.
- Pressable scale/opacity feedback on cards and buttons.
- Haptics everywhere via useMotion (light/medium/heavy/success/warn/error/select).

### What needs to exist
1. **Personified animations** (the ask). Rive runtime is parked; un-park it. Character: a card-back mascot (the Deckd logo mark) that reacts to game events: deals, flips, passes, wins.
2. **Deal sequence**: cards flying from deck to hands with stagger (deal.ts exists, needs wiring into a real deal animation on session start).
3. **Card move animations**: draw slide, discard slide+rotate, play lift+land. Currently instant state changes.
4. **Pass ritual animation**: veil slide, seal expand on reveal (planned in old build plan, not built).
5. **Win/end celebration**: simple confetti or mascot celebration.
6. **Lobby join animation**: player chips popping into the room.

## Category: Backend

### What exists
- Nothing. No server, no API, no database. The only "backend" is local MMKV storage.

### What needs to exist
1. **Lobby relay server** (the paid feature's backbone). Host = source of truth, guests send intents, host broadcasts events. Turn-based, so a simple relay suffices. No real-time infra needed.
2. **Join codes**: 6-char codes, room lifecycle (create, join, leave, close, timeout).
3. **Host auth**: verify Deckd Master pass server-side (RevenueCat webhook or receipt check) before allowing host mode.
4. **Deployment**: fits the existing roxai.click stack (Node + PM2 + Cloudflare tunnel). Node, not Python, to match the stack.
5. **RevenueCat integration**: API keys, products (deckd_master lifetime + 3 non-renewing passes), offerings, webhook for entitlement sync.

## Category: Multiplayer

### What exists
- Event-sourced engine (gameStore: events, seq, foldEvents, ingestRemoteEvents, applyRemoteSnapshot). This is the right foundation for multiplayer.
- Transport abstraction (lib/transport.ts) with BLE implementation. The abstraction is reusable; the BLE impl is dead weight for v1.
- networkTransport.ts is a stub (returns null).
- bleProtocol.ts wire messages (event_batch, guest_intent, ack, snapshot) — the framing is reusable for the relay.
- LobbyLayer is BLE scan UI, needs full rebuild.

### What needs to exist
1. **Relay transport implementation**: WebSocket client in the app, WebSocket server on the relay. Reuse the wire message framing (event_batch, guest_intent, snapshot, ack).
2. **Host flow**: create lobby → get code → guests join → deal → host broadcasts events → guests fold events locally.
3. **Guest flow**: enter code → join → receive snapshot → send intents → fold events.
4. **Reconnect/snapshot path**: guest rejoin gets full state from host.
5. **Turn privacy in multiplayer**: each player's hand is private to them; the relay must not leak other players' hands. Zone visibility already models this (private/public/hidden).
6. **Device matrix**: real end-to-end test on 2+ devices before claiming it works.

## Category: Game functions

### What exists
- Engine: 52-card deck + jokers, deterministic seeded shuffle (mulberry32), event-sourced state, zone visibility (public/private/hidden), presets (freeplay, deal 2, blackjack-ish, poker-ish), custom preset library (manifest DSL scaffold).
- Table: draw, discard, flip, reveal, reorder, pass turn, shuffle, end/reset, session history.
- Selectors: draw count, discard top, hand, opponents, turn state.

### What needs to exist
1. **Game rules for presets**: blackjack-ish and poker-ish are "ish". Decide what's actually enforced (win conditions, scoring) or rename them to "freeplay with N cards" to avoid promising rules that don't exist.
2. **Win/end flow**: session/end exists but no UI celebration or winner display.
3. **Custom rules DSL**: manifest scaffold exists but is not user-facing. Park unless asked.
4. **Engine tests**: zero tests exist. The engine is pure and deterministic, perfect for unit tests. Add jest + tests for foldEvents, presets, selectors, visibility.
5. **Auto-reshuffle discard**: config exists, verify it works.

## Category: Marketing

### What exists
- Deckd Master naming + verb-tier passes (Deal/Draw/Shuffle/Master).
- Store copy updated. Home tile updated.
- Old build plan board (deckd-kanban) with 50 tasks, 0% tracked. Stale.

### What needs to exist
1. **App store copy**: name, subtitle, description, screenshots. Needs the aesthetic lift first (don't screenshot the current flat UI).
2. **Pricing validation**: Grok research on comparable card game apps and pass pricing.
3. **Landing page**: roxai.click subdomain or standalone. Explains pass & play + Master hosting.
4. **Launch checklist**: store listing, privacy policy, terms, support contact.
5. **The growth loop**: host pays, guests join free. Make the invite flow shareable (join code + link).

## Category: Design

### What exists
- Theme tokens (colors, fonts, radii, space, shadows, motion).
- Felt background with rail/well/vignette.
- Card backs (brand, ink, premium gold), table themes (classic felt, dark oak, crimson luxe).
- Logo assets (Logo.png, Gameboard.png, Pass.png — Gameboard and Pass are unused).

### What needs to exist
1. **Design system pass**: one source of truth for components (CardButton, CardSection, PlayingCard) with variants documented.
2. **Card face redesign**: current faces are lucide icons + text. Premium card games use custom pip layouts, corner indices, face cards. Decide: custom SVG faces or keep minimal.
3. **Mascot design**: the personified character for animations. Needs a name, a look, and Rive files.
4. **Felt texture**: subtle noise/weave texture instead of flat color.
5. **Iconography**: consistent icon set (lucide is fine, but verify visual weight).
6. **Dark mode**: not in scope for v1 (userInterfaceStyle is light). Park.

## Tidy-up done (2026-08-08)

- Removed `deckdherm/` empty nested dir and `app.json.bak-sdk54` junk. Committed.
- Docs updated to Deckd Master direction (MVP_SCOPE, STATUS, AGENTS, README, PARKED_BLE).
- Store + home copy renamed from Deckd+ to Deckd Master.

## Tidy-up still needed

1. **Unused assets**: Gameboard.png (469KB), Pass.png (295KB) unused. Delete or wire in.
2. **BLE dead weight**: lib/ble.ts, lib/ble.web.ts, lib/bleProtocol.ts, lib/transport.ts (BLE impl), src/store/bleStore.ts, modules/deckd-ble/, react-native-ble-plx dep, BLE permissions in app.json, LobbyLayer BLE UI. Decision: keep the wire framing (reuse for relay) but strip the BLE transport. Park the native module dir.
3. **hasDeckdPlus**: rename to hasMasterPass across cosmeticsStore.
4. **Stale references**: store.tsx alert says "See MONETIZATION.md" which doesn't exist. Fix copy.
5. **CI branch**: workflow only runs on main; active branch is cleanup/ready-to-build. Either merge to main or update CI.
6. **Jest**: package.json has "test": "jest" but jest is not installed. Install or remove the script.
7. **expo-audio**: dependency present, zero usage. Either wire sound in (Phase 6 of old plan) or remove.
8. **deckd.code-workspace**: references C:/Users/JT_Os path. Update or remove.
9. **Old build plan board** (deckd-kanban, 50 tasks, 0%): superseded by this roadmap. Archive or delete.

## Suggested build order

1. Tidy-up items 1-9 (half a day, mostly mechanical).
2. Engine tests (jest) — locks in the foundation before multiplayer.
3. Lobby UI rebuild + relay transport (the paid feature).
4. Relay server on roxai stack.
5. RevenueCat products + pass gating.
6. Aesthetic lift + animation (Rive mascot, deal sequence).
7. App store copy + landing page.
8. Device matrix test, then launch.
