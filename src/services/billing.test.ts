import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { billingManager, getDeviceId, type UsageInfo } from './billing';

let isNativeVal = false;
const mockConfigure = vi.fn();
const mockSetLogLevel = vi.fn();
const mockGetCustomerInfo = vi.fn();
const mockGetOfferings = vi.fn();
const mockPurchasePackage = vi.fn();
const mockGetProducts = vi.fn();
const mockPurchaseStoreProduct = vi.fn();
const mockRestorePurchases = vi.fn();

vi.mock('@capacitor/core', () => {
  return {
    Capacitor: {
      isNativePlatform: () => isNativeVal,
      getPlatform: () => (isNativeVal ? 'android' : 'web'),
    },
  };
});

vi.mock('@capgo/capacitor-updater', () => {
  return {
    CapacitorUpdater: {
      getDeviceId: () => Promise.resolve({ deviceId: 'test-device-id' }),
    },
  };
});

vi.mock('@revenuecat/purchases-capacitor', () => {
  return {
    Purchases: {
      configure: (...args: any[]) => mockConfigure(...args),
      setLogLevel: (...args: any[]) => mockSetLogLevel(...args),
      getCustomerInfo: (...args: any[]) => mockGetCustomerInfo(...args),
      getOfferings: (...args: any[]) => mockGetOfferings(...args),
      purchasePackage: (...args: any[]) => mockPurchasePackage(...args),
      getProducts: (...args: any[]) => mockGetProducts(...args),
      purchaseStoreProduct: (...args: any[]) => mockPurchaseStoreProduct(...args),
      restorePurchases: (...args: any[]) => mockRestorePurchases(...args),
    },
    LOG_LEVEL: {
      DEBUG: 0,
    },
    PRODUCT_CATEGORY: {
      NON_SUBSCRIPTION: 'NON_SUBSCRIPTION',
      SUBSCRIPTION: 'SUBSCRIPTION',
    },
  };
});

beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    mockRestorePurchases.mockResolvedValue({ customerInfo: {} });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ passType: 'trip', expirationDate: '2026-10-20T00:00:00.000Z', freeScansUsed: 0, freeScansLimit: 3, freeScansRemaining: 3 }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('BillingManager - Core Billing Functions', () => {
  beforeEach(() => {
    mockConfigure.mockClear();
    mockSetLogLevel.mockClear();
    mockGetCustomerInfo.mockClear();
    mockGetOfferings.mockClear();
    mockPurchasePackage.mockClear();
    mockGetProducts.mockClear();
    mockPurchaseStoreProduct.mockClear();
    mockRestorePurchases.mockClear();
    isNativeVal = false;
    billingManager.clearSimulatedUsage();
    (billingManager as any).initialized = false;
    (billingManager as any).fetchUsageCount = 0;
  });

  test('getDeviceId returns local device ID in web mode', async () => {
    isNativeVal = false;
    const deviceId = await getDeviceId();
    expect(deviceId).toContain('web_');
  });

  test('getDeviceId returns native device ID in native mode', async () => {
    isNativeVal = true;
    const deviceId = await getDeviceId();
    expect(deviceId).toBe('test-device-id');
  });

  test('initialize does not configure on web', async () => {
    isNativeVal = false;
    await billingManager.initialize();
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(billingManager.isInitialized()).toBe(true);
  });

  test('initialize configures RevenueCat SDK on native', async () => {
    isNativeVal = true;
    mockConfigure.mockResolvedValue({});
    mockSetLogLevel.mockResolvedValue({});

    await billingManager.initialize();

    expect(mockSetLogLevel).toHaveBeenCalled();
    expect(mockConfigure).toHaveBeenCalledWith({
      apiKey: import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY || 'rc_android_dummy_key',
      appUserID: 'test-device-id',
    });
    expect(billingManager.isInitialized()).toBe(true);
  });

  test('formatError handles various error shapes', () => {
    expect(billingManager.formatError(null)).toBe('Unknown error');
    expect(billingManager.formatError('simple string')).toBe('simple string');
    expect(
      billingManager.formatError({
        message: 'RC Error',
        readableErrorCode: '123',
        underlyingErrorMessage: 'Underlying cause',
      })
    ).toBe('RC Error\nCode: 123\nDetail: Underlying cause');
  });

  test('fetchStatus ignores client simulation and fetches verified server status', async () => {
    billingManager.setSimulatedUsage('yearly', 1);
    const status = await billingManager.fetchStatus();
    expect(status.passType).toBe('trip');
    expect(status.freeScansLimit).toBe(3);
    expect(status.freeScansRemaining).toBe(3);
  });

  test('fetchStatus handles Vercel fetch on web platform', async () => {
    isNativeVal = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: null, freeScansRemaining: 3 }), { status: 200 }))
    );

    const status = await billingManager.fetchStatus();
    expect(status.freeScansRemaining).toBe(3);
    expect(status.passType).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('fetchStatus trusts server status rather than a native SDK paid claim', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: null, freeScansRemaining: 5 }), { status: 200 }))
    );

    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {
            trip: {
              expirationDate: '2026-08-01T00:00:00.000Z',
            },
          },
        },
        allPurchasedProductIdentifiers: ['splat_14day_trip'],
      },
    });

    const status = await billingManager.fetchStatus();
    expect(status.passType).toBeNull();
    expect(status.expirationDate).toBeUndefined();
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('fetchStatus accepts server-verified pass with missing SDK entitlement mapping', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: 'trip', expirationDate: '2026-10-20T00:00:00.000Z', freeScansRemaining: 5 }), { status: 200 }))
    );

    const purchaseDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {},
        },
        allPurchasedProductIdentifiers: ['splat_14day_trip'],
        allPurchaseDates: {
          splat_14day_trip: purchaseDate,
        },
      },
    });

    const status = await billingManager.fetchStatus();
    expect(status.passType).toBe('trip');
    expect(status.expirationDate).toBeDefined();
    fetchSpy.mockRestore();
  });

  test('fetchStatus accepts server-verified non-subscription pass', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: 'trip', expirationDate: '2026-10-20T00:00:00.000Z', freeScansRemaining: 5 }), { status: 200 }))
    );

    const purchaseDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: {
        entitlements: { active: {} },
        allPurchasedProductIdentifiers: ['splat_14day_trip'],
        nonSubscriptionTransactions: [
          {
            productIdentifier: 'splat_14day_trip',
            purchaseDate: purchaseDate,
            transactionIdentifier: 'tx_123',
          },
        ],
      },
    });

    const status = await billingManager.fetchStatus();
    expect(status.passType).toBe('trip');
    expect(status.expirationDate).toBeDefined();
    fetchSpy.mockRestore();
  });

  test('fetchStatus clears cached paid access when server confirms no pass', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: null, freeScansRemaining: 5 }), { status: 200 }))
    );

    mockGetCustomerInfo.mockRejectedValue(new Error('Network offline'));

    const currentUsage: UsageInfo = {
      passType: 'yearly',
      freeScansUsed: 0,
      freeScansLimit: 3,
      freeScansRemaining: 3,
      expirationDate: '2027-01-01T00:00:00.000Z',
    };

    const status = await billingManager.fetchStatus(currentUsage);
    expect(status.passType).toBeNull();
    expect(status.expirationDate).toBeUndefined();
    fetchSpy.mockRestore();
  });

  test('purchase handles native offerings flow', async () => {
    isNativeVal = true;
    mockGetOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          { identifier: 'trip', product: { identifier: 'splat_14day_trip' } },
        ],
      },
    });
    mockPurchasePackage.mockResolvedValue({});

    await billingManager.purchase('trip');

    expect(mockGetOfferings).toHaveBeenCalled();
    expect(mockPurchasePackage).toHaveBeenCalledWith({
      aPackage: { identifier: 'trip', product: { identifier: 'splat_14day_trip' } },
    });
  });

  test('purchase falls back to direct product purchase on native', async () => {
    isNativeVal = true;
    mockGetOfferings.mockRejectedValue(new Error('Offerings failed'));
    mockGetProducts.mockResolvedValue({
      products: [{ identifier: 'splat_14day_trip' }],
    });
    mockPurchaseStoreProduct.mockResolvedValue({});

    await billingManager.purchase('trip');

    expect(mockGetProducts).toHaveBeenCalledWith({
      productIdentifiers: ['splat_14day_trip'],
      type: 'NON_SUBSCRIPTION',
    });
    expect(mockPurchaseStoreProduct).toHaveBeenCalledWith({
      product: { identifier: 'splat_14day_trip' },
    });
  });

  test('web purchases cannot activate a fake pass', async () => {
    isNativeVal = false;
    await expect(billingManager.purchase('yearly')).rejects.toThrow('Purchases are available in the iOS and Android apps.');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('restore returns true and syncs pass if active entitlements found on native', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: 'yearly', expirationDate: '2027-01-01T00:00:00.000Z' }), { status: 200 }))
    );
    mockRestorePurchases.mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {
            yearly: {
              expirationDate: '2027-01-01T00:00:00.000Z',
            },
          },
        },
      },
    });

    const success = await billingManager.restore();
    expect(success).toBe(true);
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('restore throws error on web platform', async () => {
    isNativeVal = false;
    await expect(billingManager.restore()).rejects.toThrow(
      'Restore purchases is only available on native platforms.'
    );
  });

  test('purchase yearly uses server verification and fetchStatus returns verified yearly status', async () => {
    isNativeVal = true;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ passType: 'yearly', expirationDate: '2027-01-01T00:00:00.000Z' }))));
    mockGetOfferings.mockResolvedValue({
      current: {
        availablePackages: [{ identifier: 'yearly', product: { identifier: 'splat_yearly_pro' } }],
      },
    });
    mockPurchasePackage.mockResolvedValue({});
    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: {
        entitlements: { active: {} },
        allPurchasedProductIdentifiers: [],
        activeSubscriptions: []
      }
    });

    await billingManager.purchase('yearly');
    const usage = await billingManager.fetchStatus();
    expect(usage.passType).toBe('yearly');
  });
});

