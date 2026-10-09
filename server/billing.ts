import { Redis } from '@upstash/redis';

export type PassType = 'trip' | 'yearly';
export interface Pass { passType: PassType | null; expirationDate: string | null }
interface VerifiedPass extends Pass {
  version: 1;
  source: 'revenuecat' | 'mock';
  environment: string;
  deviceId: string;
  verifiedUntil: number;
}
interface Purchase {
  purchase_date?: string;
  expires_date?: string | null;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}
interface Subscriber {
  entitlements: Record<string, { product_identifier: string; expires_date?: string | null }>;
  subscriptions: Record<string, Purchase>;
  non_subscriptions: Record<string, Purchase[]>;
}
const DAY = 86400000;
const CACHE_MS = 5 * 60000;
const PASS_DAYS: Record<PassType, number> = { trip: 14, yearly: 365 };
const PRODUCT_TYPES: Record<string, PassType> = {
  splat_14day_trip: 'trip', splat_yearly_pro: 'yearly',
};
const NO_PASS: Pass = { passType: null, expirationDate: null };
export const RETRY_ERROR = { error: 'BILLING_UNAVAILABLE', message: 'Scan eligibility could not be verified. Please retry shortly. Manual splitting is still available.' };
export function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Fail closed on an accidental test configuration in a production deployment.
function testNamespace(): string | null {
  const env = process.env.BILLING_ENV || 'production';
  if (env === 'production') return null;
  const deployment = process.env.VERCEL_ENV;
  const allowed = (env === 'local' && (!deployment || deployment === 'development')) ||
    (env === 'staging' && (!deployment || deployment === 'preview'));
  const namespace = process.env.BILLING_TEST_NAMESPACE;
  if (!allowed || !namespace || !/^[a-zA-Z0-9_-]+$/.test(namespace)) throw new Error('Invalid billing environment');
  return namespace;
}
export function billingKey(key: string): string {
  const namespace = testNamespace();
  return namespace ? `billing-test:${namespace}:${key}` : key;
}
export function mockBillingEnabled(): boolean {
  return testNamespace() !== null && process.env.BILLING_TEST_MODE === 'true';
}
export function getBillingRedis(): Redis {
  const test = testNamespace() !== null;
  const url = test ? process.env.BILLING_TEST_KV_REST_API_URL : process.env.KV_REST_API_URL;
  const token = test ? process.env.BILLING_TEST_KV_REST_API_TOKEN : process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Billing storage unavailable');
  return new Redis({ url, token });
}
function cacheKey(deviceId: string): string { return billingKey(`verified-pass:v1:${deviceId}`); }
function currentPass(record: Pass): Pass {
  return record.passType && record.expirationDate && Date.parse(record.expirationDate) > Date.now() ?
    { passType: record.passType, expirationDate: record.expirationDate } : { ...NO_PASS };
}
function validCache(value: unknown, deviceId: string): value is VerifiedPass {
  if (!value || typeof value !== 'object') return false;
  const record = value as VerifiedPass;
  return record.version === 1 && record.deviceId === deviceId &&
    record.environment === billingKey('environment') &&
    (record.source === 'revenuecat' || (record.source === 'mock' && mockBillingEnabled())) &&
    Number.isFinite(record.verifiedUntil) && record.verifiedUntil > Date.now() &&
    (record.passType === null || record.passType === 'trip' || record.passType === 'yearly') &&
    (record.passType === null ? record.expirationDate === null :
      typeof record.expirationDate === 'string' && Number.isFinite(Date.parse(record.expirationDate)));
}
async function savePass(kv: Redis, deviceId: string, pass: Pass, source: VerifiedPass['source']) {
  const record: VerifiedPass = { ...pass, version: 1, source, deviceId,
    environment: billingKey('environment'), verifiedUntil: Date.now() + CACHE_MS };
  const retention = pass.expirationDate ? Math.max(CACHE_MS / 1000, Math.ceil((Date.parse(pass.expirationDate) - Date.now()) / 1000)) : CACHE_MS / 1000;
  await kv.set(cacheKey(deviceId), record, { ex: retention });
  // Remove legacy strings only after verification succeeds. They never authorize scans.
  await kv.del(billingKey(`pass:${deviceId}`));
}

