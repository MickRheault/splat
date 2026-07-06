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
import handler from './revenuecat-webhook';

describe('RevenueCat Webhook Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KV_REST_API_URL = 'http://localhost';
    process.env.KV_REST_API_TOKEN = 'mock-token';
    process.env.REVENUECAT_WEBHOOK_SECRET = 'my_secret';
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
});
