# Deckd Physical Card Rebuild Blueprint

**Prepared:** 2026-08-23 20:10 BST  
**Status:** prepared, not implemented  
**Baseline:** `cleanup/ready-to-build` at `2075551`  
**Product thesis:** Deckd is not a card-game app. It is a deck of cards living on phones.

### Fixed technical context

- Expo SDK 54, React Native 0.81.5, React 19.1 and TypeScript strict
- Reanimated 4.1.1, Worklets 0.5.1 and Gesture Handler 2.28.0 are exact Expo Go 54 compatibility pins; do not float them during this rebuild
- Zustand + MMKV remain the local state/persistence layer; the framework-free engine remains in `src/engine/`
- cloud multiplayer currently runs through the Node/`ws` relay at `relay.roxai.click`; previews run at `deckd-app.roxai.click` under PM2
- visual tokens remain the existing warm system: shell `#FAFAFA`, crimson `#B02020`, ivory table `#F8F6F1`, rail `#D8D2C6`, well `#EFEBE2`; new components consume theme tokens rather than adding raw colours
- Nearby support requires a development/release client and a local Expo module. Generated `ios/` and `android/` folders are never hand-edited

## 1. Decision

This is a controlled gameplay rebuild, not another UI pass.

Keep the parts that are genuinely useful:

- deterministic, framework-free game engine
- event log and seeded setup
- recipient-filtered hidden information
- relay protocol, reconnect, ACK and gap recovery work
- card artwork, table materials, audio, haptics and accessibility groundwork
- existing rule implementations as behaviour references and regression fixtures

Replace the gameplay presentation and the mode model:

- remove button-first card actions from the visible play experience
- stop putting every mode into `SessionMeta.mode`
- stop duplicating the same shell, utility rail, viewer logic and online dispatch in every game table
- stop animating state changes independently inside each screen
- build one physical-card interaction grammar, one authoritative session runtime, four presentation profiles, then compose each game deliberately from those primitives

Do not rewrite the whole app in one branch. The current build remains usable while the new runtime is built behind an internal Card Lab and migrated game by game.

## 2. Why the current approach missed

The repo already contains good local fixes, but the architecture still encodes the wrong product model.

### Evidence from the current source

- `components/layers/TableLayer.tsx` is 2,208 lines and still owns game selection, viewer identity, online dispatch, utility chrome, game-specific rendering and generic fallbacks.
- Dedicated tables repeat the same header, lobby identity logic, utility rail, end-session alert, history sheet and rules sheet. A search found 71 repeated shell occurrences across game layers.
- Crazy Eights is the closest surface to the intended product, but even it has a large conventional app shell around the physical cards.
- War still ends in a large `FLIP` button rather than moving the top card from the pile into the battle area.
- Go Fish still renders a row of rank buttons instead of using a card from the player's hand as the question and the opponent as the target.
- Blackjack and poker still express important play through action rails.
- Animation is mostly inferred from changed state inside each component. The engine knows what happened, but no shared choreography layer converts an event into one continuous physical journey.
- `SessionMeta.mode` conflates transport, authority, privacy/viewer identity and surface layout (`pass`, `solo`, `ble-host`, `online-guest`, etc.). That makes every new mode branch through engine and UI code.
- The existing pass-and-play, online and parked table-phone ideas are treated as different products when they are really different projections of the same table state.

### Root cause

We started from screens and game-specific buttons, then added gestures. We need to start from cards, piles, hands, people and visibility, then let screens emerge from those rules.

## 3. First-principles reconstruction

Method: **First Principles**, from Aristotle's *protai archai*, with Chesterton's-fence checks before removing established controls.

### Constraints that are actually load-bearing

| Constraint | Type | Consequence |
| --- | --- | --- |
| A physical card has identity, face, location, orientation and stack order | informational | These properties belong in the canonical state or presentation state, not ad-hoc component state. |
| A player may know information another player must not know | informational | Every surface receives a viewer-specific projection. Never render then hide secret data. |
| A card move must be legal according to the game | informational | Legality stays in the engine. Gesture code never contains game rules. |
| Touchscreens have no tactile edges and fingers obscure content | physical | Large hit regions, lift offset, haptics, target magnetism and reversible gestures are required. |
| Nearby and internet delivery can duplicate, reorder or drop messages | physical/informational | Intents and events need IDs, ordering, acknowledgements, snapshots and idempotency. |
| Two people looking at one phone cannot have cryptographic visual privacy | physical | Split-board privacy is a human cover-and-hold ritual, not a false security claim. |
| Different games arrange the same objects differently | informational | Shared primitives, unique game compositions. Never a single universal game layout. |

