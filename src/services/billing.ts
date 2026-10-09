import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Purchases, LOG_LEVEL, PRODUCT_CATEGORY } from '@revenuecat/purchases-capacitor';
import { API_BASE_URL } from '../config';

const setNativeItem = async (key: string, value: string): Promise<void> => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('Failed to save to Preferences', err);
  }
};

export interface UsageInfo {
  passType: 'trip' | 'yearly' | null;
  freeScansUsed: number;
  freeScansLimit: number;
  freeScansRemaining: number;
  expirationDate?: string | null;
}

export const DEFAULT_FREE_SCANS_LIMIT = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FREE_SCANS_LIMIT)
    ? parseInt(import.meta.env.VITE_FREE_SCANS_LIMIT, 10)
    : 12;

export function createDefaultUsage(): UsageInfo {
  return {
    passType: null,
    freeScansUsed: 0,
    freeScansLimit: DEFAULT_FREE_SCANS_LIMIT,
    freeScansRemaining: DEFAULT_FREE_SCANS_LIMIT
  };
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
        this.initialized = true;

        // Keep the existing appUserID and store association. Startup never grants
        // a pass from SDK history or starts a new duration clock.
        try {
          await Purchases.restorePurchases();
          await this.syncPurchase();
        } catch {
          console.warn('Purchase verification unavailable on startup; retry Restore purchases.');
        }
      } catch (err) {
        console.warn('RevenueCat initialization failed:', err);
        throw err;
      }
    } else {
      this.initialized = true;
    }
  }

  public async fetchStatus(currentUsage?: UsageInfo): Promise<UsageInfo> {
    const count = ++this.fetchUsageCount;
    try {
      const deviceId = await getDeviceId();
      const apiBase = Capacitor.isNativePlatform() ? API_BASE_URL : '';
      const response = await fetch(`${apiBase}/api/usage?deviceId=${encodeURIComponent(deviceId)}`);
      if (!response.ok) throw new Error('Billing status unavailable');
      const usage: UsageInfo = await response.json();
      if (count !== this.fetchUsageCount) return currentUsage || createDefaultUsage();
      return usage;
    } catch {
      // Cached UI status never authorizes OCR; the server still verifies every scan.
      const usage = currentUsage || createDefaultUsage();
      if (usage.passType && (!usage.expirationDate || !(Date.parse(usage.expirationDate) > Date.now()))) {
        return { ...usage, passType: null, expirationDate: null };
      }
      return usage;
    }
  }

  public isAlreadyOwnedError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.underlyingErrorMessage || err).toLowerCase();
    const code = err.code || err.readableErrorCode;
    return (
      code === 6 ||
      code === 'PRODUCT_ALREADY_PURCHASED' ||
      code === 'ITEM_ALREADY_OWNED' ||
      msg.includes('already owned') ||
      msg.includes('already_purchased') ||
      msg.includes('already purchased')
    );
  }

  public async purchase(option: 'trip' | 'yearly'): Promise<void> {
    const isNative = Capacitor.isNativePlatform();
    
    if (isNative) {
      const productId = option === 'trip' ? 'splat_14day_trip' : 'splat_yearly_pro';
      let purchased = false;
      
      try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length > 0) {
          const pkg = offerings.current.availablePackages.find(p => p.identifier === option);
          if (pkg) {
            await Purchases.purchasePackage({ aPackage: pkg });
            purchased = true;
          }
        }
      } catch (err: any) {
        console.warn('Failed to purchase package via offerings, trying direct product purchase:', err);
        if (this.isAlreadyOwnedError(err)) {
          console.log('Item already owned via offerings, activating pass...');
          purchased = true;
        }
      }
      
      if (!purchased) {
        try {
          const type = option === 'trip' 
            ? PRODUCT_CATEGORY.NON_SUBSCRIPTION 
            : PRODUCT_CATEGORY.SUBSCRIPTION;
            
          const { products } = await Purchases.getProducts({ 
            productIdentifiers: [productId],
            type
          });
          if (products && products.length > 0) {
            await Purchases.purchaseStoreProduct({ product: products[0] });
          } else {
            throw new Error(`Product not found: ${productId}`);
          }
        } catch (err: any) {
          if (this.isAlreadyOwnedError(err)) {
            console.log('Item already owned on store, activating pass...');
            purchased = true;
          } else {
            throw err;
          }
        }
      }

      this.clearSimulatedUsage();
      const usage = await this.syncPurchase();
      if (!usage.passType) throw new Error('Purchase verification is pending or the pass has expired. Please retry Restore purchases.');
    } else {
      throw new Error('Purchases are available in the iOS and Android apps.');
    }
  }

  private async syncPurchase(): Promise<UsageInfo> {
    const deviceId = await getDeviceId();
    const apiBase = Capacitor.isNativePlatform() ? API_BASE_URL : '';
    const response = await fetch(`${apiBase}/api/sync-purchase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId })
    });
    if (!response.ok) throw new Error('Purchase verification is temporarily unavailable. Please retry Restore purchases shortly.');
    const usage: UsageInfo = await response.json();
    await setNativeItem('splat_usage_info', JSON.stringify(usage));
    return usage;
  }

  public async restore(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) throw new Error('Restore purchases is only available on native platforms.');
    await Purchases.restorePurchases();
    this.clearSimulatedUsage();
    const usage = await this.syncPurchase();
    return usage.passType !== null;
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

  public setSimulatedUsage(passType: 'trip' | 'yearly' | null, freeScansUsed: number, freeScansLimit: number = DEFAULT_FREE_SCANS_LIMIT): UsageInfo {
    const usage: UsageInfo = {
      passType,
      freeScansUsed,
      freeScansLimit,
      freeScansRemaining: Math.max(0, freeScansLimit - freeScansUsed)
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
