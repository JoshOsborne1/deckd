# Deckd MVP scope

## North star

Make Deckd a tactile, premium card table that people can play on one phone, and a place where a Deckd Master can host a lobby their friends join free from anywhere.

## MVP promise

A group can open Deckd, choose a simple preset, deal cards, pass the phone privately between players, and play with a real-feeling digital deck. A Deckd Master can host a multiplayer lobby; everyone else joins free.

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

### Multiplayer lobbies (paid hosting)

- Host creates a lobby with a join code.
- Guests join free with the code, from anywhere (cloud relay, not same-room).
- Turn-based play over the relay; host device is the source of truth.
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

- BLE multiplayer (dropped from the first build; revisit only as a free local bonus later).
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
- Table actions are obvious by looking at the screen.
- Phone safe areas and touch targets feel right.
- Desktop web works for fast design iteration.
- Typecheck, lint, and Expo Doctor pass.