### Assumptions we can discard

| Current assumption | Category | Replacement |
| --- | --- | --- |
| Every legal move needs a visible button | conventional | Objects are the controls. Drag, drop, draw, flip, take and target directly. |
| Every game needs its own full-screen shell | historical | One table shell and utility drawer; each game supplies only its composition. |
| Multiplayer mode belongs in game state | conventional | Separate authority, transport, surface profile and seat binding. |
| A tap is always the simplest card action | pedagogical | Drag is primary where the real action is moving a card; tap remains an accessible/fatigue fallback. |
| Automating all tabletop chores improves play | historical | Preserve meaningful dealing, passing, revealing and collecting rituals. Automate bookkeeping, not social rhythm. |
| Animations can be inferred independently by each component | historical | Canonical events feed one choreography coordinator and zone registry. |
| BLE is a product architecture | conventional | “Nearby” is the product capability. The radio is an implementation detail. |

## 4. Product principles

1. **Objects are controls.** If the action concerns a card or pile, manipulate that card or pile.
2. **One gesture vocabulary everywhere.** A card lifts, follows, targets, lands and cancels the same way in every game and mode.
3. **Shared primitives, bespoke tables.** Crazy Eights, War and poker must not look or play like reskins, but they use the same card, hand, pile and motion contracts.
4. **Minimum chrome.** During play, persistent UI is limited to turn state, connection state when relevant, and one utility affordance. Rules, history, undo and end-table live in a drawer.
5. **Preserve the ritual.** Dealing, passing, revealing, collecting a trick/book and moving chips are part of the fun, not loading animations.
6. **State first, motion second.** The engine commits an event; the choreography presents it. Animation never becomes authority.
7. **Private by projection.** A surface receives only what its role and viewer may know.
8. **Failure is visible and recoverable.** Invalid drops return cleanly. Network loss freezes committed state and explains recovery without discarding the table.
9. **Accessibility is a parallel input, not visible duplicate UI.** VoiceOver/TalkBack actions and a long-press action sheet dispatch the same typed intent.
10. **Feel is a release-device gate.** Browser QA proves layout and deterministic state. It cannot sign off touch, haptics or frame pacing.

## 5. The shared physical-card grammar

These are product-level interactions, not game actions such as `play:8H`.

### 5.1 Card lifecycle

Every interactive card uses the same state machine:

```text
resting
  -> pressed            immediate 0.98 feedback
  -> lifted             hold threshold met; card clears finger and siblings
  -> dragging           follows finger 1:1 on UI runtime
  -> targeting          nearest legal zone gains magnetic emphasis
  -> committed          intent accepted; event owns the landing journey
  -> resting in target

From dragging:
  -> cancelled          no legal target / gesture cancelled / engine rejects
  -> spring home
```

Requirements:

- visual response begins on press-in, not after release
- hold threshold is short enough to feel direct but does not steal horizontal hand browsing
- preserve the original finger-to-card grab point so pickup never makes the card jump
- lifted card offsets above the fingertip so rank/suit and target remain visible
- hit-testing uses the card centre plus velocity direction, not the top-left corner
- legal targets are present before drag and strengthen on approach; hover is never the only affordance
- target magnetism expands the effective drop region without visibly enlarging it
- in-hand reordering opens a live insertion gap; it never demands a pixel-perfect drop between overlapped cards
- release can be interrupted until the engine commits
- one light haptic on lift, one on a successful snap, one soft/error response on rejection, never per frame
- reduced motion keeps lift state, target colour and commit feedback but removes flight, rotation and overshoot

### 5.2 Primitive interactions

