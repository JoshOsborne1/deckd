# Deckd — status log

Append one line per meaningful change. Format:

```
YYYY-MM-DD | area | change | followups
```

Most recent at the top. Agents should read the last ~10 entries before starting.

---

## Known state (as of Phase 5 prep — parallel plan slice: history + BLE store + preset resolve + EAS Android)

### Implemented
- Expo SDK 54, New Arch ON, TS strict. `npm run lint` + `npm run typecheck` both green.
- Flat navigation: `app/{index,store,list,profile}.tsx`. `/game/*` removed — game now lives **inside** `/` as layered viewModes (`home | hub | table | lobby | pass`) driven by `useUiStore`. `GestureHandlerRootView` + `SafeAreaProvider` wired at the root.
- Theme tokens: `src/lib/theme.ts` (`colors`, `alpha`, `radii`, `space`, `fonts`, `fontSizes`, `letterSpacing`, `shadow`, `motion`, `textStyles`).
- Path aliases (`@theme`, `@store`, `@engine` in both `tsconfig.json` + `babel.config.js` via `babel-plugin-module-resolver`). Legacy `@lib`, `@components`, `@hooks`, `@assets` preserved.
- Fonts: Plus Jakarta Sans loaded via `useFonts` + `expo-splash-screen` in `app/_layout.tsx` (returns null until ready).
- Reusable primitives:
  - `components/PlayingCard.tsx` (xs/sm/md/lg, up/down faces, brand/ink backs, elevated/highlighted, optional `onPress`).
  - `components/AvatarPlaceholder.tsx` (seeded color + initial; replaced every `pravatar.cc` call).
  - `components/CardButton.tsx` — tactile unified CTA (press-scale 0.97 + 2px lift spring, haptics with reduce-motion respect, primary/secondary/ghost/ink × sm/md/lg/xl).
  - `components/CardSection.tsx` — deck-metaphor grouping container (surface/ink/brand/ghost, optional tab notch + eyebrow/title/accessory header).
  - `components/PrivacyVeil.tsx` — full-screen pass-and-play gate. `Gesture.LongPress().minDuration(600)` + progress-ring fill + success haptic on completion.
  - `components/FlipCard.tsx` — 3D Y-axis flip wrapper around `PlayingCard` with 900px perspective + spring-driven rotation.
- Layered game surface (`app/index.tsx`):
  - Element-level home↔hub choreography via `SurfaceMorphContext` (single `progress` shared value 0 = home, 1 = hub; Material-emphasized easing; 520ms enter, 380ms return, 200ms under reduce-motion).
  - `components/layers/HomeLayer.tsx` — each block (stats banner, hero CTA, secondary CTA, store preview divider, carousel, Deckd+, sale) interpolates its own exit window. Hero CTA morphs in place (scale 1→0.88, ty 0→+180) rather than leaving.
  - `components/layers/HubLayer.tsx` — session setup with per-element entry staggers. Preset chips + player chips further-stagger by index. Deal-now CTA scales 0.92→1 to "catch" the morphing hero.
  - `components/layers/TableLayer.tsx` — **engine-driven**. `viewerId` = `currentPlayerId` in pass mode (shared phone shows the active seat), else `hostId`. PASS TURN: `endTurn(viewerId)` → `enterPrivacy(next.id)` → `openPass({...})`. Reveal (`PassLayer`): `exitPrivacy()` then `closePass()`. Hand hidden while `privacySeat !== null` (recipient must long-press). Discard + `HandFan` support jokers via `parseJokerId` + `jokerColor` on `PlayingCard`.
  - `components/layers/LobbyLayer.tsx` — BLE lobby: `useBleStore` + `getBLEService()` scan/stop, device list, connection state, errors; host advertising calls the custom native module scaffold but is not device-proven.
  - `components/layers/PassLayer.tsx` — thin wrapper over `PrivacyVeil` bound to `useUiStore.passContext`.
