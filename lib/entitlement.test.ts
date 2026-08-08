/**
 * Entitlement module tests — HMAC token computation and the
 * customer-info → hasMasterPass sync. The HMAC is verified against a
 * known-good value that matches Node's crypto.createHmac on the server.
 */

import sha256 from 'js-sha256';
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

  it('returns the secret when set', () => {
    setSecret('topsecret');
    expect(getMasterSecret()).toBe('topsecret');
  });
});

describe('computeMasterToken', () => {
  it('returns undefined when no secret is configured (dev mode)', () => {
    setSecret(undefined);
    expect(computeMasterToken('client-123')).toBeUndefined();
  });

  it('computes HMAC-SHA256(secret, clientId) hex matching the server', () => {
    setSecret('shared-secret');
    const clientId = 'c-abc12345';
    const token = computeMasterToken(clientId);
    // Mirror what server/index.js does: crypto.createHmac('sha256', secret).update(clientId).digest('hex')
    const expected = sha256.hmac('shared-secret', clientId);
    expect(token).toBe(expected);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different tokens for different clientIds', () => {
    setSecret('shared-secret');
    expect(computeMasterToken('client-a')).not.toBe(computeMasterToken('client-b'));
  });

  it('produces different tokens for different secrets', () => {
    const clientId = 'c-same';
    setSecret('secret-one');
    const t1 = computeMasterToken(clientId);
    setSecret('secret-two');
    const t2 = computeMasterToken(clientId);
    expect(t1).not.toBe(t2);
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