| Primitive | Primary gesture | Typical use | Accessible/fatigue fallback |
| --- | --- | --- | --- |
| `moveCard` | hold and drag card to legal zone | play/discard, tableau moves, community placement | card action sheet listing legal targets |
| `drawCard` | drag or short downward pull from top of deck toward hand | Crazy Eights, Go Fish, free play | tap deck / “Draw” accessibility action |
| `flipCard` | tap a legal face-down card | War reveal, tableau reveal, community reveal | “Flip card” action |
| `takePile` | lift top card or stack grip and drag to destination | tricks, discard pickup, War spoils | “Take pile” action |
| `reorderHand` | drag lifted card laterally within fan | hand organisation | Move left/right accessibility actions |
| `moveStack` | hold exposed lead card and drag the legal run as one body | Klondike/FreeCell | target action sheet |
| `askWithCard` | drag a card/rank from hand toward an opponent seat; card returns after commit | Go Fish | “Ask [player] for [rank]” action |
| `drawFromPlayer` | drag the exposed back from another player's fan to your hand | Old Maid | “Draw from [player]” action |
| `passTurn` | slide the turn token toward the handoff edge, or complete an action that automatically ends turn | free play / exceptional passes | Pass action in utility drawer |
| `moveChips` | drag a chip stack to the pot or amount rail | poker call/raise | betting action sheet |
| `foldHand` | drag the two hole cards face-down to the muck | poker | Fold action |

### 5.3 Game examples without “Play 8”

- **Crazy Eights:** drag a matching card onto discard. Pull from the deck when no card is playable. Dragging an eight opens a compact suit chooser attached to the landing card, not a global action rail.
- **War:** drag the top face-down card from your pile into your side of the battle well. The opponent/house contribution lands as the paired event. Reveal happens on commit. No FLIP button.
- **Go Fish:** drag any rank represented in your hand toward an opponent. The card springs home while the ask event transfers matching cards or enables the deck draw.
- **Sevens:** drag a card into the matching end of its suit run. Targets exist only at legal run ends.
- **Old Maid:** pull one card back from the opponent's concealed fan. It crosses into your hand, reveals only to you, and an automatic pair collection follows if applicable.
- **Blackjack:** pull from the shoe into the hand to hit. A small physical “stand” marker remains because standing is not a card move; it is the only persistent non-card decision.
- **Poker:** drag hole cards to muck to fold; drag chips to pot to call/raise; tap the felt/check marker to check. Community dealing belongs to the dealer/table role, not player action buttons.

## 6. Card Lab before any game rebuild

Create an internal-only `Card Lab` surface. This is the first deliverable and the quality gate for all later games.

It must exercise:

1. fan browsing with 2, 5, 10 and 20 cards
2. hold/lift/drag/drop from hand to pile
3. deck-to-hand draw
4. invalid drop and interruption reversal
5. in-hand reorder
6. stack move
7. card flip
8. pile collection
9. privacy veil and pass ritual
10. two mock viewports showing one synchronized cross-device transfer
11. reduced-motion, screen-reader and large-text paths
12. slow-render stress mode with JS deliberately busy while the drag remains smooth

No game migration begins until these interactions pass release builds on the minimum supported iPhone and Android target.

## 7. Target architecture

### 7.1 Separate four concerns currently called “mode”

```ts
type Authority =
  | { kind: 'local' }
  | { kind: 'nearby-host'; peerId: string }
  | { kind: 'cloud-server'; roomId: string };

type TransportKind = 'in-process' | 'relay' | 'nearby';

type SurfaceProfile =
  | 'hot-seat'
  | 'personal-table'
  | 'dual-end-board'
  | 'public-table'
  | 'private-hand';

type SeatBinding =
  | { kind: 'single-seat'; playerId: string }
  | { kind: 'shared-device'; playerIds: string[] }
  | { kind: 'table-only' };
```

The canonical game state does not care which transport or surface is attached.

### 7.2 Layers

```text
Game Definition
  rules, setup, legal intents, win condition
        |
Authoritative Game Core
  deterministic reducer + event log + snapshots
        |
Session Runtime
  validates intents, commits events, sequencing, reconnect
        |
Projection Layer
  public/private/hidden cards -> role-specific view model
        |
Presentation Adapter
  hot-seat | personal | dual-end | table-only | hand-only
        |
Game Composition
  unique zone arrangement made from shared card primitives
        |
Physical Interaction + Choreography
  gestures, zone registry, event-driven flights, haptics, audio
```

### 7.3 Typed intent model

Replace string actions such as `play:H-8` as the UI contract.

```ts
type GameIntent =
  | { id: string; type: 'card.move'; actorId: string; cardIds: string[]; from: string; to: string; toIndex?: number }
  | { id: string; type: 'pile.draw'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'card.flip'; actorId: string; cardId: string }
  | { id: string; type: 'hand.reorder'; actorId: string; cardId: string; toIndex: number }
  | { id: string; type: 'pile.take'; actorId: string; pileId: string; to: string }
  | { id: string; type: 'player.target'; actorId: string; sourceCardId?: string; targetPlayerId: string; verb: string }
  | { id: string; type: 'turn.pass'; actorId: string }
  | { id: string; type: 'choice.commit'; actorId: string; choiceId: string; value: string };
```

