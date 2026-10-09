import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockTtl = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = mockGet;
      ttl = mockTtl;
    }
  };
});

import handler from './usage.js';

describe('Usage API Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.FREE_SCANS_LIMIT;
    process.env.KV_REST_API_URL = 'http://localhost';
    process.env.KV_REST_API_TOKEN = 'mock-token';
  });

  test('should return 204 on OPTIONS request', async () => {
    const req = { method: 'OPTIONS', query: {} };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  test('should return 400 when deviceId is missing', async () => {
    const req = { method: 'GET', query: {} };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid deviceId' });
  });

  test('should return default limit of 3 when FREE_SCANS_LIMIT is unset', async () => {
    mockGet.mockResolvedValue(null);
    const req = { method: 'GET', query: { deviceId: 'dev_123' } };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      passType: null,
      expirationDate: null,
      freeScansUsed: 0,
      freeScansLimit: 3,
      freeScansRemaining: 3
    });
  });

  test('should return promotional limit of 12 when FREE_SCANS_LIMIT is set to 12', async () => {
    process.env.FREE_SCANS_LIMIT = '12';
    // First get for passKey (null), second get for freeScansKey (3 used)
    mockGet.mockImplementation(async (key: string) => key.startsWith('free:') ? 3 : null);

    const req = { method: 'GET', query: { deviceId: 'dev_123' } };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      passType: null,
      expirationDate: null,
      freeScansUsed: 3,
      freeScansLimit: 12,
      freeScansRemaining: 9
    });
  });

  test('should clamp freeScansRemaining to 0 when freeScansUsed exceeds limit', async () => {
    process.env.FREE_SCANS_LIMIT = '12';
    mockGet.mockImplementation(async (key: string) => key.startsWith('free:') ? 15 : null);

    const req = { method: 'GET', query: { deviceId: 'dev_123' } };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      passType: null,
      expirationDate: null,
      freeScansUsed: 15,
      freeScansLimit: 12,
      freeScansRemaining: 0
    });
  });

  test('should pause usage reporting when KV is not configured', async () => {
    delete process.env.KV_REST_API_URL;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'GET', query: { deviceId: 'dev_123' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BILLING_UNAVAILABLE' }));
  });
});
