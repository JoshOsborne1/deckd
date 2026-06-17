# Deckd state handoff

_Last updated: 2026-05-04 by Codex._

## Product truth

Deckd is a premium, accountless mobile card-game app. The reliable multiplayer mode today is pass-and-play on one device. The production differentiator is nearby-table BLE multiplayer, but that is not production-proven yet. Do not market BLE as done until the real-device proof matrix passes.

## Current stack

- Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript strict.
- expo-router 6, root stack in `app/_layout.tsx`.
- State: zustand 5 + MMKV via `lib/storage.ts`.
- Animation/gestures: Reanimated 4 + Gesture Handler.
- BLE: `react-native-ble-plx` for guest/central scanning and connecting, plus local Expo module `modules/deckd-ble` for host/peripheral advertising and GATT server scaffold.
- Native module package: `deckd-ble` via `file:./modules/deckd-ble`.
- Cosmetics: runtime card backs/table themes in `src/engine/visuals.ts` + `src/store/cosmeticsStore.ts`.

## App shape

- `/` in `app/index.tsx` is the main layered surface controlled by `useUiStore.viewMode`:
  - `home`
  - `hub`
  - `table`
  - `lobby`
  - `pass`
- Secondary routes:
  - `app/store.tsx`
  - `app/list.tsx`
  - `app/profile.tsx`
  - `app/settings.tsx`
- Main UI primitives:
  - `components/PlayingCard.tsx`
  - `components/CardButton.tsx`
  - `components/CardSection.tsx`
  - `components/FlipCard.tsx`
  - `components/HandFan.tsx`
  - `components/HandStack.tsx`
  - `components/PrivacyVeil.tsx`
  - `components/EventHistoryModal.tsx`
  - `components/GlobalNavBar.tsx`
- Game layers:
  - `components/layers/HomeLayer.tsx`
  - `components/layers/HubLayer.tsx`
  - `components/layers/TableLayer.tsx`
  - `components/layers/LobbyLayer.tsx`
  - `components/layers/PassLayer.tsx`

## Engine and data model

- Event-sourced engine lives in `src/engine/*`.
- `src/store/gameStore.ts` persists the event log and folds it into `GameState`.
- `createSession` builds deterministic shuffled sessions from presets.
- `dispatch` appends local authoritative events.
- `ingestRemoteEvents` dedupes by event id and folds fresh remote events.
- `applyRemoteSnapshot` now treats the snapshot as the new base and applies only tail events at or after `nextSeq`, rather than refolding stale local history.
- Setup manifest scaffolding exists in `src/engine/manifest.ts`.
- Custom presets can carry manifests, but full authored gameplay/rules are not complete yet.

## BLE and multiplayer state

### What exists

- `lib/bleProtocol.ts` defines versioned wire messages:
  - handshake
  - ping/pong
  - event batches
  - ACKs
  - snapshots
  - guest intents
- Event batches chunk payloads and now reuse one `mid` across chunks so reassembly can work.
- `lib/transport.ts` provides `createBleTransport` and `createNullTransport`.
- Host transport sends event batches through native BLE notifications.
- Guest transport writes JSON to host characteristic.
- `lib/ble.ts`:
  - scans for Deckd service UUID via `react-native-ble-plx`
  - no longer drops Android hosts just because the advertised name/localName is missing
  - connects to discovered devices
  - sends guest handshake after connection
  - calls custom native module for host advertising
  - listens for host-side peripheral writes
  - notifies subscribers from host
  - uses UTF-8 safe base64 encode/decode for JSON payloads
  - supports multiple callback listeners so lobby scan state and transport wire handlers do not clobber each other
  - resets connection state before reconnect retries so retries actually run
- `lib/ble.web.ts` is an explicit no-BLE web stub matching the current native API shape.

### What is not proven

BLE is still the main production blocker. The native host path has not been verified on physical devices in this repo handoff. Expo Go does not count. Web does not count. Simulator does not count.

Do not claim BLE multiplayer works until all of this is proven and logged:

1. iOS host advertises, iOS guest scans and connects.
2. Android host advertises, Android guest scans and connects.
3. iOS host ↔ Android guest works or failure is documented.
4. Android host ↔ iOS guest works or failure is documented.
5. Guest writes handshake/intent and host receives it.
6. Host notifies event batch and guest receives it.
7. Chunked event batch reassembles.
8. Disconnect/reconnect can recover via snapshot/tail.

