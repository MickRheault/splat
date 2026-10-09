import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const { set, del } = vi.hoisted(() => ({ set: vi.fn(), del: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class { set = set; del = del; } }));
import handler from './revenuecat-webhook.js';
const response = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() });
const request = (type = 'INITIAL_PURCHASE') => ({ method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: { event: { type, app_user_id: 'test-device', entitlement_ids: ['trip'], expiration_at_ms: 9999999999999 } } });
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  vi.stubEnv('REVENUECAT_WEBHOOK_SECRET', 'test-secret'); vi.stubEnv('REVENUECAT_SECRET_API_KEY', 'fake-server-key');
  vi.stubEnv('KV_REST_API_URL', 'http://localhost'); vi.stubEnv('KV_REST_API_TOKEN', 'fake-token');
  vi.stubEnv('BILLING_ENV', 'production');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ subscriber: {
    entitlements: {}, subscriptions: {}, non_subscriptions: { splat_14day_trip: [{ purchase_date: '2026-10-01T00:00:00Z', is_sandbox: false }] }
  } }))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test('OPTIONS responds without contacting providers', async () => {
  const res = response(); await handler({ method: 'OPTIONS' }, res);
  expect(res.status).toHaveBeenCalledWith(204); expect(fetch).not.toHaveBeenCalled();
});
test('unsupported methods are rejected', async () => {
  const res = response(); await handler({ method: 'GET' }, res); expect(res.status).toHaveBeenCalledWith(405);
});
test('missing payload and customer identity are rejected', async () => {
  for (const body of [{}, { event: { type: 'INITIAL_PURCHASE' } }]) {
    const res = response(); await handler({ ...request(), body }, res); expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(fetch).not.toHaveBeenCalled();
});
test('invalid authorization cannot change billing', async () => {
  const res = response(); await handler({ ...request(), headers: { authorization: 'wrong' } }, res);
  expect(res.status).toHaveBeenCalledWith(401); expect(set).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
test('duplicate non-renewing purchase webhooks keep the original expiry instead of trusting event expiry', async () => {
  for (let i = 0; i < 2; i++) {
    const res = response(); await handler(request('NON_RENEWING_PURCHASE'), res);
    expect(res.status).toHaveBeenCalledWith(200);
  }
  expect(set).toHaveBeenCalledWith('verified-pass:v1:test-device', expect.objectContaining({ source: 'revenuecat', passType: 'trip', expirationDate: '2026-10-15T00:00:00.000Z' }), expect.any(Object));
});
test('cancellation preserves immediate revocation when RevenueCat confirms cancellation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscriber: {
    entitlements: { yearly: { product_identifier: 'splat_yearly_pro', expires_date: '2027-02-01T00:00:00Z' } },
    subscriptions: { splat_yearly_pro: { purchase_date: '2026-02-01T00:00:00Z', expires_date: '2027-02-01T00:00:00Z', is_sandbox: false, unsubscribe_detected_at: '2026-10-09T00:00:00Z' } },
    non_subscriptions: {}
  } }))));
  const res = response(); await handler(request('CANCELLATION'), res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(set).toHaveBeenCalledWith('verified-pass:v1:test-device', expect.objectContaining({ passType: null }), expect.any(Object));
});
test('unrelated webhook events are acknowledged without touching billing', async () => {
  const res = response(); await handler(request('TEST'), res);
  expect(res.status).toHaveBeenCalledWith(200); expect(fetch).not.toHaveBeenCalled();
});
test('storage and provider failures return retryable errors', async () => {
  set.mockRejectedValueOnce(new Error('storage offline'));
  const res = response(); await handler(request(), res); expect(res.status).toHaveBeenCalledWith(503);
  vi.stubEnv('KV_REST_API_URL', '');
  const missing = response(); await handler(request(), missing); expect(missing.status).toHaveBeenCalledWith(503);
});
test('transfer events reconcile all affected existing customer IDs', async () => {
  const res = response();
  await handler({ ...request(), body: { event: { type: 'TRANSFER', transferred_from: ['original-id'], transferred_to: ['restored-id'] } } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(fetch).toHaveBeenCalledWith('https://api.revenuecat.com/v1/subscribers/original-id', expect.any(Object));
  expect(fetch).toHaveBeenCalledWith('https://api.revenuecat.com/v1/subscribers/restored-id', expect.any(Object));
});
