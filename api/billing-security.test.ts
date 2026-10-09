import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const { data, get, set, del, incr, expire } = vi.hoisted(() => ({
  data: new Map<string, unknown>(), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({ Redis: class { get = get; set = set; del = del; incr = incr; expire = expire; ttl = async () => 14 * 86400; } }));
import usage from './usage.js';
import syncPurchase from './sync-purchase.js';
import ocr from './ocr.js';
import mockPurchase from './mock-purchase.js';
import webhook from './revenuecat-webhook.js';

const response = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() });
const rc = (purchaseDate: string) => ({ subscriber: {
  entitlements: {}, subscriptions: {},
  non_subscriptions: { splat_14day_trip: [{ id: 'original-transaction', purchase_date: purchaseDate, is_sandbox: false }] },
} });
beforeEach(() => {
  vi.resetAllMocks(); data.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  vi.stubEnv('KV_REST_API_URL', 'http://localhost'); vi.stubEnv('KV_REST_API_TOKEN', 'fake-token');
  vi.stubEnv('REVENUECAT_SECRET_API_KEY', 'server-test-key');
  vi.stubEnv('BILLING_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'production');
  get.mockImplementation(async (key: string) => data.get(key) ?? null);
  set.mockImplementation(async (key: string, value: unknown) => { data.set(key, value); });
  del.mockImplementation(async (key: string) => { data.delete(key); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test('legacy Redis pass is reconciled with original purchase date instead of restarting expiry', async () => {
  data.set('pass:device', 'trip');
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => rc('2026-09-01T00:00:00Z') });
  vi.stubGlobal('fetch', provider);
  const res = response();
  await usage({ method: 'GET', query: { deviceId: 'device' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: null, expirationDate: null }));
  expect(provider).toHaveBeenCalledWith('https://api.revenuecat.com/v1/subscribers/device', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-test-key' }) }));
});

test('OCR pauses before Gemini if billing storage is not configured', async () => {
  vi.stubEnv('KV_REST_API_URL', '');
  vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', provider);
  const res = response();
  await ocr({ method: 'POST', headers: {}, body: { deviceId: 'device', image: 'data:image/jpeg;base64,abc' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BILLING_UNAVAILABLE' }));
  expect(provider).not.toHaveBeenCalled();
});

test.each(['trip', 'yearly', 'reset'])('production blocks mock %s even with a client dev menu', async (type) => {
  vi.stubEnv('BILLING_TEST_MODE', 'true');
  vi.stubEnv('VITE_ENABLE_DEV_MENU', 'true');
  const res = response();
  await mockPurchase({ method: 'POST', body: { deviceId: 'device', type } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled();
});

test('webhook cannot activate passes when its authentication secret is missing', async () => {
  vi.stubEnv('REVENUECAT_WEBHOOK_SECRET', '');
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  const res = response();
  await webhook({ method: 'POST', headers: {}, body: { event: { type: 'INITIAL_PURCHASE', app_user_id: 'device', entitlement_id: 'trip' } } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(set).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
});

test('purchase sync preserves original trip expiry across repeated restore, restart, and cache refresh', async () => {
  const provider = vi.fn().mockImplementation(async () => new Response(JSON.stringify(rc('2026-10-01T00:00:00Z'))));
  vi.stubGlobal('fetch', provider);
  for (let i = 0; i < 2; i++) {
    const res = response(); await syncPurchase({ method: 'POST', body: { deviceId: 'device', type: 'yearly' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: 'trip', expirationDate: '2026-10-15T00:00:00.000Z' }));
  }
  vi.setSystemTime(new Date('2026-10-10T00:06:00Z'));
  const refreshed = response(); await usage({ method: 'GET', query: { deviceId: 'device' } }, refreshed);
  expect(refreshed.json).toHaveBeenCalledWith(expect.objectContaining({ expirationDate: '2026-10-15T00:00:00.000Z' }));
  expect(provider).toHaveBeenCalledTimes(3);
  vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
  const expired = response(); await syncPurchase({ method: 'POST', body: { deviceId: 'device' } }, expired);
  expect(expired.json).toHaveBeenCalledWith(expect.objectContaining({ passType: null, expirationDate: null }));
});

test('verified paid cache permits OCR without calling RevenueCat again', async () => {
  const provider = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('revenuecat.com') ? rc('2026-10-01T00:00:00Z') : { candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] })));
  vi.stubGlobal('fetch', provider); vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  await syncPurchase({ method: 'POST', body: { deviceId: 'device' } }, response());
  const res = response(); await ocr({ method: 'POST', headers: {}, body: { deviceId: 'device', image: 'data:image/jpeg;base64,abc' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(provider.mock.calls.filter(([url]) => String(url).includes('revenuecat.com'))).toHaveLength(1);
  expect(incr).toHaveBeenCalledWith(expect.stringMatching(/^usage:device:/));
});

test.each(['local', 'staging'])('mock activation and reset are isolated in %s even with a production build', async (env) => {
  vi.stubEnv('BILLING_ENV', env); vi.stubEnv('VERCEL_ENV', env === 'local' ? '' : 'preview');
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BILLING_TEST_MODE', 'true'); vi.stubEnv('BILLING_TEST_NAMESPACE', 'qa');
  vi.stubEnv('BILLING_TEST_KV_REST_API_URL', 'http://test-redis'); vi.stubEnv('BILLING_TEST_KV_REST_API_TOKEN', 'test-only-token');
  data.set('pass:device', 'yearly');
  const res = response(); await mockPurchase({ method: 'POST', body: { deviceId: 'device', type: 'trip' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: 'trip' }));
  const status = response(); await usage({ method: 'GET', query: { deviceId: 'device' } }, status);
  expect(status.json).toHaveBeenCalledWith(expect.objectContaining({ passType: 'trip' }));
  const reset = response(); await mockPurchase({ method: 'POST', body: { deviceId: 'device', type: 'reset' } }, reset);
  expect(reset.status).toHaveBeenCalledWith(200);
  expect([...get.mock.calls, ...set.mock.calls, ...del.mock.calls].flatMap(args => args.filter(arg => typeof arg === 'string'))).not.toContain('pass:device');
  expect(data.get('pass:device')).toBe('yearly');
});

test('a test configuration on a production deployment is rejected before database access', async () => {
  vi.stubEnv('BILLING_ENV', 'staging'); vi.stubEnv('BILLING_TEST_MODE', 'true'); vi.stubEnv('BILLING_TEST_NAMESPACE', 'qa');
  const res = response(); await mockPurchase({ method: 'POST', body: { deviceId: 'device', type: 'reset' } }, res);
  expect(res.status).toHaveBeenCalledWith(503); expect(get).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled();
});

test.each(['provider-offline', 'missing-key', 'redis-offline', 'missing-date', 'malformed-provider-response'])('required legacy reconciliation fails closed: %s', async (failure) => {
  data.set('pass:device', 'yearly'); vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  const provider = vi.fn().mockImplementation(async () => {
    if (failure === 'provider-offline') throw new Error('offline');
    return new Response(JSON.stringify(failure === 'malformed-provider-response' ? {} : rc(failure === 'missing-date' ? 'invalid' : '2026-10-01T00:00:00Z')));
  });
  vi.stubGlobal('fetch', provider);
  if (failure === 'missing-key') vi.stubEnv('REVENUECAT_SECRET_API_KEY', '');
  if (failure === 'redis-offline') get.mockRejectedValue(new Error('offline'));
  const res = response(); await ocr({ method: 'POST', headers: {}, body: { deviceId: 'device', image: 'data:image/jpeg;base64,abc' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BILLING_UNAVAILABLE' }));
  expect(provider.mock.calls.some(([url]) => String(url).includes('generativelanguage'))).toBe(false);
});

test('sandbox receipts cannot activate production passes', async () => {
  const payload = rc('2026-10-01T00:00:00Z'); payload.subscriber.non_subscriptions.splat_14day_trip[0]!.is_sandbox = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  const res = response(); await syncPurchase({ method: 'POST', body: { deviceId: 'device' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: null }));
});

test('Android base-plan subscriptions preserve the RevenueCat expiry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscriber: {
    entitlements: { yearly: { product_identifier: 'splat_yearly_pro:annual', purchase_date: '2026-02-01T00:00:00Z', expires_date: '2027-02-01T00:00:00Z' } },
    subscriptions: { 'splat_yearly_pro:annual': { is_sandbox: false, purchase_date: '2026-02-01T00:00:00Z', expires_date: '2027-02-01T00:00:00Z' } }, non_subscriptions: {}
  } }))));
  const res = response(); await syncPurchase({ method: 'POST', body: { deviceId: 'device' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: 'yearly', expirationDate: '2027-02-01T00:00:00.000Z' }));
});

test('invalid quota configuration pauses OCR instead of disabling the monthly limit', async () => {
  vi.stubEnv('FREE_SCANS_LIMIT', 'invalid'); vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
  vi.stubGlobal('fetch', provider);
  const res = response(); await ocr({ method: 'POST', headers: {}, body: { deviceId: 'device', image: 'data:image/jpeg;base64,abc' } }, res);
  expect(res.status).toHaveBeenCalledWith(503); expect(provider).not.toHaveBeenCalled();
});

test('staging never falls back to configured production Redis credentials', async () => {
  vi.stubEnv('BILLING_ENV', 'staging'); vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('BILLING_TEST_NAMESPACE', 'qa');
  vi.stubEnv('BILLING_TEST_MODE', 'true'); vi.stubEnv('BILLING_TEST_KV_REST_API_URL', ''); vi.stubEnv('BILLING_TEST_KV_REST_API_TOKEN', '');
  const res = response(); await mockPurchase({ method: 'POST', body: { deviceId: 'device', type: 'trip' } }, res);
  expect(res.status).toHaveBeenCalledWith(503); expect(set).not.toHaveBeenCalled();
});

test('legacy mock passes without verified purchases cannot bypass the free quota', async () => {
  data.set('pass:device', 'yearly'); data.set('free:device:2026-10', 3);
  const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscriber: { entitlements: {}, subscriptions: {}, non_subscriptions: {} } })));
  vi.stubGlobal('fetch', provider); vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  const res = response(); await ocr({ method: 'POST', headers: {}, body: { deviceId: 'device', passType: 'yearly', image: 'data:image/jpeg;base64,abc' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(provider.mock.calls.some(([url]) => String(url).includes('generativelanguage'))).toBe(false);
});

test('a genuinely new verified transaction can activate an expired pass with its own original date', async () => {
  vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
  const payload = rc('2026-09-01T00:00:00Z');
  payload.subscriber.non_subscriptions.splat_14day_trip.push({ id: 'new-transaction', is_sandbox: false, purchase_date: '2026-10-16T00:00:00Z' });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload))));
  const res = response(); await syncPurchase({ method: 'POST', body: { deviceId: 'device' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passType: 'trip', expirationDate: '2026-10-30T00:00:00.000Z' }));
});