## UI state

The UI is a strong prototype, not production-grade.

What is good:

- Cohesive crimson/off-white direction.
- Layered surface architecture is the right model.
- Cards, hand gestures, pass veil, event history, runtime cosmetics, store previews, and table theme hooks exist.
- Frontend shell has a first hardening pass: secondary-route nav stays visible even with persisted game view modes, profile/list forms are keyboard-safe, pass veil respects safe areas, table menu/history are split, and table hand/opponent rails now adapt better on compact devices.
- The Deck Ritual direction is documented in `docs/DECKD_UI_PROMPT_PACK.md` and Rive handoff docs.

What is weak:

- `TableLayer` still needs to become a real table: seat ring, draw/discard wells, communal/trick/pot lane, contextual action rail, sync states, better menu architecture.
- `HubLayer` still feels like setup chips, not a deck-staging ritual.
- `GlobalNavBar` needs final premium peeking-card chrome and active state polish.
- `PrivacyVeil` works, but needs the pass ritual art direction.
- Store UI has runtime equip state now, but IAP is placeholder and should not be treated as revenue-ready.

## Design Prompt Pack for Josh/Codex

### Brief

Turn Deckd from a functional Expo prototype into a premium tactile local card-table app. Preserve the crimson/off-white deck metaphor, the layered home→hub→table surface, pass-and-play reliability, and BLE-first ambition. Replace prototype layouts with a physical card-table product language.

### Classification

- Product type: mobile game utility/app shell, local tabletop card game.
- Emotional target: tactile, premium, social, warm, mischievous, fast.
- Theme: off-white paper shell with deep crimson brand surfaces and darker felt table mode.
- Interaction density: medium on home/hub, high in table.
- Motion level: medium/showcase for card/deal/table transitions, subtle elsewhere.

### Signature move

Deck Ritual: center medallion expands into a table seal, deck stack shuffles, seats snap into ring, cards deal out with haptic ticks, BLE invite pulse is part of the same object language.

### Hard bans

- No casino neon.
- No generic tab bar.
- No placeholder roadmap copy in user-facing UI.
- No fake “BLE works” language.
- No generic SaaS cards.
- No treating the table like a settings screen.

### Immediate UI targets

1. Rebuild `components/layers/TableLayer.tsx` as a real table surface.
2. Rebuild `components/layers/HubLayer.tsx` as deck staging.
3. Rebuild `components/GlobalNavBar.tsx` as premium peeking-card chrome.
4. Upgrade `components/PrivacyVeil.tsx` into a pass ritual.
5. Make store/cosmetics feel owned/equipped/previewable, not placeholder commerce.

## Backend/multiplayer priorities

1. BLE proof harness and real-device matrix.
2. Discovered-device row → connect → handshake → visible state machine in Lobby.
3. Transport wiring from host game events to guest folds, and guest semantic intents to host validation.
4. ACK timeout/retry/resend for critical host event batches.
5. Snapshot/tail reconnect path.
6. Diagnostics panel with service UUID, host name, state, connected count, last write, last notify, last error.
7. Store-review permission cleanup only after BLE mode is proven.

## Verification status

As of this handoff:

- `npm run typecheck` passed after the frontend hardening pass.
- `npm run lint` passed after the frontend hardening pass.
- `npx expo-doctor` ran after the frontend hardening pass and reported 16/17 checks passing. The remaining failure is duplicate `react` / `react-native` discovered from ancestor `E:\projects\deckd\node_modules`, outside this workspace, not from a package change in this pass.

## Files to trust first

- `state.md`, this handoff.
- `STATUS.md`, current implementation state and change log.
- `AGENTS.md`, agent operating guide.
- `.cursor/context.md`, quick orientation.
- `docs/DECKD_UI_PROMPT_PACK.md`, UI direction.
- `docs/RIVE_ANIMATION_HANDOFF_2026-05-03.md`, motion/Rive direction.

## Files with historical/stale risk

- `PLAN.md` is historical, not the live plan.
- `docs/DECKD_AUDIT_AND_PUBLISH_PLAN_2026-05-03.md` is useful for context, but some BLE/custom-card tasks were advanced after it was written. Use `state.md` + `STATUS.md` for current truth.
- `.cursor/skills/ble-realtalk/SKILL.md` is still correct that `react-native-ble-plx` cannot advertise, but it predates the current native module scaffold. Treat it as a caution document, not as proof no host code exists.
