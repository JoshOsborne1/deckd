# ADR-0003: Internet rooms move authority into the server runtime

- Status: Accepted
- Date: 2026-08-24
- Decision scope: cloud multiplayer, relay migration, privacy-safe projections
- Source: `.hermes/plans/2026-08-23_201024-deckd-physical-card-rebuild-blueprint.md` §§7.4–7.5, 8.2, 8.4

## Context

The current relay path was built around a host device broadcasting the event stream. That is a useful compatibility bridge, but it makes the client that hosts a lobby a privileged observer of canonical deck order and every private hand. It also allows delivery timing to be confused with authority and makes retries unsafe unless duplicate intents are explicitly identified.

Deckd's product promise includes personal hands and a Phone Deck table. A public-table client must never receive private hand identities, and a private-hand client must not receive opponents' hands or canonical deck order. Filtering after rendering is too late: event logs, snapshots, reconnect payloads, diagnostics, and accessibility labels can leak the same information.

## Decision

Cloud rooms are owned by an **authoritative room runtime on the server**. Clients send typed intents; the room runtime validates the actor, topology, turn, legality, idempotency, and current sequence, reduces accepted events with the shared framework-free engine, and emits recipient-filtered projections.

The relay becomes a transport adapter. It does not decide game rules, mutate client-owned canonical state, or broadcast an unfiltered event log.

### Commit and ACK ordering

For every accepted intent:

1. Validate the intent and its idempotency ID.
2. Reduce the resulting event(s) against the authoritative state.
3. Append the committed event batch durably with its transaction/action ID and monotonic sequence.
4. Persist the snapshot/tail checkpoint needed for reconnect and recovery.
5. Return the accepted result and committed sequence to the sender.
6. Broadcast recipient-filtered projections only after durable commit and ACK readiness.

An optimistic client animation may show a visibly pending action, but it is never treated as truth and must reconcile to the committed transaction. If durability or validation fails, no broadcast occurs and the client receives a recoverable rejection.

### Idempotency and ordering

- Every intent carries a unique idempotency ID scoped to the room and actor/session binding.
- A duplicate returns the original accepted/rejected result and committed sequence; it does not append or broadcast a second event.
- Events carry a monotonic sequence, schema version, source/destination zone IDs where applicable, and a stable transaction/action ID.
- A recipient that detects a gap requests a snapshot plus event tail; it never invents missing state from animation.
- Reconnect reclaims a seat with a resume token and closes an old duplicate binding before the new one is active.

### Recipient-filtered projections

Canonical card IDs and deck order stay inside the authority boundary. Before serialisation:

- public-table clients receive deck/shoe, public piles, community, tricks, books, runs, pot, scores, and turn state, but no private hand identities;
- private-hand clients receive their own hand plus the minimum public state needed for legal interaction, but no opponent hands or canonical deck order;
- a card receives an opaque per-viewer ID until a reveal makes its identity legal for that recipient;
- a Phone Deck transaction carries one transaction ID across the table-side and hand-side presentation halves;
- the same recipient filter applies to snapshots, event tails, reconnect payloads, accessibility strings, diagnostics, and crash reports.

Nearby-host rooms follow the same projection discipline where possible, but their trusted-host limitation is explicit in product/help copy. The server-authoritative requirement applies to internet rooms; device role and authority remain independent.

## Rationale

- A server runtime prevents a paying host from inspecting the full deck from its client.
- Durable commit before broadcast makes ACKs meaningful and reconnects reproducible.
- Idempotent intents make retries safe across relay and nearby chaos.
- Filtering before serialisation establishes one privacy boundary rather than many UI-specific hiding rules.
- A shared reducer and golden replay fixtures keep server and clients behaviour-compatible.

## Consequences

### Positive

- Server state, event history, snapshots, and projections are the source of truth for internet rooms.
- Public-table and private-hand phones can be composed from the same transaction without duplicating game logic.
- Gap recovery and duplicate delivery become testable protocol behaviour.

### Costs and constraints

- The server must package the same engine contract/version as the client and own durable room storage.
- A network action has a pending state and can be rejected; client presentation must remain reversible.
- Relay E2E tests must cover duplicate, delayed, dropped, out-of-order, reconnect, gap, and version-mismatch cases.
- Nearby remains honest-host by necessity; it cannot be advertised as equivalent to server privacy.

## Migration and acceptance

1. Keep the current host relay as a compatibility adapter while Phase 2 introduces `SessionRuntime` and the server room boundary.
2. Fold every Phase 0 baseline fixture through the server runtime and compare the resulting rules state byte-for-byte with the existing engine fold.
3. Prove that duplicate intents append zero additional events and produce the original result.
4. Prove that a public-table projection contains no private hand IDs or canonical deck order, and a private-hand projection contains only its owner's private IDs plus public state.
5. Prove durable ACK-before-broadcast ordering by forcing a persistence failure and observing no recipient update.
6. Prove snapshot-plus-tail recovery reproduces the authority state and committed sequence exactly.

## Rejected alternatives

- Host-client authority for internet rooms: rejected because the host can inspect canonical private state and delivery/authority remain coupled.
- Broadcast-then-persist: rejected because a crash can make clients observe a transaction the authority cannot recover.
- Render-then-hide secrets: rejected because serialised logs, snapshots, accessibility, and diagnostics can still leak them.