`legalIntents(state, actor, surfaceRole)` returns source objects, legal targets and concise labels. The UI uses geometry and affordances; the engine remains the only legality authority.

### 7.4 Events and choreography

Keep events serialisable and deterministic, but add enough semantics to animate correctly:

- stable transaction/action ID grouping all events caused by one intent
- source and destination zone IDs on every card movement
- reveal reason and audience where required
- collection/group metadata for tricks, books and runs
- monotonic sequence and schema version
- optional presentation cue (`deal`, `draw`, `discard`, `collect`, `reveal`, `muck`) that does not affect reduction

A `CardMotionCoordinator` consumes committed events. It asks a `ZoneRegistry` for measured source/target geometry and creates flights on one absolute overlay. If geometry is unavailable, it uses a short opacity handoff rather than guessed coordinates.

State applies immediately. The motion layer temporarily owns the moving card's presentation until landing, preventing duplicates and teleportation. Reconnect/snapshot hydration never replays stale choreography.

### 7.5 Projection and hidden information

- Canonical card IDs remain inside the authority boundary.
- Every client receives opaque per-viewer card IDs until a reveal makes the identity legal.
- Public table clients receive no private hand identities.
- Private hand clients receive their hand plus public state, not other hands or deck order.
- Dual-end local mode can hold both hands in memory because the device is the authority, but only the held/covered end renders faces.
- Internet rooms move authority into the relay/server process. A paying host should not be able to inspect the full deck from its client.
- Nearby rooms remain honest-host by necessity; the UI and product copy treat them as trusted, same-room play.
- Recipient filtering happens before serialisation. Event logs, snapshots, reconnect payloads, accessibility labels, diagnostics and crash reports follow the same privacy boundary as rendering.

Do not adopt `boardgame.io`. Its pure moves, phases, serialisable state, logs and multiplayer concepts validate the direction, but Deckd already has an engine and migration cost would add risk without solving physical interaction.

## 8. Four production modes

## 8.1 Offline pass-and-play

**Job:** one group, one phone, private hands, no connectivity.

**Surface profile:** `hot-seat`.

**Flow:**

1. Deal from the deck object.
2. Current player sees only their hand and public table.
3. A committed turn-ending action closes the hand into a face-down packet.
4. The pass veil names the next player and shows the physical direction of handoff.
5. Next player holds to reveal, then release locks if they abandon the handoff.

**Key rules:**

- no manual Pass button when the game action already ends the turn
- public table remains faintly visible through the veil so spatial continuity is never lost
- pass ritual is part of the same table, not a modal route
- undo is constrained to information-safe events; no undo after a new player reveals private information
- local persistence checkpoints after every transaction, not every animation frame

**Failure behaviour:** force-close resumes at the veil if the previous turn had ended; it never reopens the last player's exposed hand.

## 8.2 Personal-device multiplayer: online or nearby

**Job:** each player holds their own hand and sees an appropriate table view. Internet and nearby feel identical once connected.

**Surface profile:** `personal-table` with a single seat binding.

**Transport choices:**

- **Online:** authoritative room runtime on the Node server; clients send intents and receive recipient projections over WebSocket.
- **Nearby:** host-authoritative star topology using Google Nearby Connections through a local Expo native module. Nearby Connections is cross-platform, encrypted, high-bandwidth and abstracts Bluetooth/BLE/Wi-Fi. Product language says “Nearby”, never “BLE”.

**Do not build raw BLE GATT multiplayer.** `react-native-ble-plx` is central/peripheral device plumbing, not a production multi-phone session layer. It requires custom native builds, physical-device testing and permission work while still leaving discovery, framing, encryption, reconnection and cross-platform peripheral behaviour to us.

**Apple-specific decision:** do not use Multipeer Connectivity. Xcode 27 deprecates the entire framework. If the Nearby spike fails cross-platform, the fallback is a local client-server adapter using Apple's Network framework/Bonjour/QUIC on iOS and equivalent Android networking, not deprecated MPC.

**Connection ritual:**

- host creates a six-character room or nearby table
- guests see host name, game and seat before accepting
- nearby endpoints use a short mutual verification code to stop accidental joins
- transport state is a small edge indicator, not a blocking banner during healthy play

**Reliability:**

