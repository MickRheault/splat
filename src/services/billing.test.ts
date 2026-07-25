import { describe, expect, test, beforeEach, vi } from 'vitest';
import { billingManager, getDeviceId, UsageInfo } from './billing';

let isNativeVal = false;
const mockConfigure = vi.fn();
const mockSetLogLevel = vi.fn();
const mockGetCustomerInfo = vi.fn();

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
    },
    LOG_LEVEL: {
      DEBUG: 0,
    },
  };
});

describe('BillingManager - Core Billing Functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigure.mockClear();
    mockSetLogLevel.mockClear();
    mockGetCustomerInfo.mockClear();
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

  test('fetchStatus returns simulatedUsage if set', async () => {
    const sim = billingManager.setSimulatedUsage('yearly', 1);
    const status = await billingManager.fetchStatus();
    expect(status.passType).toBe('yearly');
    expect(status.freeScansRemaining).toBe(4);
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
  });

  test('fetchStatus handles active entitlements on native platform', async () => {
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
    expect(status.passType).toBe('trip');
    expect(status.expirationDate).toBe('2026-08-01T00:00:00.000Z');
    expect(mockGetCustomerInfo).toHaveBeenCalled();
  });

  test('fetchStatus falls back to purchase dates for missing entitlement mapping', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: null, freeScansRemaining: 5 }), { status: 200 }))
    );

    // Mock 1 day ago purchase date
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
  });

  test('fetchStatus preserves currentUsage if RevenueCat check throws an error', async () => {
    isNativeVal = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ passType: null, freeScansRemaining: 5 }), { status: 200 }))
    );

    mockGetCustomerInfo.mockRejectedValue(new Error('Network offline'));

    const currentUsage: UsageInfo = {
      passType: 'yearly',
      freeScansUsed: 0,
      freeScansLimit: 5,
      freeScansRemaining: 5,
      expirationDate: '2027-01-01T00:00:00.000Z',
    };

    const status = await billingManager.fetchStatus(currentUsage);
    expect(status.passType).toBe('yearly');
    expect(status.expirationDate).toBe('2027-01-01T00:00:00.000Z');
  });
});
