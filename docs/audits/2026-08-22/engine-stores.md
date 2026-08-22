## Deckd Engine + Stores — Production Readiness Audit

### What I Did

- Audited `src/engine/` and `src/store/` statically, focusing on event sourcing, replay, multiplayer sync, persistence, selectors, and reducer purity.
- Ran targeted engine/store tests: **16 suites, 181 tests passed**.
- Ran full TypeScript validation: **passed**.
- Ran ESLint: **0 errors, 34 warnings**.
- Reviewed persistence adapters, event filtering, reducer guards, multiplayer bridge, and event-log growth.
- Read-only audit; **no files created or modified**.

---

## Findings

### 1. 🔴 Snapshot restore discards the canonical event-log baseline

- **Severity:** P1 — wrong behavior/data integrity
- **File:** `src/store/gameStore.ts:294-300`; `src/store/syncLogic.ts:233-243`
- **Evidence:** `applyRemoteSnapshot` stores only `result.appliedTail` in `events`, while `applySnapshotWithTail` folds the tail over the supplied snapshot.
- **Impact:** After a guest receives a snapshot, its `state` contains the full game, but its `events` contains only the tail. A later `ingestRemoteEvents()` calls `foldRemoteEvents()` over that tail and reconstructs from `emptyState()`, so the guest can lose the session-start/deal baseline or reject subsequent events. The in-memory state and event log become inconsistent.
- **Concrete fix:** Store an explicit snapshot baseline alongside the tail, or change the store to retain the full canonical event chain. At minimum, maintain `baseState`/`baseSeq` and fold future events from that baseline rather than from `emptyState()`.
- **Verification sketch:**
  ```ts
  create host session;
  applyRemoteSnapshot(host.state, host.seq + 1, []);
  ingestRemoteEvents([host.events.at(-1)!]);
  expect(useGameStore.getState().state.cards).toEqual(host.state.cards);
  expect(useGameStore.getState().state.meta.id).toBe(host.state.meta.id);
  ```

### 2. 🔴 Event validation is incomplete; arbitrary remote events can mutate invalid state

- **Severity:** P1 — wrong behavior/security boundary
- **File:** `src/engine/state.ts:154-181`
- **Evidence:** `canApplyEvent` returns `true` for every unlisted event type via `default: return true`; it does not validate session phase, actor ownership, card location, destination semantics, sequence continuity, or event identity.
- **Impact:** Any caller of `dispatch`, `ingestRemoteEvents`, or `applySnapshotWithTail` can apply lifecycle, turn, poker, privacy, and game events in invalid contexts. The multiplayer bridge has some intent checks, but the reducer itself is not an integrity boundary. Replayed or malformed remote events can alter turns, fold players, pause/end sessions, or place cards illegally.
- **Concrete fix:** Make event admissibility explicit per event type. Reject unknown/invalid events, enforce contiguous sequence/session identity at sync boundaries, validate actor/player ownership and phase, and validate card source/destination plus duplicate-card invariants.
- **Verification sketch:** Add negative tests for:
  - `turn/end` from the wrong actor.
  - `game/bet` from a non-current player.
  - `card/move` from an unrelated zone.
  - `session/end` on an empty state.
  - duplicate or out-of-order remote sequence numbers.

### 3. 🟡 `hand/reorder` can silently delete cards

- **Severity:** P1 — wrong behavior/data loss
- **File:** `src/engine/state.ts:164-169`, `314-320`
- **Evidence:** Validation only checks that every supplied ID exists in the hand; application sets `cardIds` to `event.order.filter(...)` without requiring the order to contain every existing card exactly once.
- **Impact:** A malformed or stale reorder event such as `{ order: [firstCard] }` permanently removes all other cards from the hand’s zone while leaving their `CardInstance` records pointing to the hand. This breaks zone/card consistency and can be triggered through direct dispatch or remote ingestion.
- **Concrete fix:** Require equal lengths, set equality, and uniqueness before applying; reject partial, duplicate, unknown, or reordered IDs that do not represent the complete hand.
- **Verification sketch:**
  ```ts
  const before = state.zones['hand:p1']!.cardIds;
  expect(canApplyEvent(state, reorderWithOnlyFirstCard)).toBe(false);
  expect(applyEvent(state, reorderWithOnlyFirstCard)).toBe(state);
  ```

### 4. 🟡 Native persistence silently degrades to volatile memory

- **Severity:** P1 — data loss on restart
- **File:** `lib/storage.ts:33-52`
- **Evidence:** Any MMKV import/initialization failure is caught and replaced with a process-local `Map`; MMKV `setItem` failures are not surfaced.
- **Impact:** On an Expo Go/runtime mismatch, NitroModules failure, storage corruption, or initialization problem, profile, presets, history, and active game data appear to save but disappear when the process restarts. The fallback has no user-visible durability warning.
- **Concrete fix:** Distinguish intentional Expo Go fallback from runtime/storage failure, expose a persistence-health flag, and either use a durable fallback or explicitly warn that progress is session-only. Do not silently swallow write errors.
- **Verification sketch:** Mock `createMMKV` to throw, call each persisted store action, reload the module/store, and assert either durable recovery or an explicit persistence-disabled state.

### 5. 🟡 Persistence migrations are absent for most stores

- **Severity:** P1 — upgrade corruption risk
- **Files:**  
  - `src/store/gameStore.ts:523-533`
  - `src/store/presetsStore.ts:72-88`
  - `src/store/sessionHistoryStore.ts:37-42`
  - `src/store/uiStore.ts:...`
