import { describe, expect, test, beforeEach, vi } from 'vitest';
import { billingManager } from './billing';

describe('BillingManager Skeleton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    billingManager.clearSimulatedUsage();
  });

  test('should return singleton instance', () => {
    expect(billingManager).toBeDefined();
  });

  test('should set and clear simulated usage', () => {
    expect(billingManager.getSimulatedUsage()).toBeNull();
    
    const usage = billingManager.setSimulatedUsage('trip', 2);
    expect(usage.passType).toBe('trip');
    expect(usage.freeScansUsed).toBe(2);
    expect(usage.freeScansRemaining).toBe(3);
    expect(billingManager.getSimulatedUsage()).toEqual(usage);

    billingManager.clearSimulatedUsage();
    expect(billingManager.getSimulatedUsage()).toBeNull();
  });

  test('should format error (stub)', () => {
    const formatted = billingManager.formatError('some error');
    expect(formatted).toBe('some error');
  });
});
