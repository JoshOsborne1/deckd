## Deckd relay/lib audit

### What I did

- Read-only review of the requested `lib/`, `server/`, sync, lobby, entitlement, RevenueCat, and app lifecycle code.
- Checked Git state/history.
- Ran:
  - `npm run typecheck` — passed.
  - `npm test -- --runInBand` — **22 suites / 225 tests passed**.
  - `node server/reconnect.e2e.test.js` — all reconnect checks passed.
- No files were created or modified.

---

## Findings

### 1. **P0 — Host authentication is forgeable because the signing secret is shipped to clients**

**File:** `lib/entitlement.ts:6-16,31-45`  
**Related:** `src/store/lobbyStore.ts:127-153`, `server/index.js:118-127`

`EXPO_PUBLIC_DECKD_MASTER_SECRET` is explicitly read by the client and used to calculate the HMAC token. Any user who extracts the application bundle can recover the secret and mint valid host tokens for arbitrary client IDs. The comment claiming the secret is “NOT embedded in the binary” is contradicted by the `EXPO_PUBLIC_*` implementation.

Additionally, `hostLobby()` computes/sends a token without checking `hasMasterPass`; the relay authenticates possession of the shared secret, not a RevenueCat entitlement.

**Impact:** Anyone can host paid lobbies and bypass the intended IAP gate. If `MASTER_TOKEN_SECRET` is absent in production, `server/index.js:119-127` accepts every host anyway.

**Fix:**

- Remove the shared secret from the client entirely.
- Verify RevenueCat entitlement server-side, preferably through webhook-backed customer identity or a short-lived server-issued host grant/JWT.
- Fail closed at startup if production `MASTER_TOKEN_SECRET`/entitlement verification is not configured.
- Do not treat `EXPO_PUBLIC_*` as secret material.

**Verification:**

- Inspect the production bundle and assert no signing secret exists.
- Attempt `create_room` with arbitrary client IDs/tokens; only a server-issued, unexpired grant should succeed.
- Test production configuration with missing auth settings and assert hosting is rejected.

---

### 2. **P0 — Host reconnect can be hijacked during the grace window**

**File:** `server/index.js:129-145`

When `create_room` includes a valid room code, the server checks only:

```js
existing && existing.hostGraceUntil && Date.now() < existing.hostGraceUntil
```

It does not verify that the reconnecting client has the original host identity or a server-issued resume token. Therefore, any party that knows or guesses the six-character room code can reclaim the host role during the 30-second grace period, subject only to the currently configured token behavior.

This is especially exploitable when `MASTER_TOKEN_SECRET` is unset, and becomes directly exploitable once the client-side secret from Finding 1 is extracted.

**Fix:**

- Store a cryptographically random, single-use host resume token separately from the room code.
- Require that token for host reclaim.
- Bind it to the original host/session identity and invalidate it after use.
- Do not use room code as an authentication credential.

**Verification:**

- Drop the host, then connect with the room code and a different client identity/token; assert reclaim is rejected.
- Reconnect with the valid resume token; assert reclaim succeeds once and token reuse fails.

---

### 3. **P1 — Duplicate `clientId` values overwrite live sockets and can cause identity/session corruption**

**File:** `server/index.js:180-205`

A normal guest join executes:

```js
room.clients.set(ws.clientId, ws);
```

without checking whether that client ID is already present. A second socket can replace the first socket in the map. When the old socket later closes, its `close` handler executes `room.clients.delete(ws.clientId)`, potentially deleting the replacement socket’s map entry and creating a ghost/untracked connection.

The same issue exists for host reclaim at `server/index.js:141`.

**Fix:**

- Reject duplicate active client IDs, or explicitly close the old connection before replacing it.
- In close handlers, delete only if `room.clients.get(ws.clientId) === ws`.
- Use a server-issued connection/session nonce rather than trusting client IDs as unique identities.

**Verification:**

- Join twice with the same client ID.
- Assert one deterministic connection remains, the roster is correct, and closing the old socket does not remove the new one.

---