- Stores:
  - `src/store/uiStore.ts` — `viewMode`, `openPass / closePass`, `resetToHome`, MMKV-persisted (sanitises `pass` → `home` on rehydrate).
  - `src/store/profileStore.ts` — v2 schema: `nickname`, `avatarSeed`, `level`, `streak`, `gamesPlayed`, `hapticsEnabled`, `reduceMotionOverride`. Includes `resetProfile()`. Migrate function backfills defaults from v1.
  - `src/store/presetsStore.ts` — MMKV-persisted user presets CRUD: `defaultPresetId`, `presets[]`, `setDefault`, `createFromBuiltin`, `updatePreset`, `deletePreset`.
  - `src/store/sessionHistoryStore.ts` — last 12 ended sessions (presetId, eventCount, playerCount, sessionId, at). Appended from Hub when starting a new session while one was active. Shown on Profile; cleared on profile reset.
  - `src/store/bleStore.ts` — central BLE UI state: `attach`, `startScan`, `stopScan`, devices, `lastError` (delegates to `lib/ble.ts` singleton).
  - `src/store/gameStore.ts` (zustand persist on the event log; rehydrate re-folds state).
- Hooks:
  - `src/hooks/useMotion.ts` — `reduceMotion` = system **or** profile `reduceMotionOverride` (animations). Haptics use `hapticsEnabled` + **system** reduce-motion only (not the in-app override). Intensities: light/medium/heavy/rigid/soft/success/warn/error/select.
- Animation helpers:
  - `src/animations/deal.ts` — worklet-safe: `dealStagger(i, total, baseDelay)`, `handFanTransform(i, total, spread)`, `dealEntryTransform(progress)`.
- Freeplay engine (`src/engine/*`):
  - `types.ts` — zones (draw/discard/muck/hand:*/table:*/communal:*), cards, players, session, GameState.
  - `deck.ts` — 52+jokers builder, deterministic `mulberry32` shuffle, seed helper.
  - `events.ts` — discriminated GameEvent union (session/deck/card/hand/turn/privacy).
  - `state.ts` — `applyEvent` reducer + `foldEvents` + `visibleCardsForPlayer`.
  - `presets.ts` — Freeplay, Deal-2-each, Blackjack-style, Poker-style.
  - `selectors.ts` — Pure selectors: `selectDrawPileCount`, `selectDiscardTopCard`, `selectOpponents`, `selectOpponentHandSize`, `selectLocalHand`, `selectMyTableCards`, `selectCurrentPlayerId`, `selectIsMyTurn`, `selectNextPlayerId`, `selectCardFace`, `selectDrawTopCardId`, `parseCardId`, `parseJokerId`.
  - `customPresets.ts` — NEW. `UserPreset` type + helpers for duplicating built-ins into user-saved copies.
- Route screens (`app/*.tsx`):
  - `/` — the unified surface (home/hub/table/lobby/pass morph layers).
  - `/profile` — identity cockpit: avatar seed cycler, editable nickname, haptic + reduce-motion-override toggles, stats chips, danger-zone reset with `Alert.alert` confirm.
  - `/list` — Presets Library: built-ins w/ tap-to-set-default, "Your presets" CRUD (create from builtin, inline edit name/summary, delete), active-default highlight.
  - `/store` — cosmetic storefront: Deckd+ brand hero, 2-col catalogue grid (card-back variants + price pills), bundles row (ink variants), restore purchases footer. All IAP CTAs currently `Alert.alert` placeholders.
- Reusable primitives:
  - `components/PlayingCard.tsx` — xs/sm/md/lg, up/down, brand/ink backs, elevated/highlighted, optional `onPress`. Optional `jokerColor` (`red`|`black`) renders a joker face for `JK-RED` / `JK-BLACK` IDs.
  - `components/AvatarPlaceholder.tsx` — seeded color + initial.
  - `components/CardButton.tsx` — tactile unified CTA (press-scale 0.97 + 2px lift, haptic prop, primary/secondary/ghost/ink × sm/md/lg/xl).
  - `components/CardSection.tsx` — deck-metaphor grouping (surface/ink/brand/ghost, optional tab notch, eyebrow/title/accessory header).
  - `components/PrivacyVeil.tsx` — 600ms long-press gate w/ progress ring + success haptic.
  - `components/FlipCard.tsx` — 3D Y-axis flip wrapper.
  - `components/HandFan.tsx` / `HandStack.tsx` — Reanimated layouts; `Gesture.Race` (tap flip, pan swipe-up discard, horizontal reorder); `FlipCard` per card.
- Platform-split BLE scaffold: `lib/ble.ts` uses `react-native-ble-plx` for guest/central scanning plus `modules/deckd-ble` for host/peripheral advertising; `lib/ble.web.ts` is an honest no-BLE stub.
- `lib/presetResolve.ts` — `resolvePresetForSession` maps Presets Library default (builtin or user uuid) → built-in id for `findPreset`.
- `lib/eventLogFormat.ts` — one-line formatter for `GameEvent` (event log modal).
- `components/EventHistoryModal.tsx` — bottom sheet modal; Table clock icon opens full event log (newest-first slice).
- `eas.json` — `android.buildType` on `preview` (apk) + `production` (app-bundle).

