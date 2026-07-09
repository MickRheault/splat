import { describe, expect, test, vi, beforeEach } from 'vitest';

// Define mocks before importing handler so the class mock uses them
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockGet = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      set = mockSet;
      del = mockDel;
      get = mockGet;
    }
  };
});

// Import handler after mocking
import handler from './revenuecat-webhook.js';

describe('RevenueCat Webhook Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KV_REST_API_URL = 'http://localhost';
    process.env.KV_REST_API_TOKEN = 'mock-token';
    process.env.REVENUECAT_WEBHOOK_SECRET = 'my_secret';
  });

  test('should return 204 on OPTIONS method request', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {},
      body: {},
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  test('should return 405 on non-POST, non-OPTIONS requests', async () => {
    const req = {
      method: 'GET',
      headers: {},
      body: {},
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method Not Allowed' });
  });

  test('should return 400 if event payload is missing', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {},
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing event payload' });
  });

  test('should return 401 if authorization header is invalid', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong_secret',
      },
      body: {},
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('should activate entitlement on INITIAL_PURCHASE', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'INITIAL_PURCHASE',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
          expiration_at_ms: Date.now() + 100000,
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(mockSet).toHaveBeenCalledWith('pass:test-device-id', 'trip', expect.any(Object));
    expect(mockDel).toHaveBeenCalledWith('ratelimit:test-device-id');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should delete entitlement on EXPIRATION if currentPass matches', async () => {
    mockGet.mockResolvedValue('trip');
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'EXPIRATION',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(mockDel).toHaveBeenCalledWith('pass:test-device-id');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should ignore unhandled event type', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'TEST_UNHANDLED_EVENT',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should return 500 when KV operation throws error', async () => {
    mockGet.mockRejectedValue(new Error('KV store error'));
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'EXPIRATION',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'KV store error' });
  });

  test('should return 400 if app_user_id is missing', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'INITIAL_PURCHASE',
          entitlement_id: 'trip',
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing app_user_id (deviceId)' });
  });

  test('should activate entitlement with fallback duration when expiration_at_ms is missing', async () => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'INITIAL_PURCHASE',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(mockSet).toHaveBeenCalledWith('pass:test-device-id', 'trip', { ex: 14 * 24 * 60 * 60 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should bypass KV operations if KV environment variables are not configured', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer my_secret',
      },
      body: {
        event: {
          type: 'INITIAL_PURCHASE',
          app_user_id: 'test-device-id',
          entitlement_id: 'trip',
          expiration_at_ms: Date.now() + 100000,
        },
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
