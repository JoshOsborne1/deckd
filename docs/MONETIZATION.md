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

- **Entitlement listener**: `Purchases.addCustomerInfoUpdateListener` → set `hasMasterPass` from `entitlements.active['master']`. Currently the flag is only set manually.
- **Host auth token**: the relay server verifies a Master pass via `MASTER_TOKEN_SECRET` HMAC. The app must mint that token from the RevenueCat entitlement (server-side verification via RevenueCat webhook is the proper path; HMAC is the v1 shortcut).

## Relay server env

```
PORT=8080
MASTER_TOKEN_SECRET=<shared secret>
```

Without `MASTER_TOKEN_SECRET` the server accepts any host (dev mode). With it, `create_room` requires `masterToken = HMAC-SHA256(secret, clientId)`.