### 4. **P1 — No WebSocket message-size limit or rate limiting**

**File:** `server/index.js:90,99-110,226-243`

The WebSocket server is created without an explicit `maxPayload`. The `relay` path accepts arbitrary payload strings and broadcasts them to every room member. There is also no per-connection or per-room message rate limit.

A client can send very large JSON payloads or a high volume of relay messages, causing CPU/memory pressure through repeated `JSON.parse`, `JSON.stringify`, and fan-out. Since `room.lastActivity` is updated for every relay, an attacker can also keep a room alive indefinitely by continuously sending traffic.

**Fix:**

- Configure a small explicit `maxPayload` appropriate to event batches.
- Validate payload type and byte length before relay.
- Add token-bucket/message-count limits per socket and per room.
- Close or throttle abusive connections.
- Consider a separate limit for join/create attempts by IP at the proxy/Cloudflare layer.
- Add backpressure handling and avoid queuing unbounded broadcasts.

**Verification:**

- Send payloads above the configured limit and assert the connection is closed.
- Flood relay messages and assert throttling/closure.
- Confirm normal event batches remain below the documented limit.

---

### 5. **P1 — Relay protocol has no runtime schema validation or protocol-version negotiation**

**Files:** `lib/relayProtocol.ts:9,51-58`; `server/index.js:99-112,226-243`; `lib/relayTransport.ts:132-137,232-248`

`RELAY_PROTOCOL_VERSION` is declared but never sent or checked. `parseRelayMessage()` only verifies that parsed JSON has a `type`; it casts arbitrary objects to the protocol union. The server similarly accepts arbitrary `type` payloads and arbitrary relay targets/payloads.

The transport then assumes host payloads are `GameEvent[]` and guest payloads have `{intent, payload}` without validating shape, event count, sequence bounds, or sender semantics.

**Impact:** Version skew, malformed messages, oversized nested data, and incompatible event schemas can cause silent drops, callback errors, or divergent guest state.

**Fix:**

- Add `version` to every wire message and reject unsupported versions.
- Implement runtime validators for every message kind, preferably with a schema library or explicit guards.
- Validate event batches, intent names, payload sizes, sequence numbers, and maximum batch lengths.
- Return structured protocol errors rather than silently ignoring malformed messages.

**Verification:**

- Test unsupported versions, missing fields, wrong field types, malformed event arrays, and oversized batches.
- Assert deterministic error responses and no state mutation.

---

### 6. **P1 — Host-side intent validation is incomplete and relies on unsafe casts**

**File:** `src/store/multiplayerBridge.ts:172-230`

The bridge casts arbitrary guest payloads:

```ts
const p = (payload ?? {}) as { ... }
```

and casts arbitrary action strings into `GameAction`:

```ts
game.gameAction(action as ...GameAction, playerId);
```

Some actions are constrained by turn/ownership checks, but there is no explicit allowlist or runtime validation at the relay boundary. This leaves correctness and denial-of-service behavior dependent on the engine’s internal handling of malformed strings and payload values.

**Fix:**

- Validate intent names against a fixed allowlist.
- Validate every payload field, including card ID, zone ID, face, and action grammar.
- Reject unknown actions before calling the engine.
- Add per-player intent rate limits and intent IDs for deduplication.

**Verification:**

- Fuzz each intent with `null`, arrays, deeply nested objects, huge strings, invalid IDs, and unknown action names.
- Assert no exception, no unauthorized state change, and bounded processing time.

---

### 7. **P1 — Snapshot request is not bound to the requesting guest**

**Files:** `lib/relayTransport.ts:308-312`; `src/store/multiplayerBridge.ts:243-248,269-274`; `server/index.js:230-243`

A guest sends `request_snapshot` to the host. The host’s `sendFullSnapshot()` then iterates over **all guests** and sends the full filtered event chain to each guest, rather than responding only to the requester.

The filtering is recipient-specific, so this does not directly expose another guest’s hidden cards, but it causes unnecessary bandwidth and can repeatedly transmit the full event log to every guest if one guest requests a snapshot. There is also no request ID or response correlation.