export async function syncPass(kv: Redis, deviceId: string): Promise<Pass> {
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) throw new Error('RevenueCat verification unavailable');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('RevenueCat verification unavailable');
  const payload = await response.json() as { subscriber?: Subscriber };
  const subscriber = payload?.subscriber;
  if (!subscriber || typeof subscriber !== 'object' || !subscriber.entitlements ||
      !subscriber.subscriptions || !subscriber.non_subscriptions) throw new Error('Invalid RevenueCat response');
  const sandbox = testNamespace() !== null;
  const candidates: Pass[] = [];
  const productIds = new Set([...Object.keys(subscriber.subscriptions), ...Object.keys(subscriber.non_subscriptions)]);
  for (const productId of productIds) {
    const entitlementType = (['trip', 'yearly'] as const).find(type => subscriber.entitlements[type]?.product_identifier === productId);
    // Android subscription identifiers can include a base-plan suffix.
    const passType = entitlementType ?? PRODUCT_TYPES[productId.split(':')[0]!];
    if (!passType) continue;
    const subscription = subscriber.subscriptions[productId];
    const transactions = subscriber.non_subscriptions[productId] ?? [];
    if (!Array.isArray(transactions)) throw new Error('Invalid RevenueCat transactions');
    const entitlement = subscriber.entitlements[passType];
    // Preserve the existing backend's immediate cancellation/billing-issue rule.
    // Restore cannot reactivate a subscription while the verified flag remains.
    if (subscription?.unsubscribe_detected_at || subscription?.billing_issues_detected_at || subscription?.refunded_at) continue;
    const purchases = subscription ? [subscription] : transactions;
    for (const purchase of purchases) {
      if (purchase.is_sandbox !== sandbox) continue;
      const purchaseMs = Date.parse(purchase.purchase_date ?? '');
      if (!Number.isFinite(purchaseMs)) throw new Error('Missing verified purchase date');
      const mapped = entitlement?.product_identifier === productId ? entitlement : null;
      // RevenueCat non-consumables may have no expiry. Use the original purchase date,
      // never the SDK request/restore/startup time, for Splat's fixed-duration passes.
      const expiry = mapped?.expires_date ?? subscription?.expires_date;
      const expirationMs = expiry ? Date.parse(expiry) : purchaseMs + PASS_DAYS[passType] * DAY;
      if (!Number.isFinite(expirationMs)) throw new Error('Invalid verified expiry');
      if (expirationMs > Date.now()) candidates.push({ passType, expirationDate: new Date(expirationMs).toISOString() });
    }
  }
  const pass = candidates.sort((a, b) => Date.parse(b.expirationDate!) - Date.parse(a.expirationDate!))[0] ?? { ...NO_PASS };
  await savePass(kv, deviceId, pass, 'revenuecat');
  return pass;
}

export async function getPass(kv: Redis, deviceId: string): Promise<Pass> {
  const cached = await kv.get(cacheKey(deviceId));
  if (validCache(cached, deviceId)) return currentPass(cached);
  // An invalid/expired verified cache or any legacy record needs reconciliation.
  const legacy = await kv.get(billingKey(`pass:${deviceId}`));
  if (cached !== null || legacy !== null) return syncPass(kv, deviceId);
  return { ...NO_PASS };
}

export function scanLimit(name: 'FREE_SCANS_LIMIT' | 'IP_DAILY_FREE_SCANS_LIMIT', fallback: number): number {
  const value = process.env[name] ?? String(fallback);
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit)) throw new Error('Invalid scan limit');
  return limit;
}
export async function usageInfo(kv: Redis, deviceId: string, pass?: Pass) {
  const verified = pass ?? await getPass(kv, deviceId);
  const limit = scanLimit('FREE_SCANS_LIMIT', 3);
  const used = (await kv.get<number>(billingKey(`free:${deviceId}:${new Date().toISOString().slice(0, 7)}`))) || 0;
  return { ...verified, freeScansUsed: used, freeScansLimit: limit, freeScansRemaining: Math.max(0, limit - used) };
}
export async function activateMock(kv: Redis, deviceId: string, type: PassType) {
  if (!mockBillingEnabled()) throw new Error('Mock billing disabled');
  const pass = { passType: type, expirationDate: new Date(Date.now() + PASS_DAYS[type] * DAY).toISOString() };
  // Mock passes last for their duration only in this isolated test namespace.
  await kv.set(cacheKey(deviceId), { ...pass, version: 1, source: 'mock', deviceId,
    environment: billingKey('environment'), verifiedUntil: Date.parse(pass.expirationDate) }, { ex: PASS_DAYS[type] * 86400 });
  return pass;
}
export async function resetMock(kv: Redis, deviceId: string) {
  if (!mockBillingEnabled()) throw new Error('Mock billing disabled');
  await kv.del(cacheKey(deviceId), billingKey(`pass:${deviceId}`), billingKey(`ratelimit:${deviceId}`),
    billingKey(`free:${deviceId}:${new Date().toISOString().slice(0, 7)}`));
}