- every intent has an idempotency ID
- authority returns accepted/rejected with committed sequence
- accepted commands are appended durably before acknowledgement; optimistic presentation is visibly pending, never treated as truth
- batches are ACKed; gaps trigger snapshot + tail
- reconnect reclaims seat by resume token
- background/foreground transitions preserve room state and visibly rejoin
- duplicate clients close the old connection before binding the new one

## 8.3 One-phone, two-player split board

**Job:** phone lies between two people and behaves like a tiny physical table.

**Surface profile:** `dual-end-board`, exactly two seats.

**Layout:** portrait long-axis between players.

```text
┌──────────────────────────┐
│ Player B hand, rotated   │  hold-to-peek; touch domain B
│ face-down at rest        │
├──────────────────────────┤
│                          │
│ shared game composition  │  deck, piles, runs, pot
│                          │
├──────────────────────────┤
│ Player A hand            │  hold-to-peek; touch domain A
│ face-down at rest        │
└──────────────────────────┘
```

**Interaction:**

- each player presses and holds their end with the hand physically covering the sightline
- cards fan toward that player and rotate 180 degrees at the top end
- release immediately re-veils that hand
- both ends can be held simultaneously using independent gesture domains
- touches are hard-scoped to their owning end so one player cannot accidentally manipulate the other hand
- round start and simultaneous-reveal phases use a mirrored two-finger ready ritual; neither side advances alone
- playing a card begins from the revealed end and lands in the shared centre
- centre never grows under a hand; end zones expand inward only within reserved limits

**Honesty:** this is shoulder-surf resistant, not secure. Say so in help copy. It is for trusted, face-to-face play.

**Eligibility:** only games whose table and hand can remain usable at phone scale. Exclude layouts that require wide community boards or more than two active seats until a game-specific split composition passes its own test.

## 8.4 Phone Deck: public table plus private hand phones

**Job:** one phone becomes the physical deck/table, while players use personal phones as hands.

**Surface profiles:** one `public-table`, one or more `private-hand` clients.

**Important decision:** device role and network authority are independent. The table phone may host a nearby room, but online rooms remain server-authoritative. A host's personal phone can be a hand while a spare phone is table-only.

**Public table renders:**

- deck/shoe
- discard, community, tricks, books, runs, pot and turn token
- public scores and player seat markers
- never private hand identities

**Private hand renders:**

- own hand and legal card interactions
- small public-state summary only when needed
- no duplicated miniature full table

**Cross-device card continuity:**

- draw starts on the table phone as the top card leaves the deck
- recipient sees an opaque incoming card edge, then identity resolves only on their device
- play starts in the private hand and lands on the table phone
- authority commits once; each surface performs its role-specific half of the same transaction ID
- clocks are not trusted for state. A short scheduled presentation window may align animations, but late devices snap to committed state rather than delaying the table

**Hybrid seats:** a shared/table phone may also carry one or two hot-seat players. Seat binding, not transport, decides which private hand is currently available.

## 9. Shared shell and unique game compositions

### Shared shell owns

- safe areas and table material
- connection/turn edge state
- one utility drawer trigger
- role/view projection
- measured zone registry
- global card motion overlay
- pass/reconnect/end overlays
- accessibility announcements

### Every game composition owns

- spatial arrangement of zones
- which piles and seats are visible in each surface profile
- game-specific non-card objects, such as a stand marker or poker chips
- game-specific pacing and celebration
- adaptations for hot-seat, personal, dual-end, table-only and hand-only views

This deliberately rejects both extremes: no universal generic table, and no duplicated 800-line full-screen component per game.

## 10. Build order

### Phase 0: freeze the new contract (2–3 days)

- update `docs/LOOP_DIRECTIVES.md`, `docs/MVP_SCOPE.md` and `AGENTS.md` to reflect the explicit scope expansion
- capture current engine behaviour as regression fixtures
- create a feature branch and preserve the dirty baseline; do not mix existing uncommitted export/QA work into the rebuild
- write Architecture Decision Records for topology, nearby transport and server authority

**Exit:** source-of-truth docs agree, existing gates green, current preview unchanged.

### Phase 1: Card Lab and physical primitives (2–3 weeks)

- build card state machine, zone registry, motion coordinator and lab scenarios
- replace React state during gesture frames with Reanimated shared values
- standardise haptic/audio vocabulary
- implement screen-reader action parity and reduced motion
- test on release iOS and Android devices

**Exit:** all Card Lab gates pass; no game has been migrated yet.

### Phase 2: runtime separation (1–2 weeks)