test('native purchase must sync verified server state and never call mock-purchase', async () => {
  isNativeVal = true;
  mockGetOfferings.mockResolvedValue({ current: { availablePackages: [{ identifier: 'trip' }] } });
  mockPurchasePackage.mockResolvedValue({});
  const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ passType: 'trip', expirationDate: '2026-10-20T00:00:00.000Z', freeScansUsed: 0, freeScansLimit: 3, freeScansRemaining: 3 })));
  vi.stubGlobal('fetch', provider);
  await billingManager.purchase('trip');
  expect(provider).toHaveBeenCalledWith(expect.stringContaining('/api/sync-purchase'), expect.objectContaining({ body: JSON.stringify({ deviceId: 'test-device-id' }) }));
  expect(provider.mock.calls.some(([url]) => String(url).includes('mock-purchase'))).toBe(false);
});

test('restore keeps the server-verified original expiry and ignores historical SDK purchase claims', async () => {
  isNativeVal = true;
  mockRestorePurchases.mockResolvedValue({ customerInfo: { allPurchasedProductIdentifiers: ['splat_14day_trip'] } });
  const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ passType: null, expirationDate: null, freeScansUsed: 0, freeScansLimit: 3, freeScansRemaining: 3 })));
  vi.stubGlobal('fetch', provider);
  expect(await billingManager.restore()).toBe(false);
  expect(provider).toHaveBeenCalledWith(expect.stringContaining('/api/sync-purchase'), expect.objectContaining({ body: JSON.stringify({ deviceId: 'test-device-id' }) }));
});

test('startup restores using the same device association then verifies without inventing a new expiry', async () => {
  isNativeVal = true;
  (billingManager as any).initialized = false;
  mockRestorePurchases.mockResolvedValue({ customerInfo: { allPurchasedProductIdentifiers: ['splat_14day_trip'] } });
  const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ passType: null, expirationDate: null })));
  vi.stubGlobal('fetch', provider);
  await billingManager.initialize();
  expect(mockConfigure).toHaveBeenCalledWith(expect.objectContaining({ appUserID: 'test-device-id' }));
  expect(provider).toHaveBeenCalledWith(expect.stringContaining('/api/sync-purchase'), expect.objectContaining({ body: JSON.stringify({ deviceId: 'test-device-id' }) }));
});
