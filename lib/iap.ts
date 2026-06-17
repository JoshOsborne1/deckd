/**
 * In-app purchases via RevenueCat (`react-native-purchases`).
 * Set `expo.extra.revenueCatIosApiKey` / `revenueCatAndroidApiKey` or
 * `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` at build time.
 */

import type { PurchasesPackage } from 'react-native-purchases';

import { isRevenueCatConfigured, Purchases } from './revenuecat';

function pickPackage(
  packages: PurchasesPackage[],
  productId: string
): PurchasesPackage | undefined {
  const normalized = productId.trim().toLowerCase();
  return packages.find((p) => {
    const id = p.product.identifier?.toLowerCase() ?? '';
    const pkgId = p.identifier?.toLowerCase() ?? '';
    return id === normalized || pkgId === normalized || pkgId.endsWith(`:${normalized}`);
  });
}

export function isIapConfigured(): boolean {
  return isRevenueCatConfigured();
}

export async function purchaseProduct(productId: string): Promise<void> {
  if (!isRevenueCatConfigured()) {
    throw new Error('Purchases are unavailable in this build.');
  }

  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) {
    throw new Error('No offerings from RevenueCat — check dashboard and App Store Connect products.');
  }

  const pkgs = current.availablePackages;
  const chosen = pickPackage(pkgs, productId) ?? pkgs[0];
  if (!chosen) {
    throw new Error('No purchasable packages in the current offering.');
  }

  await Purchases.purchasePackage(chosen);
}

export async function restorePurchases(): Promise<void> {
  if (!isRevenueCatConfigured()) {
    throw new Error('Purchases are unavailable in this build.');
  }
  await Purchases.restorePurchases();
}