- introduce `Authority`, `Transport`, `SurfaceProfile` and `SeatBinding`
- typed intents and engine legality descriptors
- projection layer and opaque card identities
- in-process runtime first; adapt current event log without changing rules behaviour
- shared `TableShell` and utility drawer

**Exit:** current pass-and-play game can run through the new runtime with old presentation as a compatibility adapter.

### Phase 3: Crazy Eights vertical slice across all surfaces (2–3 weeks)

Crazy Eights is the reference game because it exercises hand fan, legal play, discard target, draw pile, wildcard choice, hidden hands and turn handoff.

Build and sign off in this order:

1. hot-seat
2. personal-table using two local mock clients
3. cloud online with two real devices
4. nearby with iOS↔Android physical devices
5. dual-end board
6. public-table + two private-hand phones

**Exit:** one complete game proves the architecture. If a mode cannot feel authentic here, fix the primitives/runtime, not six game screens.

### Phase 4: migrate games by primitive coverage (5–8 weeks)

1. **War:** pile play, paired reveal, pile collection
2. **Go Fish:** card-as-question, player target, deck draw, books
3. **Sevens:** multiple dynamic targets and growing runs
4. **Old Maid:** draw from opponent, private reveal, automatic pair collection
5. **Blackjack:** shoe draw, dealer choreography, stand marker
6. **Poker:** chips, muck, community dealing, server privacy
7. **Klondike / FreeCell / Pyramid / Golf:** stack movement and solo-specific boards

Each game is a separate production slice. Do not start the next until the current game's eligible surfaces score 10/10 against the acceptance rubric.

### Phase 5: retire compatibility code (1 week)

- delete generic action rails and legacy string action adapters after the last dependent game moves
- reduce `TableLayer.tsx` to routing or remove it
- consolidate repeated table headers/utility rails/viewer dispatch
- remove obsolete `ble-host`/`ble-guest` state values and dead framing code
- update all QA harnesses to use active-layer hit testing and new role fixtures

### Honest effort

A credible production rebuild of primitives, four modes, native nearby transport and the current game catalogue is roughly **13–20 focused engineering weeks**, not a polish sprint. The first trustworthy milestone is Card Lab + one-mode Crazy Eights in about **4–6 weeks**. Re-estimate after the native nearby spike and Card Lab device pass.

## 11. Likely file changes

Exact names can move during implementation, but responsibilities must stay separated.

### Create

```text
src/engine/intents.ts
src/engine/legalIntents.ts
src/engine/projection.ts
src/engine/sessionTopology.ts
src/engine/presentationCues.ts
src/runtime/SessionRuntime.ts
src/runtime/InProcessTransport.ts
src/runtime/RelayTransportAdapter.ts
src/runtime/NearbyTransportAdapter.ts
src/runtime/snapshot.ts
src/runtime/idempotency.ts
components/card/CardEntity.tsx
components/card/CardMotionOverlay.tsx
components/card/CardZone.tsx
components/card/DeckPile.tsx
components/card/HandFanSurface.tsx
components/card/StackSurface.tsx
components/card/TurnToken.tsx
components/table/TableShell.tsx
components/table/UtilityDrawer.tsx
components/table/ZoneRegistry.tsx
components/modes/HotSeatSurface.tsx
components/modes/PersonalTableSurface.tsx
components/modes/DualEndBoardSurface.tsx
components/modes/PublicTableSurface.tsx
components/modes/PrivateHandSurface.tsx
components/lab/CardLab.tsx
modules/deckd-nearby/                    local Expo module, no hand-edits in generated native folders
server/session-runtime/                  server-authoritative reducer and projections
```

### Refactor/adapt

```text
src/engine/types.ts
src/engine/events.ts
src/engine/rules.ts
src/engine/state.ts
src/store/gameStore.ts
src/store/multiplayerBridge.ts
src/store/syncLogic.ts
lib/relayProtocol.ts
lib/relayTransport.ts
server/index.js
components/CardDrag.tsx
components/CardDragHand.tsx
components/layers/TableLayer.tsx
components/layers/CrazyEightsTable.tsx
components/layers/WarTable.tsx
components/layers/GoFishTable.tsx
components/layers/SevensTable.tsx
components/layers/BlackjackTable.tsx
components/layers/PokerTable.tsx
components/PassLayer.tsx
```

### Retire only after migration

