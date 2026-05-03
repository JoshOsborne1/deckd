# Deckd Master Implementation Plan

## Phase 1: Foundation (Critical Fixes + Architecture)
**Files:** `package.json`, `lib/storage.ts`, `lib/ble.ts`, `lib/ble.web.ts`, `src/lib/theme.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/store/uiStore.ts`, `components/GlobalNavBar.tsx`

- [ ] B2: Remove `react-native-worklets` from dependencies
- [ ] B3: Replace dynamic `require('react-native-mmkv')` with static import + Platform guard
- [ ] B1: Replace `Buffer` usage in `lib/ble.ts` with a cross-platform base64 helper
- [ ] B6: Audit and fix all hardcoded hex values in components (PlayingCard, HomeLayer, AvatarPlaceholder)
- [ ] B19: Remove unused deps (`@shopify/flash-list`, `@react-native-async-storage/async-storage`, `react-native-nitro-modules`)
- [ ] P1: Sync `viewMode` to URL query params for deep-linkable surface states
- [ ] B8: Fix GlobalNavBar visibility logic to hide on any non-home viewMode regardless of route
- [ ] B15: Add Android elevation to active nav card

## Phase 2: Core Game (Hand + Table)
**Files:** `src/animations/deal.ts`, `src/animations/stack.ts`, `components/HandFan.tsx`, `components/HandStack.tsx`, `components/layers/TableLayer.tsx`, `components/PlayingCard.tsx`, `components/FlipCard.tsx`

- [ ] B7: Make `handFanTransform` accept `cardWidth` or `size` param
- [ ] B12: Improve hand reorder to support multi-position drag
- [ ] P4: Use container-aware layout for hand components (prevent overflow)
- [ ] B4: Fix TableLayer action bar duplication in non-pass mode
- [ ] D: Table redesign — opponent ring visualization, rich draw/discard piles, contextual action bar
- [ ] P7: Optimize FlipCard to avoid rendering both sides until first flip
- [ ] B11: Add animation cleanup in `useLayerSurfaceEntrance`

## Phase 3: Screens (Store, Profile, Presets, Settings)
**Files:** `app/store.tsx`, `app/profile.tsx`, `app/list.tsx`, `app/settings.tsx`, `src/store/profileStore.ts`, `src/store/presetsStore.ts`, `lib/iap.ts`

- [ ] F: Store redesign — equipped state, interactive preview, bundle pricing, owned badges
- [ ] Profile: map preset IDs to names in session history, hide empty stats for new users
- [ ] Settings: replace Switch with CardButton toggle pattern for consistency
- [ ] List: improve preset selection UX, fix nested pressables
- [ ] B14: Settings toggle inconsistency fix

## Phase 4: Pass Flow + Polish
**Files:** `components/PrivacyVeil.tsx`, `components/layers/PassLayer.tsx`, `components/EventHistoryModal.tsx`, `app/_layout.tsx`, `src/hooks/useMotion.ts`

- [ ] E: Pass screen redesign — recipient hero, circular hold ring, haptic ticks, remove fake dots
- [ ] B10: Fix PrivacyVeil zIndex for Android (use elevation)
- [ ] B9: Fix EventHistoryModal keys to use event IDs
- [ ] B18: Cancel rAF in EventHistoryModal on unmount
- [ ] P5: Add React error boundaries around major routes
- [ ] G: Accessibility pass — labels, hints, announceForAccessibility on turn changes

## Phase 5: Game Engine Hardening
**Files:** `src/engine/state.ts`, `src/engine/events.ts`, `src/store/gameStore.ts`, `src/engine/selectors.ts`

- [ ] P2: Add `canApplyEvent` validation guard in engine
- [ ] B5: Fix session history archival logic (check for already-ended sessions)
- [ ] P3: Snapshot + delta persistence strategy for game store
- [ ] Add `session/end` UI trigger in TableLayer

## Cross-Cutting Rules
- Run `npm run typecheck` after each phase
- Append `STATUS.md` after each phase
- Follow theme token system (no raw hex)
- Preserve existing animation feel (Material Emphasized, spring configs)