### Open risks / decisions pending
- **BLE peripheral mode is scaffolded, not proven.** `react-native-ble-plx` remains central-only, while `modules/deckd-ble` adds iOS `CBPeripheralManager` and Android `BluetoothLeAdvertiser`/GATT host paths. Treat as unverified until real-device matrix passes.
- **User presets are cosmetic clones.** Rule execution still derives from `basedOn` built-in. Real rule overrides (overriding `supportsPlayerCount`, `setup`, etc.) arrive when the rules DSL exists.
- **Haptics:** in-app `reduceMotionOverride` no longer mutes haptics; **system** reduce-motion still does (accessibility).
- **No store (IAP) plumbing.** All `/store` CTAs `Alert.alert` placeholders. Phase 7.
- **Connection-strength indicators / live peer telemetry** for the hub BLE chip are still stubbed.
- **Shared-element position between hero CTA and Hub Deal-now is approximated** via translateY. A measured-handoff pass (using `onLayout` captures) would make it 1:1 pixel-perfect.

### Immediate high-leverage tasks (Phase 5+)
1. Real-device BLE proof harness: prove advertise → scan → connect → guest write → host receive → host notify → guest receive across iOS/Android pairs.
2. Wire discovered device selection + session transport into lobby/table UX, with ACK/retry/snapshot status visible enough to debug.
3. Optional: room codes / pairing PIN.
4. Phase 7: IAP / `expo-in-app-purchases` or RevenueCat for `/store`.

---

## Change log

<!-- Append new entries here, most recent at the top. -->

- 2026-05-04 | frontend-hardening | Hardened the mobile shell before manual UI craft: fixed global nav visibility on secondary routes, added keyboard-safe profile/list forms, tightened table safe-area/compact sizing/action menu/history split, made opponent and hand layouts small-screen-safe, improved pass veil safe-area and transform-based reveal fill, removed visible dev event chip, stopped store long-press cosmetic unlocks, and replaced roadmap/BLE/IAP leak copy with honest product copy | `npm run typecheck` and `npm run lint` pass; `npx expo-doctor` runs but fails 1/17 because an ancestor `E:\projects\deckd\node_modules` duplicates `react`/`react-native` outside this workspace
- 2026-05-04 | ble-doc-handoff | Fixed BLE transport correctness issues: chunk batches now share a correlation id, BLE callbacks no longer clobber scan/lobby listeners, scan accepts UUID-matched devices even when Android host name is missing, reconnect retries reset state, UTF-8 base64 is used for wire JSON, remote snapshot application no longer refolds stale local history, web BLE stub matches current API, README/AGENTS/STATUS were corrected, and `state.md` was added as IDE handoff | Physical-device BLE proof matrix remains the production blocker
- 2026-05-03 | product-build | Added persisted runtime cosmetics store, wired Store card backs/table themes to real equip state, expanded PlayingCard backs to registry-driven skins, applied equipped table theme to the root table surface, fixed gameStore seq bookkeeping, added remote event/snapshot ingestion APIs for BLE transport, and wrote Rive handoff doc | BLE native transport still needs physical-device verification before product claims
- 2026-05-03 | foundation-to-ui-ready | Cleaned stale README/PLAN/.cursor context; restored Expo SDK alignment including `react-native-worklets`; added table/card/sync theme tokens; added visual domain models (`CardDefinition`, `DeckDefinition`, `CardBackDefinition`, `TableThemeDefinition`); added setup manifest DSL/compiler/validator; upgraded user presets to optionally carry real manifests; replaced legacy BLE `game_state` wire shape with versioned event/intention/snapshot/ACK/chunk protocol; added BLE transport abstraction; added UI Prompt Pack and Rive implementation guide | Real-device BLE proof matrix still required before claiming BLE works; next major work should be UI/table/hub/nav/pass polish
- 2026-05-03 | audit | Full repo audit and publish plan added at docs/DECKD_AUDIT_AND_PUBLISH_PLAN_2026-05-03.md; Hermes skill deckd-product-build created | Use plan as canonical backlog until README/PLAN drift is fully cleaned

