/**
 * Entitlement wiring — maps the RevenueCat `master` entitlement to the
 * cosmeticsStore `hasMasterPass` flag, and mints the HMAC host token the
 * relay server expects when MASTER_TOKEN_SECRET is set.
 *
 * The shared secret is NOT embedded in the binary. It is read from the
 * `EXPO_PUBLIC_DECKD_MASTER_SECRET` env var, which is only present in
 * EAS builds that inject it at build time (see docs/MONETIZATION.md).
 * When absent (local dev, or a build without the secret), masterToken is
 * undefined — the dev relay server accepts any host when
 * MASTER_TOKEN_SECRET is unset, and a production server without the
 * env var also accepts any host.
 *
 * Production note: the HMAC token is a v1 shortcut. The proper path is
 * server-side entitlement verification via a RevenueCat webhook that
 * grants the host a short-lived JWT. That is out of scope for this card.
 */

import sha256 from 'js-sha256';
import type { CustomerInfo } from 'react-native-purchases';

import { useCosmeticsStore } from '@store/cosmeticsStore';

/** RevenueCat entitlement identifier for the Deckd Master pass. */
export const MASTER_ENTITLEMENT_ID = 'master';

/**
 * Read the Master shared secret from the public env var.
 * Returns undefined when the env var is not set (dev, or a build without it).
 */
export function getMasterSecret(): string | undefined {
  const secret = process.env.EXPO_PUBLIC_DECKD_MASTER_SECRET;
  return secret && secret.length > 0 ? secret : undefined;
}

/**
 * Compute the host token the relay server expects: HMAC-SHA256(secret, clientId) hex.
 * Mirrors `crypto.createHmac('sha256', secret).update(clientId).digest('hex')`
 * on the server (server/index.js). Returns undefined when no secret is
 * configured (dev mode — the server accepts any host).
 */
export function computeMasterToken(clientId: string): string | undefined {
  const secret = getMasterSecret();
  if (!secret) return undefined;
  return sha256.hmac(secret, clientId);
}

/**
 * Read the `master` entitlement from a CustomerInfo object.
 * Returns true only when the entitlement is present AND active.
 */
export function hasMasterEntitlement(customerInfo: CustomerInfo): boolean {
  const active = customerInfo.entitlements?.active;
  if (!active) return false;
  const entry = active[MASTER_ENTITLEMENT_ID];
  return Boolean(entry?.isActive);
}

/**
 * Sync the cosmeticsStore `hasMasterPass` flag from a CustomerInfo object.
 * Safe to call with undefined (no-op) so callers can pass through errors
 * without a guard. Returns the resolved boolean for convenience/tests.
 */
export function syncMasterPassFromCustomerInfo(customerInfo?: CustomerInfo): boolean {
  const enabled = customerInfo ? hasMasterEntitlement(customerInfo) : false;
  useCosmeticsStore.getState().setMasterPass(enabled);
  return enabled;
}