- **Evidence:** Stores declare `version: 1` but provide no `migrate` function; only `profileStore` contains migration logic.
- **Impact:** Future schema changes to event payloads, presets, UI state, or history will hydrate old persisted JSON without validation or transformation. Because `gameStore` folds persisted events immediately, an old event schema can silently produce an incomplete or divergent state.
- **Concrete fix:** Add schema validation and migrations per store. For `gameStore`, validate the event discriminated union and either migrate known versions or discard/quarantine an incompatible active session.
- **Verification sketch:** Persist representative version-0 fixtures for every store, hydrate them under the current code, and assert normalized state plus a migration/version bump.

### 6. 🟡 Event-log operations become O(n²) over a long session

- **Severity:** P2 — performance
- **Files:** `src/store/gameStore.ts:275-280`; `src/store/gameStore.ts:515-518`; `src/store/gameStore.ts:528-532`
- **Evidence:** Every dispatch creates a new array with `events: [...events, full]`; every undo refolds the entire log; rehydration folds all persisted events.
- **Impact:** Long pass-and-play or poker sessions repeatedly copy and serialize the complete event log. Undo is explicitly full-log replay, and startup cost grows linearly with accumulated history. Combined with Zustand persistence after each update, this can cause frame drops and slow launch.
- **Concrete fix:** Persist periodic snapshots/checkpoints, retain only a bounded active tail, and use a reducer/checkpoint strategy for undo. Avoid serializing the entire event log on every action where possible.
- **Verification sketch:** Generate 10k events and benchmark dispatch, persistence serialization, rehydration, and undo. Set a production budget for action latency and startup replay time.

### 7. 🟡 Poker reducer accepts semantically invalid betting events

- **Severity:** P1 — wrong behavior
- **File:** `src/engine/state.ts:376-409`
- **Evidence:** `game/bet` clamps `amount` to available chips but does not validate action legality, current player, call amount, minimum raise, folded status, or whether the round is already complete.
- **Impact:** Direct or remote events can make a player “call” with an arbitrary amount, raise below the required minimum, bet after folding, or continue betting after a completed round. The rules layer may reject normal UI actions, but the event reducer does not preserve event-sourcing invariants if invalid events enter the log.
- **Concrete fix:** Put canonical betting validation in a shared pure function used both by `rules.apply` and `canApplyEvent`/`applyEvent`; reject rather than clamp invalid amounts.
- **Verification sketch:** Property tests covering fold-then-bet, non-current player, under-call, under-raise, all-in, negative, fractional, and post-round events.

### 8. 🟡 `eventId` is nondeterministic and not safely idempotent across regenerated logs

- **Severity:** P2 — maintainability/sync robustness
- **File:** `src/engine/events.ts:77-79`
- **Evidence:** IDs include `Math.random()`, despite sequence numbers being the deterministic event ordering key.
- **Impact:** Recreating an equivalent session produces different event identities. Identity-based deduplication in `selectNewEvents` (`src/store/syncLogic.ts:190-193`) cannot recognize semantically identical events generated independently. This increases duplicate risk around reconnects and retries.
- **Concrete fix:** Use a session-scoped deterministic event ID such as `${sessionId}:${seq}`, or require transport-level message IDs while deduplicating by `(sessionId, seq)` with payload conflict detection.
- **Verification sketch:** Generate the same event chain twice and assert identical IDs; send the same batch twice and assert no additional events are applied.

### 9. 🟡 Multiplayer broadcast cursor is global rather than session/recipient scoped

- **Severity:** P2 — sync correctness risk
- **File:** `src/store/multiplayerBridge.ts:31-40`, `101-113`
- **Evidence:** `lastBroadcastSeq` and `trackedSessionId` are module-level singleton values, while the host sends recipient-filtered deltas to all guests.
- **Impact:** Reconnects, multiple relay sessions, or overlapping guest delivery can cause a cursor reset or advancement that is not independently tracked per session/recipient. The current same-lobby reset handles one known case, but not concurrent or delayed transport scenarios.
- **Concrete fix:** Track cursors by `{ sessionId, guestId }`, advance only after successful send/ack, and include session ID plus sequence range in transport messages.
- **Verification sketch:** Simulate two guests, reconnect one, start a new session, and deliver delayed old-session events. Assert each guest receives exactly one ordered chain.

### 10. 🟡 Test coverage does not exercise persistence and failure paths

- **Severity:** P2 — test gap
- **Files:** `src/store/*.test.ts`; no dedicated persistence adapter tests found
- **Evidence:** Engine/store tests pass, but there are no focused tests for `lib/storage.ts`, hydration failure, migrations, corrupted JSON, MMKV fallback, snapshot baseline restoration, or long-log behavior.
- **Impact:** The highest-risk production paths—restart recovery and reconnect synchronization—are not protected by regression tests.
- **Concrete fix:** Add storage contract tests and integration tests for hydrate → action → persist → reload, corrupted payloads, migration fixtures, snapshot + tail + later event ingestion, and reconnect with delayed/duplicated batches.
- **Verification command:** `npm test -- --runInBand src/engine src/store lib/storage.test.ts`.

---

## Safety to Ship: **NO**

The engine’s ordinary tested flows are currently healthy—**181 targeted tests pass**, typechecking passes, and lint has no errors—but production readiness is blocked by event-log/snapshot divergence, incomplete reducer validation, and silent persistence loss. Multiplayer reconnect and restart behavior need explicit hardening before release.

## Five Highest-Leverage Fixes

1. **Fix snapshot restoration semantics** so the guest retains a valid event-log baseline or checkpoint.
2. **Make `canApplyEvent` a complete integrity boundary** with strict event/session/actor/card validation.
3. **Validate reorder events as complete permutations** to prevent silent hand-card loss.
4. **Replace silent volatile-storage fallback** with durable fallback or visible persistence failure handling.
5. **Add versioned migrations and recovery tests** for every persisted store, especially `gameStore` and reconnect flows.