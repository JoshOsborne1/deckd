# Deckd MVP scope

## North star

Make Deckd a tactile, premium deck of cards living on phones: a trusted group can play on one shared device, on personal devices, across a dual-end board, or with one public table phone and private hand phones. A Deckd Master can host a lobby their friends join free from anywhere.

## MVP promise

A group can open Deckd, choose a simple preset, deal cards, and play through the same physical-card grammar across the supported surface modes. A Deckd Master can host a multiplayer lobby; everyone else joins free. Cards, piles, chips, and the turn token are the controls for the actions they represent; button-first card actions are not the primary play path.

## In scope

### Core play

- 2 to 6 players.
- Standard 52-card deck.
- Optional jokers.
- Presets for freeplay, deal 2 each, poker-ish, blackjack-ish.
- Draw from deck.
- Discard/play to table.
- Flip/reveal cards.
- Reorder hand.
- Pass turn.
- Privacy veil before the next player sees their hand.
- End/reset session.

### Surface modes

The controlled rebuild includes four product modes. A game is only exposed on a mode after its geometry, privacy, accessibility, transport, and release-device checks pass; the scope does not promise every preset on every surface.

- **Hot-seat pass-and-play:** one phone, private hands, intentional pass veil and handoff ritual.
- **Personal-device multiplayer:** one seat per personal device, with online relay or same-room nearby transport; both transports share the session contract.
- **Dual-end board:** exactly two trusted face-to-face players share one phone from opposite ends; hold-to-peek re-veils on release and is shoulder-surf resistant, not cryptographic privacy.
- **Phone Deck:** one public-table phone renders deck, piles, community, scores, and turn state; private-hand phones render only their owners' hands and legal interactions.

The four product modes map to the presentation profiles `hot-seat`, `personal-table`, `dual-end-board`, and the Phone Deck pair `public-table` + `private-hand`.

### Multiplayer lobbies (paid hosting)

- Host creates a lobby with a join code.
- Guests join free with the code, from anywhere (cloud relay, not same-room).
- Turn-based play over the relay; an authoritative room runtime is the source of truth, clients send typed intents, and each recipient receives only its permitted projection.
- Hosting requires a Deckd Master pass.
- Passes: Deal (24h), Draw (3d), Shuffle (30d), Master (lifetime).

### UI

- Premium off-white/crimson shell.
- Real table surface with seat ring, draw/discard wells, hand zone, and action rail.
- Deck-staging setup hub.
- Peeking-card global nav.
- Pass ritual that feels intentional, not like a modal blocker.
- Touch-first layout on small phones.

### Local personalization

- Nickname.
- Avatar seed.
- Local card back/theme equip state.

## Out of scope for v1

- Raw BLE GATT multiplayer or BLE as a product-facing mode (dropped; nearby uses Google Nearby Connections through a local Expo module).
- Apple Multipeer Connectivity (banned; Xcode 27 deprecates the framework; local fallback is Network framework/Bonjour or an equivalent client-server transport).
- Real money/stakes tracking.
- Auth/accounts (join codes are anonymous).
- Analytics.
- Custom rules DSL.
- Rive runtime.
- App Store paid acquisition.
- Social sharing/community features.

## Success criteria

- User can complete a pass-and-play session without confusion.
- A Master can host a lobby and guests can join and play a full turn cycle.
- Each supported surface mode has a documented eligible-game matrix; unsupported combinations are not shown.
- Online and nearby clients receive recipient-filtered projections and never receive canonical private deck state.
- Table actions are obvious by looking at the screen.
- Phone safe areas and touch targets feel right.
- Desktop web works for fast design iteration.
- Typecheck, lint, and Expo Doctor pass.
