# ADR-0002: Nearby uses Google Nearby Connections behind a local Expo module

- Status: Accepted, subject to the spike gates below
- Date: 2026-08-24
- Decision scope: personal-device nearby play and Phone Deck local connectivity
- Source: `.hermes/plans/2026-08-23_201024-deckd-physical-card-rebuild-blueprint.md` §§8.2, 13, 14

## Context

“Nearby” is a product capability, not a radio protocol. Deckd needs discovery, an explicit join decision, encrypted reliable payload transfer, framing, reconnect, seat resume, and cross-platform behaviour. A raw BLE GATT implementation would leave those session responsibilities to Deckd while adding custom native builds, permission handling, MTU/chunking constraints, and physical-device risk.

Apple Multipeer Connectivity is not an acceptable replacement: Xcode 27 deprecates the framework. The rebuild must not create a new dependency on a deprecated Apple peer-to-peer API or present BLE as a product mode.

## Decision

Use **Google Nearby Connections** through a local Expo module. The module is the only native boundary for discovery and nearby payload delivery; the generated `ios/` and `android/` folders remain generated and are never hand-edited.

Product copy says **Nearby**, never BLE. The canonical session still uses the independent topology values from ADR-0001: Nearby is normally `TransportKind: 'nearby'`, and the host is represented as `Authority: { kind: 'nearby-host', peerId }`.

The transport adapter carries typed session intents, accepted/rejected results, committed event batches, ACKs, snapshots, and reconnect metadata. It does not implement game legality or own canonical game state.

### Fallback

If the Nearby spike fails any release gate, use a local client-server adapter over Apple's **Network framework with Bonjour/service discovery** (and the equivalent reliable Android networking path). The fallback remains a client-server transport with the same intent/event protocol. It is not Multipeer Connectivity and it is not raw BLE GATT.

## Spike gates

The adapter is retained only if all of these checks pass on release/dev-client builds and physical devices:

1. iOS host → Android guest discovery and join.
2. Android host → iOS guest discovery and join.
3. Host creates a short-lived table identity; a guest sees the host, game, and seat before accepting.
4. Nearby endpoints display a short mutual verification code and reject an unverified join.
5. Event batches, ACKs, snapshot requests, and gap recovery survive realistic payload sizes without duplicate or out-of-order state.
6. Background/foreground transitions preserve the room, seat, resume token, and committed sequence; a duplicate client closes the old binding.
7. Radio-off and permission-denied paths explain the manual recovery action and return to a non-destructive waiting state, including the announced late-2026 Nearby radio behaviour.
8. No-internet operation works for the nearby path, while canonical engine folds remain deterministic.
9. Privacy tests confirm that a nearby client receives only its recipient-filtered projection; nearby's trusted-host limitation is stated in help copy.

A browser mock can validate protocol shape and deterministic state, but it cannot sign off discovery, radio permissions, background behaviour, haptics, frame pacing, or cross-platform release-device feel.

## Rationale

- Nearby Connections supplies the cross-platform discovery and encrypted transfer capability the product needs without making Deckd own a radio stack.
- A local Expo module keeps native code behind one replaceable boundary.
- The client-server fallback preserves the runtime contract and avoids a second game-specific implementation.
- Explicit spike gates stop a promising API from becoming an unverified production dependency.

## Consequences

### Positive

- Internet and nearby personal-device sessions can share the same runtime and projection contract once connected.
- The fallback can be tested with the same chaos, ACK, reconnect, and snapshot fixtures.
- Product language stays stable if the underlying radio or local transport changes.

### Costs and constraints

- Nearby requires a development/release client; it is not an Expo Go-only feature.
- Both iOS↔Android directions and background cases require physical testing.
- Nearby-host sessions are trusted-host sessions by necessity; they are not equivalent to server-authoritative internet privacy.
- The module must expose failure states instead of silently falling back or pretending a connection exists.

## Rejected alternatives

- **Raw BLE GATT:** rejected as a production multiplayer architecture; it is device plumbing, not a complete session transport.
- **Multipeer Connectivity:** rejected and banned because Xcode 27 deprecates the framework.
- **Transport-specific game rules:** rejected; the transport only delivers typed intents and committed protocol messages.