- per-card visible PLAY actions
- War FLIP dock
- Go Fish rank-button dock
- duplicated game-table headers and utility rails
- mode-specific viewer/relay branches copied into every game
- `ble-host` / `ble-guest` in canonical game state
- any deprecated Multipeer Connectivity idea

## 12. Production acceptance gates

### Interaction feel

- press response starts within one rendered frame
- drag remains on UI runtime; no React state or RN-runtime callback per frame
- p95 drag frame time stays within 16.7ms on the slowest supported device in a release build
- lift, redirect, reverse and cancel work without teleporting
- invalid drop visibly returns within a 400ms spring
- card remains readable above the finger while lifted
- every card move has one consistent haptic/audio meaning

### Usability

- a first-time player can deal, draw, play and pass without reading a persistent instruction paragraph
- no visible `PLAY [CARD]`, `FLIP`, rank-grid or equivalent card-action button as the primary path
- persistent gameplay chrome: no more than one utility trigger plus essential turn/network state
- minimum 44pt iOS / 48dp Android hit areas, including exposed card edges
- large text does not cover cards or targets
- left/right-handed reach and one-hand fatigue are device-tested

### Engine and privacy

- property/invariant tests prove every card exists in exactly one zone, orders are unique, hidden identities do not leak and replay is deterministic
- illegal and duplicate intents are rejected idempotently
- server and client use the same engine package/version contract
- online clients never receive canonical deck order or opponents' identities
- snapshots plus event tails reproduce the authority state byte-for-byte

### Transport chaos

For relay and nearby separately:

- duplicate, dropped, delayed and out-of-order message tests
- background host/guest for 30s, 2m and OS-suspension cases
- host loss, seat reclaim and reconnect
- version mismatch gives a clear non-destructive response
- radio/local-network permission denial has a recoverable flow
- nearby manual radio-off behaviour is handled, matching Google's announced late-2026 API change

### Mode matrix

| Mode | Minimum physical proof |
| --- | --- |
| Pass-and-play | one iPhone + one Android, full game, force-close at pass veil |
| Online personal devices | iOS↔Android, Wi-Fi↔mobile data, reconnect each side |
| Nearby personal devices | iOS host↔Android guest and Android host↔iOS guest, no internet |
| Dual-end board | two real players, simultaneous holds, both orientations, smallest phone |
| Phone Deck | table phone + two hand phones, draw/play animations both directions, one disconnect/rejoin |

### Per-game sign-off

- deterministic full-game engine simulations across at least 100 seeds
- game-specific surface at 375×812 and representative modern Android widths
- release-device gesture pass
- eligible modes documented; unsupported mode combinations are not shown
- reduced motion, VoiceOver/TalkBack and colour-independent legality cues
- no next game begins while a known 10/10 blocker remains

## 13. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Big-bang rewrite kills a working app | Compatibility adapter, internal Card Lab, one game at a time. |
| Gesture vs horizontal fan scrolling conflict | Explicit gesture arbitration, short hold threshold, exposed edges, native-device test matrix. |
| Cross-platform nearby SDK or Expo integration fails | Two-device iOS↔Android spike before mode UI; fallback to local client-server networking, never raw BLE GATT. |
| Server-authoritative engine diverges from client | One framework-free engine package and protocol version; golden replay tests in both environments. |
| “Physical” becomes slow or theatrical | Animate only causal object movement; no decorative transitions for common actions; under-300ms non-gesture motion. |
| Minimal UI becomes undiscoverable | First-use ghost gesture, persistent physical target treatment, accessible action sheet, usability test without coaching. |
| Table-phone animation waits on slow peers | Authority commits immediately; bounded presentation window; late peers snap rather than blocking. |
| Split-board privacy is oversold | Trusted face-to-face positioning and explicit help copy; never call it secure. |
| Existing dirty tree contaminates work | Preserve current modifications; branch/checkpoint before implementation and never overwrite unrelated export/QA files. |

## 14. Open questions and default decisions

There are no product decisions blocked on Josh. Three implementation questions are deliberately resolved by spikes rather than debate:

1. **Nearby adapter reliability:** default to Google Nearby Connections. Keep it only if the iOS-host/Android-guest and reverse physical spike passes discovery, verification, transfer, background and reconnect gates. Otherwise use the documented local client-server fallback.
2. **Minimum supported OS/device:** preserve the current EAS project minima for the first release baseline, then name the slowest supported devices from measured Card Lab results rather than guessing in a document.
3. **Mode eligibility per game:** do not promise every game on every surface. Crazy Eights proves all five surface profiles; later games expose only profiles that pass their game-specific geometry, privacy and usability gates.

