import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const getNativeItem = async (key: string): Promise<string | null> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

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
      const iosKey = import.meta.env.VITE_REVENUECAT_IOS_API_KEY || 'test_MlALuJJDksnsTRIcdJEahEJkwlV';
      const androidKey = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY || 'goog_mZgnvUYwPfvbGqnfBtFgWszjhfJ';
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

        // Automatically sync & restore Google Play/App Store purchases silently on boot
        try {
          const { customerInfo } = await Purchases.restorePurchases();
          const hasPass = !!(
            customerInfo?.entitlements?.active?.['trip'] ||
            customerInfo?.allPurchasedProductIdentifiers?.includes('splat_14day_trip') ||
            customerInfo?.nonSubscriptionTransactions?.some((t: any) => t.productIdentifier === 'splat_14day_trip')
          );
          if (hasPass) {
            const purchaseDateMs = Date.now();
            await setNativeItem('splat_local_pass_trip', JSON.stringify({ purchaseDate: purchaseDateMs }));
          }
        } catch (syncErr) {
          console.warn('Silent purchase sync on boot failed:', syncErr);
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
          let purchaseDateStr = customerInfo.allPurchaseDates?.['splat_14day_trip'];
          
          if (!purchaseDateStr && customerInfo.nonSubscriptionTransactions && customerInfo.nonSubscriptionTransactions.length > 0) {
            const nonSubTx = customerInfo.nonSubscriptionTransactions
              .filter((t: any) => t.productIdentifier === 'splat_14day_trip')
              .sort((a: any, b: any) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
            if (nonSubTx && nonSubTx.purchaseDate) {
              purchaseDateStr = nonSubTx.purchaseDate;
            }
          }

          const purchaseDateMs = purchaseDateStr 
            ? new Date(purchaseDateStr).getTime() 
            : (customerInfo.requestDate ? new Date(customerInfo.requestDate).getTime() : Date.now());

          const expiryDate = new Date(purchaseDateMs + 14 * 24 * 60 * 60 * 1000);
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
            // Persist valid purchase in native storage for offline/fast load
            setNativeItem('splat_local_pass_trip', JSON.stringify({ purchaseDate: purchaseDateMs })).catch(() => {});
          }
        }

        if (!hasActiveEntitlement) {
          try {
            const rawLocal = await getNativeItem('splat_local_pass_trip');
            if (rawLocal) {
              const { purchaseDate } = JSON.parse(rawLocal);
              const expiryDate = new Date(purchaseDate + 14 * 24 * 60 * 60 * 1000);
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
          } catch (e) {
            console.warn('Failed to parse local pass fallback', e);
          }
        }

        if (!hasActiveEntitlement) {
          try {
            const rawYearly = await getNativeItem('splat_local_pass_yearly');
            if (rawYearly) {
              const { purchaseDate } = JSON.parse(rawYearly);
              const expiryDate = new Date(purchaseDate + 365 * 24 * 60 * 60 * 1000);
              if (expiryDate.getTime() > Date.now()) {
                const baseInfo = fetchedUsageInfo || currentUsage || {
                  passType: null,
                  freeScansUsed: 0,
                  freeScansLimit: 5,
                  freeScansRemaining: 5
                };
                fetchedUsageInfo = {
                  ...baseInfo,
                  passType: 'yearly',
                  expirationDate: expiryDate.toISOString()
                };
                hasActiveEntitlement = true;
              }
            }
          } catch (e) {
            console.warn('Failed to parse local yearly pass fallback', e);
          }
        }

        if (!hasActiveEntitlement) {
          const isCurrentPassValid = !!(currentUsage?.passType && currentUsage?.expirationDate && new Date(currentUsage.expirationDate).getTime() > Date.now());
          if (isCurrentPassValid) {
            fetchedUsageInfo = { ...currentUsage };
            hasActiveEntitlement = true;
          } else {
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
          const { PRODUCT_CATEGORY } = await import('@revenuecat/purchases-capacitor');
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

      if (option === 'trip') {
        const purchaseDateMs = Date.now();
        await setNativeItem('splat_local_pass_trip', JSON.stringify({ purchaseDate: purchaseDateMs }));
      } else if (option === 'yearly') {
        const purchaseDateMs = Date.now();
        await setNativeItem('splat_local_pass_yearly', JSON.stringify({ purchaseDate: purchaseDateMs }));
      }
    } else {
      const deviceId = await getDeviceId();
      const response = await fetch('/api/mock-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, type: option })
      });

      if (!response.ok) {
        throw new Error('Server activation failed');
      }
    }
  }

  public async restore(): Promise<boolean> {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      const { customerInfo } = await Purchases.restorePurchases();
      const hasActivePass = !!(
        customerInfo.entitlements?.active?.['trip'] ||
        customerInfo.entitlements?.active?.['yearly'] ||
        customerInfo.allPurchasedProductIdentifiers?.includes('splat_14day_trip') ||
        customerInfo.nonSubscriptionTransactions?.some((t: any) => t.productIdentifier === 'splat_14day_trip')
      );
      return hasActivePass;
    } else {
      throw new Error('Restore purchases is only available on native platforms.');
    }
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
