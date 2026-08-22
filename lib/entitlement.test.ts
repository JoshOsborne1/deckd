/**
 * Entitlement module tests. Client code reads entitlement state only. Relay
 * signing credentials are server-side and must never be recoverable from the
 * app bundle, even when an EXPO_PUBLIC_* variable is present.
 */

import type { CustomerInfo } from 'react-native-purchases';

import {
  MASTER_ENTITLEMENT_ID,
  computeMasterToken,
  getMasterSecret,
  hasMasterEntitlement,
  syncMasterPassFromCustomerInfo,
} from '@lib/entitlement';

// Mock the cosmeticsStore so the test doesn't pull in the RN storage chain.
// We only need to observe setMasterPass calls.
let lastSetMasterPass: boolean | undefined;

jest.mock('@store/cosmeticsStore', () => ({
  useCosmeticsStore: {
    getState: () => ({
      setMasterPass: (enabled: boolean) => {
        lastSetMasterPass = enabled;
      },
    }),
    setState: () => {},
  },
}));

// Capture/restore the env var so tests are deterministic.
const originalSecret = process.env.EXPO_PUBLIC_DECKD_MASTER_SECRET;

function setSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.EXPO_PUBLIC_DECKD_MASTER_SECRET;
  } else {
    process.env.EXPO_PUBLIC_DECKD_MASTER_SECRET = value;
  }
}

function makeCustomerInfo(active: Record<string, { isActive: boolean }>): CustomerInfo {
  return {
    entitlements: {
      all: active,
      active: Object.fromEntries(
        Object.entries(active).filter(([, v]) => v.isActive)
      ),
      verification: 'NOT_REQUESTED',
    },
    activeSubscriptions: [],
    allPurchasedProductIdentifiers: [],
    latestExpirationDate: null,
    firstSeen: '',
    originalAppUserId: '',
    requestDate: '',
    allExpirationDates: {},
    allPurchaseDates: {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  } as unknown as CustomerInfo;
}

afterEach(() => {
  setSecret(originalSecret);
  lastSetMasterPass = undefined;
});

describe('getMasterSecret', () => {
  it('returns undefined when the env var is absent', () => {
    setSecret(undefined);
    expect(getMasterSecret()).toBeUndefined();
  });

  it('returns undefined when the env var is empty', () => {
    setSecret('');
    expect(getMasterSecret()).toBeUndefined();
  });

  it('ignores a public env var because the client must not hold the relay secret', () => {
    setSecret('topsecret');
    expect(getMasterSecret()).toBeUndefined();
  });
});

describe('computeMasterToken', () => {
  it('always fails closed, including when a public env var is present', () => {
    setSecret('shared-secret');
    expect(computeMasterToken('client-123')).toBeUndefined();
  });
});

describe('hasMasterEntitlement', () => {
  it('returns true when the master entitlement is active', () => {
    const info = makeCustomerInfo({ [MASTER_ENTITLEMENT_ID]: { isActive: true } });
    expect(hasMasterEntitlement(info)).toBe(true);
  });

  it('returns false when the master entitlement is inactive', () => {
    const info = makeCustomerInfo({ [MASTER_ENTITLEMENT_ID]: { isActive: false } });
    expect(hasMasterEntitlement(info)).toBe(false);
  });

  it('returns false when the master entitlement is absent', () => {
    const info = makeCustomerInfo({ other: { isActive: true } });
    expect(hasMasterEntitlement(info)).toBe(false);
  });

  it('returns false when there are no entitlements', () => {
    const info = makeCustomerInfo({});
    expect(hasMasterEntitlement(info)).toBe(false);
  });
});

describe('syncMasterPassFromCustomerInfo', () => {
  it('sets hasMasterPass true when the master entitlement is active', () => {
    const info = makeCustomerInfo({ [MASTER_ENTITLEMENT_ID]: { isActive: true } });
    expect(syncMasterPassFromCustomerInfo(info)).toBe(true);
    expect(lastSetMasterPass).toBe(true);
  });

  it('sets hasMasterPass false when the master entitlement is inactive', () => {
    const info = makeCustomerInfo({ [MASTER_ENTITLEMENT_ID]: { isActive: false } });
    expect(syncMasterPassFromCustomerInfo(info)).toBe(false);
    expect(lastSetMasterPass).toBe(false);
  });

  it('sets hasMasterPass false when the master entitlement is absent', () => {
    const info = makeCustomerInfo({ other: { isActive: true } });
    expect(syncMasterPassFromCustomerInfo(info)).toBe(false);
    expect(lastSetMasterPass).toBe(false);
  });

  it('sets hasMasterPass false when customerInfo is undefined', () => {
    expect(syncMasterPassFromCustomerInfo(undefined)).toBe(false);
    expect(lastSetMasterPass).toBe(false);
  });
});