**Fix:**

- Preserve the sender identity through the host callback.
- Send the snapshot only to `fromClientId`.
- Add request IDs and rate-limit snapshot requests.
- Keep a per-guest sequence/ack baseline.

**Verification:**

- Have guest A request a snapshot and assert guest B receives no snapshot relay.
- Issue repeated requests and assert throttling.

---

### 8. **P1 — No delivery acknowledgment, sequence-gap detection, or retry**

**Files:** `lib/relayTransport.ts:280-312`; `src/store/syncLogic.ts:186-211`; `src/store/multiplayerBridge.ts:109-120`

`sendEvents()` and `sendEventsTo()` resolve immediately after calling `ws.send()`. There is no acknowledgment from the recipient, no event-batch ID, no retry, and no sequence-gap recovery. `selectNewEvents()` deduplicates by event ID, but missing batches are not detected.

A transient socket failure or dropped message can leave a guest permanently divergent until a manually triggered reconnect/snapshot occurs.

**Fix:**

- Add batch IDs, highest contiguous sequence, ACKs, and bounded retries.
- Detect sequence gaps before folding.
- Request a targeted snapshot when a gap is detected.
- Keep per-guest send cursors rather than one global host cursor.

**Verification:**

- Drop one relay batch in a test transport.
- Assert the guest detects the gap, requests a snapshot, and converges to the host state.

---

### 9. **P1 — Transport can lose messages and mishandle socket errors during partial/closed writes**

**File:** `lib/relayTransport.ts:280-284,286-299`

`send()` silently does nothing when the socket is not open. Calls to `ws.send()` are not wrapped in error handling and do not inspect callback errors or `bufferedAmount`. `sendEvents()` promises resolve even if no message was sent.

During reconnect transitions, game events can therefore be silently discarded while the app believes the operation completed.

**Fix:**

- Make send operations reject when disconnected.
- Queue only bounded, explicitly retryable messages.
- Use the WebSocket send callback/error path where available.
- Track connection generation so an old socket cannot satisfy a new send.
- Add ACK-based completion for event batches.

**Verification:**

- Call `sendEvents()` while connecting/closing and assert it rejects or queues according to documented behavior.
- Force socket closure immediately before send and verify no false success.

---

### 10. **P2 — HMAC comparison is not timing-safe**

**File:** `server/index.js:120-125`

The server compares HMAC strings using `msg.masterToken !== expected`. This is not constant-time.

This is lower risk over a public network because network noise makes practical timing attacks difficult, but it is avoidable hardening for an authentication boundary.

**Fix:**

- Validate exact hex format and length.
- Compare decoded bytes using `crypto.timingSafeEqual()`.

**Verification:**

- Unit-test valid, invalid-length, malformed, and near-match tokens.
- Ensure malformed tokens are rejected without throwing.

---

### 11. **P2 — Room-code entropy is adequate for casual use but lacks brute-force controls**

**File:** `server/index.js:16-32,169-205`

The code space is approximately 31⁶ possibilities, but `join_room` has no rate limit, IP tracking, progressive delay, or lockout. An attacker can enumerate room codes at scale, especially through multiple connections or proxy infrastructure.

The room code is not the sole authorization for joining; however, it is the discoverability boundary for live lobby metadata and relay access.

**Fix:**

- Add per-IP and per-connection join-attempt limits.
- Add exponential backoff after repeated `room_not_found`.
- Consider a longer code or server-issued invite token.
- Avoid exposing detailed differences between nonexistent, expired, and inaccessible rooms if enumeration is a concern.

**Verification:**

- Run repeated invalid joins and assert rate limiting.
- Confirm legitimate users can still join within reasonable limits.

---

### 12. **P2 — `player_left` callback is broken in the client transport**

**File:** `lib/relayTransport.ts:225-230`

The code filters the player list first, then tries to find the removed player:

```ts
this.players = this.players.filter((p) => p.clientId !== msg.clientId);
const left = this.players.find((p) => p.clientId === msg.clientId);
```

