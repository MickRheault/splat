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
    this.fetchUsageCount++;
    const currentCount = this.fetchUsageCount;

    if (this.simulatedUsage) {
      return { ...this.simulatedUsage };
    }

    const isNative = Capacitor.isNativePlatform();
    let fetchedUsageInfo: UsageInfo | null = null;

    // 1. Try to fetch usage limits from the Vercel backend API
    try {
      const deviceId = await getDeviceId();
      const apiBase = isNative ? 'https://splat-chi.vercel.app' : '';
      const res = await fetch(`${apiBase}/api/usage?deviceId=${deviceId}`);
      if (res.ok) {
        fetchedUsageInfo = await res.json();
      }
    } catch (err) {
      console.warn('Failed to fetch usage limits from backend', err);
    }

    // 2. Sync active entitlements locally using the RevenueCat SDK
    if (isNative) {
      try {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        const { customerInfo } = await Purchases.getCustomerInfo();
        console.log('RevenueCat CustomerInfo active entitlements:', JSON.stringify(customerInfo?.entitlements?.active || {}));
        console.log('RevenueCat CustomerInfo purchased products:', JSON.stringify(customerInfo?.allPurchasedProductIdentifiers || []));
        
        let hasActiveEntitlement = false;
        if (customerInfo && customerInfo.entitlements && customerInfo.entitlements.active) {
          const tripEnt = customerInfo.entitlements.active['trip'];
          const yearlyEnt = customerInfo.entitlements.active['yearly'];
          
          const baseInfo = fetchedUsageInfo || currentUsage || {
            passType: null,
            freeScansUsed: 0,
            freeScansLimit: 5,
            freeScansRemaining: 5
          };
          
          if (tripEnt) {
            fetchedUsageInfo = {
              ...baseInfo,
              passType: 'trip',
              expirationDate: tripEnt.expirationDate
            };
            hasActiveEntitlement = true;
          } else if (yearlyEnt) {
            fetchedUsageInfo = {
              ...baseInfo,
              passType: 'yearly',
              expirationDate: yearlyEnt.expirationDate
            };
            hasActiveEntitlement = true;
          }
        }

        // Fallback for one-time purchases if entitlement configuration/linking is missing in RC dashboard
        if (!hasActiveEntitlement && customerInfo && customerInfo.allPurchasedProductIdentifiers && customerInfo.allPurchasedProductIdentifiers.includes('splat_14day_trip')) {
          const purchaseDateStr = customerInfo.allPurchaseDates?.['splat_14day_trip'];
          if (purchaseDateStr) {
            const purchaseDate = new Date(purchaseDateStr);
            const expiryDate = new Date(purchaseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
            if (expiryDate.getTime() > Date.now()) {
              const baseInfo = fetchedUsageInfo || currentUsage || {
                passType: null,
                freeScansUsed: 0,
                freeScansLimit: 5,
                freeScansRemaining: 5
              };
              fetchedUsageInfo = {
                ...baseInfo,
                passType: 'trip',
                expirationDate: expiryDate.toISOString()
              };
              hasActiveEntitlement = true;
            }
          }
        }

        if (!hasActiveEntitlement) {
          const baseInfo = fetchedUsageInfo || currentUsage || {
            passType: null,
            freeScansUsed: 0,
            freeScansLimit: 5,
            freeScansRemaining: 5
          };
          fetchedUsageInfo = {
            ...baseInfo,
            passType: null,
            expirationDate: null
          };
        }
      } catch (rcErr) {
        console.warn('Failed to fetch RevenueCat entitlement info', rcErr);
        if (fetchedUsageInfo) {
          fetchedUsageInfo.passType = currentUsage?.passType || null;
          fetchedUsageInfo.expirationDate = currentUsage?.expirationDate || null;
        }
      }
    }

    const defaultUsage: UsageInfo = {
      passType: null,
      freeScansUsed: 0,
      freeScansLimit: 5,
      freeScansRemaining: 5
    };

    // Discard result if a newer fetch has started (latest-win check)
    if (currentCount !== this.fetchUsageCount) {
      return currentUsage || defaultUsage;
    }

    return fetchedUsageInfo || currentUsage || defaultUsage;
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
