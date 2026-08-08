# Deckd monetization setup

Status: 2026-08-08. The app code is wired; the store-side products are not. This doc is the checklist to go live.

## Product model

Host-pays. Only the lobby host needs a pass; guests join free. Each paying host brings 4-5 free guests into the app.

| Pass | Duration | Price | Product ID (use everywhere) |
|---|---|---|---|
| Deal | 24 hours | £0.99 | `deckd_pass_deal` |
| Draw | 3 days | £2.99 | `deckd_pass_draw` |
| Shuffle | 30 days | £5.99 | `deckd_pass_shuffle` |
| Master | lifetime | £24.99 | `deckd_master` |

Deal/Draw/Shuffle = non-renewing subscriptions (consumable-style, one purchase per duration). Master = non-consumable lifetime entitlement.

## What the app already does

- `lib/revenuecat.ts` — RevenueCat SDK configured from `app.json` extra keys or `EXPO_PUBLIC_REVENUECAT_*` env vars.
- `lib/iap.ts` — `purchaseProduct(productId)` buys by product id, `restorePurchases()` restores.
- `app/store.tsx` — pass cards with the four product ids, "Get pass" buttons, restore button.
- `components/layers/LobbyLayer.tsx` — hosting gated on `hasMasterPass` (cosmeticsStore).
- `src/store/cosmeticsStore.ts` — `hasMasterPass` entitlement flag (renamed from hasDeckdPlus).

## To go live (Josh, ~1 hour)

1. **RevenueCat dashboard**: create project, add iOS + Android apps.
2. **App Store Connect**: create 4 products (3 non-renewing subscriptions + 1 non-consumable) with the product IDs above, prices in GBP.
3. **Google Play Console**: create the same 4 products.
4. **RevenueCat**: create the 4 products, map to store products, create one offering "Default" containing all 4 packages.
5. **Keys**: put the RevenueCat public SDK keys in `app.json` → `expo.extra` (`revenueCatIosApiKey`, `revenueCatAndroidApiKey`) or EAS secrets. Never commit real keys.
6. **Entitlement wiring**: in RevenueCat, create an entitlement `master` and attach the Master product. In the app, `cosmeticsStore.setMasterPass(true)` should be called from a customer-info listener (not yet wired — see below).

## Not yet wired (next build slice)

- ~~**Entitlement listener**: `Purchases.addCustomerInfoUpdateListener` → set `hasMasterPass` from `entitlements.active['master']`.~~ **Wired (T4)** — `lib/entitlement.ts` + `app/_layout.tsx` install a customer-info listener and refresh on startup; `app/store.tsx` restore also re-syncs.
- ~~**Host auth token**: the relay server verifies a Master pass via `MASTER_TOKEN_SECRET` HMAC.~~ **Wired (T4)** — `computeMasterToken(clientId)` in `lib/entitlement.ts` mints `HMAC-SHA256(secret, clientId)` hex from `EXPO_PUBLIC_DECKD_MASTER_SECRET`; `lobbyStore.hostLobby` sends it by default. Dev (no secret) sends `undefined`.

### Server-side verification (production follow-up)

The HMAC token is a v1 shortcut: it proves the client knows a shared secret, not that the user has a live entitlement. Production should verify entitlements server-side via a **RevenueCat webhook** that grants the host a short-lived JWT upon receiving a validated `master` entitlement event. The HMAC path remains useful as a fallback or for trusted-client builds, but the webhook is the proper trust boundary. Out of scope for this card.

## Relay server env

```
PORT=8080
MASTER_TOKEN_SECRET=<shared secret>
```

Without `MASTER_TOKEN_SECRET` the server accepts any host (dev mode). With it, `create_room` requires `masterToken = HMAC-SHA256(secret, clientId)`.