- 2026-04-20 | phase-5-prep | Parallel slice: `lib/presetResolve` + Hub syncs Presets Library default into hub chips; `sessionHistoryStore` + Hub append on “Deal now” when prior session active; Profile “Recent tables”; `bleStore` + Lobby refactor; `EventHistoryModal` + Table clock icon; `alpha.inkOverlay45`; `eas.json` android apk/aab | Native BLE module not in this commit (AGENTS: no prebuild without ask)
- 2026-04-20 | phase-4b | Hand UX: `HandFan` + `HandStack` use `Gesture.Race` (tap flip, pan: swipe-up discard, horizontal swap for `reorderHand`). Hub Options adds Wide / Tight / Stack hand layout → `fanStyle` in session config. `LobbyLayer` wires `getBLEService()` scan start/stop, live connection state, discovered device list, host CTA stub + error surface. `useMotion`: haptics no longer blocked by in-app `reduceMotionOverride` (OS reduce-motion still mutes haptics). NEW `src/animations/stack.ts` + `components/HandStack.tsx` | Discard gesture changed from long-press to swipe-up — hint under hand
- 2026-04-20 | phase-4 | Pass lifecycle: `endTurn` → `enterPrivacy(next)` → veil; `PassLayer` `onReveal` → `exitPrivacy` + `closePass`. TableLayer `viewerId` = current seat in pass mode (fixes wrong-hand bug). `useMotion`: `reduceMotion` OR `reduceMotionOverride`; haptics gated by `hapticsEnabled` + `reduceMotion`. Jokers: `parseJokerId`, `PlayingCard` `jokerColor`, discard + HandFan wired | Optional: haptics independent of reduce-motion override
- 2026-04-20 | phase-3 | Engine ↔ TableLayer wired. NEW `src/engine/selectors.ts` (11 pure selectors over GameState), NEW `src/animations/deal.ts` (worklet-safe `dealStagger`/`handFanTransform`/`dealEntryTransform`), NEW `components/HandFan.tsx` (Reanimated parabolic fan + per-card stagger + Gesture Handler press/long-press + reduce-motion short-circuit + FlipCard integration). `components/layers/TableLayer.tsx` full rewrite: subscribes to `useGameStore.state`; renders opponents row (avatar + hand-count + stacked face-down cards), deck stack with "N LEFT" overlay (tap → `dealCard`), live discard top, shuffle button (host-only, dispatches `deck/shuffle` with `mulberry32(makeSeed())`), atomic PASS TURN (`endTurn` → `openPass({nextPlayer})`), hand tap = `flipCard`, long-press = `moveCard(cardId, ZONE_DISCARD, 'up')`. Empty state + `__DEV__` event-log counter | Jokers still render face-down (parseCardId returns null); `FanStyle: 'stacked'` falls back to 'tight'
- 2026-04-20 | phase-2 | Route screens polished: `/profile` is identity cockpit (editable nickname, 6-seed avatar cycler, haptic + reduce-motion-override toggles, stats chips, danger-zone reset with Alert confirm). `/list` is Presets Library (built-ins w/ tap-to-set-default + active highlight; "Your presets" CRUD w/ inline edit + delete + duplicate-from-builtin). `/store` is cosmetic storefront (Deckd+ brand hero, 2-col catalogue grid, bundles ink row, restore-purchases footer; all IAP CTAs `Alert.alert` placeholders). `profileStore` v2: added `hapticsEnabled`, `reduceMotionOverride`, `gamesPlayed`, `resetProfile` with migrate. NEW `src/store/presetsStore.ts` (MMKV CRUD for user presets) + `src/engine/customPresets.ts` (UserPreset type + clone helper) | `reduceMotionOverride` is persisted UI-only — still needs to gate `useMotion`; user presets are cosmetic clones (real rule overrides await rules DSL)
- 2026-04-20 | phase-1b | Element-level home↔hub choreography: new `components/layers/SurfaceMorphContext.ts` publishes a single `progress` shared value (0 = home, 1 = hub) driven by `app/index.tsx` with Material-emphasized easing (520ms enter, 380ms return, 200ms in reduce-motion). HomeLayer and HubLayer now interpolate per-element windows (stats/hero/secondary/divider/carousel/deckd+/sale on exit; header/resume/preset-title+chips/player-title+chips/options/CTA on entry with chip-index stagger 0.04). Hero CTA morphs in place (scale 1→0.88, ty 0→+180, rot 0→1.5°) while Hub Deal-now scales 0.92→1 to "catch" it. Whole-layer fade (240ms) covers transitions to table/lobby/pass. Reduce-motion path short-circuits to opacity-only crossfade | Shared-element position is approximated via translateY — measured handoff deferred until TableLayer rewrite settles positions
- 2026-04-20 | phase-1 | Surface merged: `/game/*` removed; `app/index.tsx` now renders stacked viewMode layers (home/hub/table/lobby/pass) with persistent felt background. Transitions fade + translate so chrome "slides off" into the game rather than route-hopping | Sequenced element stagger still to add in polish pass
- 2026-04-20 | phase-1 | Motion primitives shipped: `src/hooks/useMotion.ts` (reduce-motion-aware haptics, 9 intensities), `src/lib/motion.ts` worklet helpers, `components/CardButton.tsx` (press-scale 0.97 + 2px lift spring), `components/CardSection.tsx` (deck-metaphor container), `components/PrivacyVeil.tsx` (600ms long-press gate w/ progress ring), `components/FlipCard.tsx` (3D Y-axis flip wrapper) | `HandFan` + `DealStagger` deferred to Phase 3 (need engine state)
- 2026-04-20 | phase-1 | `src/store/uiStore.ts` drives surface viewMode, `openPass/closePass` with recipient context. Persists to MMKV but sanitises `pass` → `home` on rehydrate | —
- 2026-04-20 | phase-1 | `app/_layout.tsx` now wraps in `GestureHandlerRootView` + `SafeAreaProvider` (required for long-press + veil) and drops `<Stack.Screen name="game" />` | —
- 2026-04-20 | phase-1 | `GlobalNavBar`: center button now sets `viewMode = 'hub'` instead of navigating; bar hides whenever `/` has non-home viewMode; tapping Home while already on `/` returns viewMode to `'home'` | —
- 2026-04-20 | phase-0 | Theme tokens `src/lib/theme.ts` (colors/alpha/radii/space/fonts/shadow/motion/textStyles) + aliases `@theme` / `@store` / `@engine` wired via `tsconfig` + `babel-plugin-module-resolver` | Theme wiring skill satisfied; still per-screen font sizes not tokenized yet
- 2026-04-20 | phase-0 | `components/PlayingCard.tsx` (xs/sm/md/lg, face up/down, brand/ink backs, elevated, highlighted, onPress) per `card-rendering` skill; hardcoded gameboard JSX migrated off | Animation seams next (flip/deal/fan)
- 2026-04-20 | phase-0 | `components/AvatarPlaceholder.tsx` — seeded color + initial; replaced all `pravatar.cc` usage on home, gameboard, pass | Profile editor later
- 2026-04-20 | phase-0 | Freeplay engine scaffolded (`src/engine/{types,deck,events,state,presets,index}.ts`): event log → reducer → derived `GameState`; deterministic shuffle (`mulberry32`); zones + privacy flags; presets: Freeplay, Deal-2-each, Blackjack-style, Poker-style | Phase 3 wires these into the table UI
- 2026-04-20 | phase-0 | Stores: `src/store/gameStore.ts` (zustand + MMKV persist on events; rehydrate re-folds state) and `src/store/profileStore.ts` (local nickname/avatarSeed/level/streak) | Networked events layer in Phase 5 (BLE)
- 2026-04-20 | phase-0 | Fonts now loaded: `useFonts` + `expo-splash-screen` in `app/_layout.tsx` returns null until ready | —
- 2026-04-20 | phase-0 | Nav flattened: deleted `app/(tabs)/` group + `game_dummy.tsx`; routes now top-level `app/{index,store,list,profile,game}`; `GlobalNavBar` hides on `/game/pass` | `GlobalNavBar` shown on all other routes including game hub — revisit focus-mode hiding in Phase 2
- 2026-04-20 | phase-0 | ESLint 9 + `eslint-config-expo` flat config (`eslint.config.js`) wired; `npm run lint` and `npm run typecheck` both green | Pre-existing `lib/ble.ts` unused `Service` import also cleaned
- 2026-04-21 | foundation-fixes | Removed conflicting deps (react-native-worklets, @shopify/flash-list, @react-native-async-storage/async-storage, react-native-nitro-modules). Fixed storage.ts dynamic require → static MMKV import. Fixed ble.ts Buffer usage → pure JS base64 for web. Fixed hardcoded hex colors in AvatarPlaceholder, PlayingCard, HomeLayer. Fixed GlobalNavBar hidden logic (viewMode !== 'home') + added android elevation to cardShellActive. | URL query param sync for viewMode skipped (optional)