`left` is therefore always `undefined`, so `onPlayerLeft` never fires.

This affects roster/UI cleanup and any per-player state cleanup attached to that callback.

**Fix:**

- Capture the player before filtering, or construct it from the server message.

**Verification:**

- Add a test asserting `onPlayerLeft` receives the removed player.

---

### 13. **P2 — Heartbeat can accumulate overlapping pong timers**

**File:** `lib/relayTransport.ts:177-187`

Each heartbeat interval creates a new `pongTimeout` without first clearing an existing timeout. Normally the previous timeout is cleared by a pong, but delayed/multiple heartbeat conditions can leave stale timers. A stale timer may close a currently healthy socket.

**Fix:**

- Clear any existing pong timeout before creating a new one.
- Track heartbeat generation/socket identity.
- Prefer WebSocket ping/pong where supported by the runtime.

**Verification:**

- Use a fake timer test with delayed and duplicated pong events.
- Assert a stale timeout cannot close a healthy newer connection.

---

### 14. **P2 — Entitlement state is fail-closed, but local state can become stale**

**Files:** `lib/revenuecat.ts:21-47`; `lib/entitlement.ts:52-67`; `app/_layout.tsx:49-66`

The positive path correctly requires an active RevenueCat `master` entitlement, and unconfigured/error paths leave the entitlement disabled. Listener cleanup is present and appears correct.

However, `getCustomerInfo()` errors are swallowed at `app/_layout.tsx:54-56`, and there is no explicit invalidation on logout/account switch or a failed refresh after an entitlement revocation. Depending on store persistence and RevenueCat lifecycle, a previously enabled local `hasMasterPass` could remain stale.

This is not a direct relay bypass because the relay currently relies on the flawed client-minted token path, but it weakens entitlement correctness.

**Fix:**

- Explicitly set `hasMasterPass(false)` on customer-info failure when the account/session is no longer trusted.
- Handle RevenueCat customer identity changes and logout.
- Keep server authorization authoritative for hosting.

**Verification:**

- Test active → revoked, active → offline, account switch, restore failure, and app restart transitions.
- Assert hosting authorization follows server truth rather than cached local state.

---

## Privacy-filter assessment

**File:** `src/store/syncLogic.ts:41-178`

The main privacy filter is directionally sound:

- It rewrites hidden card IDs to stable placeholders.
- It strips `session/start.meta.rngSeed` at lines 107-110.
- It emits `card/identify` only when a card becomes visible.
- Host broadcasts use `filterEventsForViewer()` before `sendEventsTo()` in `src/store/multiplayerBridge.ts:115-120,139-144`.

I did not find a current host broadcast path that directly sends the raw event log to guests. However:

- `card/identify` is passed through defensively at `syncLogic.ts:166-169`; future or malicious upstream use could leak `realId`.
- The filter is not a security boundary against a malicious host. A host can intentionally send unfiltered events because the server is a dumb pipe.
- Runtime event validation is absent, so privacy assumptions depend on trusted host/client code.

The privacy model should therefore be documented as **honest-host privacy**, not cryptographic confidentiality.

---

## Highest-leverage fixes, ranked

1. **Replace client-side HMAC entitlement with server-side RevenueCat-backed authorization** and remove `EXPO_PUBLIC_DECKD_MASTER_SECRET`.
2. **Require a random, single-use host resume token** for reclaim; never let room code alone authenticate host migration/reconnect.
3. **Add WebSocket payload caps, relay validation, and rate limits** at both connection and room levels.
4. **Add protocol versioning, runtime schemas, ACKs, sequence-gap detection, and targeted snapshot recovery.**
5. **Fix duplicate client-ID handling and send/error semantics** so reconnects cannot corrupt membership and outbound events cannot report false success.

### Ship assessment

**No-go for paid production multiplayer** until Findings 1–4 are addressed. The current automated tests pass and basic reconnect behavior works, but the authentication design is bypassable, host reclaim is not identity-bound, and the relay has no resource controls or delivery guarantees.