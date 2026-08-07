# Deckd iteration workflow

This repo is prepared for close design/functionality iteration in Cursor using Composer 2.5, GLM 5.2, Grok Build, or similar coding models.

## Always-on live loop

Use two terminals:

### Terminal A: desktop app

```bash
npm run dev:web
```

Keep the browser open at the printed localhost URL. This is the fast design loop.

### Terminal B: checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

Run checks after each meaningful slice.

## Phone loop

For normal LAN phone testing:

```bash
npm run dev
```

This uses port `8082`, so desktop web can keep running on `8081`. Scan the QR with Expo/dev client. If LAN discovery is unreliable:

```bash
npm run dev:tunnel
```

For native BLE/dev-client work:

```bash
npm run dev:phone
```

This also uses port `8082`. Expo Go is not enough for native BLE module work. Use a development build.

## Cursor model usage

Use small, sharp prompts. Do not ask a model to redesign the whole app.

Good prompt shape:

```text
Read AGENTS.md, STATUS.md, docs/MVP_SCOPE.md.
Work only on components/layers/TableLayer.tsx and any tiny helper it needs.
Goal: make the draw/discard/table wells read like a real card table on 390px mobile.
Do not touch BLE, IAP, custom rules, or dependencies.
Keep existing game store behavior.
Run npm run typecheck and npm run lint.
```

## Recommended implementation order

1. `TableLayer`: table geometry, seat ring, draw/discard wells, action rail.
2. `HubLayer`: deck-staging setup, fewer chips, stronger deal path.
3. `PrivacyVeil` / `PassLayer`: pass ritual and clear recipient state.
4. `GlobalNavBar`: peeking cards and game medallion polish.
5. `store/profile/list`: only after play loop feels good.

## Design iteration rules

- One surface per model run.
- Screenshot after each UI change.
- Test at phone width, not just desktop-wide browser.
- Keep copy sparse and concrete.
- No casino neon.
- No generic SaaS cards.
- No roadmap/dev copy in user UI.
- No fake BLE-ready language.

## Functional iteration rules

- Preserve event-sourced game state.
- Add selectors/helpers instead of stuffing logic into components.
- Pass-and-play behavior must remain reliable.
- Any gesture change must be tested on phone.
- If a feature needs BLE, park it in `docs/PARKED_BLE.md` instead of half-building it.
