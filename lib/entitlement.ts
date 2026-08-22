/**
 * Entitlement wiring — maps RevenueCat's `master` entitlement to the local
 * cosmetics flag. Hosting authorization is intentionally server-side only.
 * Never put a signing secret in an EXPO_PUBLIC_* variable: those values ship
 * in the JavaScript bundle and are not secrets.
 */

import type { CustomerInfo } from 'react-native-purchases';
import { useCosmeticsStore } from '@store/cosmeticsStore';

export const MASTER_ENTITLEMENT_ID = 'master';

/**
 * Deprecated compatibility surface. A client must never read or derive the
 * relay signing secret. A future server-issued grant should be passed to
 * hostLobby explicitly after server-side entitlement verification.
 */
export function getMasterSecret(): string | undefined {
  return undefined;
}

/** Always returns undefined. Kept so old callers/tests fail closed safely. */
export function computeMasterToken(_clientId: string): string | undefined {
  return undefined;
}

export function hasMasterEntitlement(customerInfo: CustomerInfo): boolean {
  const active = customerInfo.entitlements?.active;
  if (!active) return false;
  return Boolean(active[MASTER_ENTITLEMENT_ID]?.isActive);
}

export function syncMasterPassFromCustomerInfo(customerInfo?: CustomerInfo): boolean {
  const enabled = customerInfo ? hasMasterEntitlement(customerInfo) : false;
  useCosmeticsStore.getState().setMasterPass(enabled);
  return enabled;
}
