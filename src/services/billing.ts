import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

export interface UsageInfo {
  passType: 'trip' | 'yearly' | null;
  freeScansUsed: number;
  freeScansLimit: number;
  freeScansRemaining: number;
  expirationDate?: string | null;
}

export const getDeviceId = async (): Promise<string> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorUpdater.getDeviceId();
      if (res && res.deviceId) {
        return res.deviceId;
      }
    }
  } catch (err) {
    console.warn('Failed to get Capacitor Device ID', err);
  }
  
  // Fallback to localStorage uuid for local web development
  let devId = localStorage.getItem('splat_dev_device_id');
  if (!devId) {
    devId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('splat_dev_device_id', devId);
  }
  return devId;
};

export class BillingManager {
  private static instance: BillingManager;
  private initialized = false;
  private simulatedUsage: UsageInfo | null = null;
  private fetchUsageCount = 0;

  private constructor() {}

  public static getInstance(): BillingManager {
    if (!BillingManager.instance) {
      BillingManager.instance = new BillingManager();
    }
    return BillingManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    if (Capacitor.isNativePlatform()) {
      const iosKey = import.meta.env.VITE_REVENUECAT_IOS_API_KEY || 'rc_ios_dummy_key';
      const androidKey = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY || 'rc_android_dummy_key';
      const apiKey = Capacitor.getPlatform() === 'ios' ? iosKey : androidKey;
      
      try {
        const deviceId = await getDeviceId();
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({
          apiKey: apiKey,
          appUserID: deviceId
        });
        console.log('RevenueCat initialized successfully for device ID:', deviceId);
        this.initialized = true;
      } catch (err) {
        console.warn('RevenueCat initialization failed:', err);
        throw err;
      }
    } else {
      this.initialized = true;
    }
  }

  public async fetchStatus(currentUsage?: UsageInfo): Promise<UsageInfo> {
    // Stub for Commit 2
    return currentUsage || {
      passType: null,
      freeScansUsed: 0,
      freeScansLimit: 5,
      freeScansRemaining: 5
    };
  }

  public async purchase(packageId: string): Promise<void> {
    // Stub
  }

  public async restore(): Promise<void> {
    // Stub
  }

  public formatError(e: any): string {
    if (!e) return 'Unknown error';
    if (typeof e === 'string') return e;
    const details = [];
    if (e.message) details.push(e.message);
    if (e.readableErrorCode) details.push(`Code: ${e.readableErrorCode}`);
    if (e.underlyingErrorMessage) details.push(`Detail: ${e.underlyingErrorMessage}`);
    
    if (details.length === 0) {
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    }
    return details.join('\n');
  }

  public setSimulatedUsage(passType: 'trip' | 'yearly' | null, freeScansUsed: number): UsageInfo {
    const usage: UsageInfo = {
      passType,
      freeScansUsed,
      freeScansLimit: 5,
      freeScansRemaining: Math.max(0, 5 - freeScansUsed)
    };
    this.simulatedUsage = usage;
    return usage;
  }

  public getSimulatedUsage(): UsageInfo | null {
    return this.simulatedUsage;
  }

  public clearSimulatedUsage(): void {
    this.simulatedUsage = null;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

export const billingManager = BillingManager.getInstance();
