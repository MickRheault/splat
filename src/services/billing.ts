export interface UsageInfo {
  passType: 'trip' | 'yearly' | null;
  freeScansUsed: number;
  freeScansLimit: number;
  freeScansRemaining: number;
  expirationDate?: string | null;
}

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
    // Stub
  }

  public async fetchStatus(currentUsage?: UsageInfo): Promise<UsageInfo> {
    // Stub
    return {
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

  public formatError(err: any): string {
    // Stub
    return String(err);
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