## 15. Scope boundaries

This rebuild does **not** include:

- a custom rules DSL or user-generated games
- physics-engine card simulation, free rotation or fling-anywhere sandbox behaviour
- voice/video chat, matchmaking, accounts or social graph
- arbitrary mixed-reality/tablet layouts
- raw BLE GATT networking
- deprecated Multipeer Connectivity
- Rive mascots or monetisation work before the physical interaction and mode architecture pass
- rebuilding card art unless readability testing proves the current assets block play

## 16. Research basis

- Apple HIG, **Gestures**: direct manipulation, immediate feedback, familiar gestures, discoverable custom gestures and alternate inputs.  
  https://developer.apple.com/design/human-interface-guidelines/gestures
- Apple WWDC18, **Designing Fluid Interfaces**: responsive, redirectable and interruptible gestures; a small mismatch breaks the physical illusion.  
  https://developer.apple.com/videos/play/wwdc2018/803/
- Android Developers, **Haptics design principles**: less is more; use consistent clear haptics, scale strength by importance and synchronise visual/audio/haptic feedback.  
  https://developer.android.com/develop/ui/views/haptics/haptics-principles
- Apple HIG, **Drag and drop**: preserve direct manipulation, show valid destinations continuously, provide alternatives and recover cleanly from invalid drops.  
  https://developer.apple.com/design/human-interface-guidelines/drag-and-drop
- Apple HIG, **Playing haptics**: keep event-to-feedback meanings consistent and pair haptics with visible/audio feedback.  
  https://developer.apple.com/design/human-interface-guidelines/playing-haptics
- Nakama, **Authoritative multiplayer**: central authority validates client intent and owns match state for active and passive turn-based games.  
  https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/
- Colyseus, **State synchronisation and reconnection**: server-only mutation, recipient views and bounded seat-preserving reconnect validate the proposed runtime boundary.  
  https://docs.colyseus.io/state  
  https://docs.colyseus.io/room/reconnection
- IETF RFC 6455, **The WebSocket Protocol**: WSS, data validation and reconnect backoff remain protocol-level responsibilities rather than assumptions of the socket API.  
  https://datatracker.ietf.org/doc/html/rfc6455
- Apple TN3213, **Moving from Multipeer Connectivity to Network framework**: Xcode 27 deprecates Multipeer Connectivity; client-server is simpler; Network framework supports reliable QUIC/TCP/WebSocket patterns and peer discovery.  
  https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework
- Google Nearby Connections: encrypted offline peer discovery and transfer over Bluetooth/BLE/Wi-Fi with Android and Swift packages.  
  https://developers.google.com/nearby/connections/overview  
  https://developers.google.com/nearby/connections/swift/get-started
- Android Developers, 2026 Nearby change: apps must handle radios being off and ask the user to enable them manually.  
  https://developer.android.com/blog/posts/upcoming-changes-to-the-nearby-connections-api
- AirConsole controller guidance: smartphones are not gamepads; use context-specific layouts, large touch areas, personal secret information and restrained haptics.  
  https://developers.airconsole.com/smartphones-as-controllers
- Jackbox: low-friction room code, host screen and phones as private controllers validate role-separated surfaces.  
  https://www.jackboxgames.com/how-to-play
- Cards with Phones: same-room multi-phone card play, automatic reconnect and Bluetooth/Wi-Fi range prove demand for a forgotten-deck replacement.  
  https://apps.apple.com/no/app/cards-with-phones/id1454757579
- Card Table precedent: public iPad table, private iPhone hands and cards moving between devices demonstrate the strongest version of the Phone Deck idea.  
  https://www.engadget.com/2014-04-01-card-table-for-ios-gives-you-a-virtual-deck-of-cards-for-any-gam.html
- Xu et al., **Chores Are Fun**: dealing, rule handling and moving pieces create social interaction; digitisation should not automatically remove all tabletop chores.  
  https://dl.digra.org/index.php/dl/article/download/591/591/588
- boardgame.io concepts: serialisable state, pure moves, phases and logs are useful architectural confirmation, not a proposed dependency.  
  https://boardgame.io/documentation/

## 17. First implementation action

Before touching a game screen, create the Card Lab specification and branch checkpoint while preserving the current dirty tree. The first code milestone is a release-device-proven hand-to-pile drag with cancel, target magnetism, reduced motion and an accessibility action that all dispatch the same typed intent.
