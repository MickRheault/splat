import { describe, expect, test, beforeEach, vi } from 'vitest';
import { billingManager, getDeviceId } from './billing';

let isNativeVal = false;
const mockConfigure = vi.fn();
const mockSetLogLevel = vi.fn();

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
    },
    LOG_LEVEL: {
      DEBUG: 0,
    },
  };
});

describe('BillingManager - Init, Device ID, Error Formatting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigure.mockClear();
    mockSetLogLevel.mockClear();
    isNativeVal = false;
    billingManager.clearSimulatedUsage();
    // Reset private initialized state by hacking or reinstantiating if possible,
    // but since it's a singleton, we can access private field:
    (billingManager as any).initialized = false;
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
});
