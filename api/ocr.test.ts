import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockSet = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = mockGet;
      incr = mockIncr;
      expire = mockExpire;
      set = mockSet;
    }
  };
});

import handler from './ocr.js';

describe('OCR API Limit Enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.FREE_SCANS_LIMIT;
    delete process.env.IP_DAILY_FREE_SCANS_LIMIT;
    process.env.KV_REST_API_URL = 'http://localhost';
    process.env.KV_REST_API_TOKEN = 'mock-token';
  });

  test('should return 403 with dynamic message when monthly free limit is exceeded (default 3)', async () => {
    // 1: rateLimitKey count = 0
    // 2: passKey = null
    // 3: ipKey = 0
    // 4: freeScansKey = 3
    mockGet
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { image: 'base64_img', deviceId: 'test_dev' }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'LIMIT_EXCEEDED',
      message: 'You have reached your 3 free scans for this month.'
    });
  });

  test('should return 403 with promotional limit message when FREE_SCANS_LIMIT=12', async () => {
    process.env.FREE_SCANS_LIMIT = '12';

    mockGet
      .mockResolvedValueOnce(0) // ratelimit
      .mockResolvedValueOnce(null) // passKey
      .mockResolvedValueOnce(0) // ipKey
      .mockResolvedValueOnce(12); // freeScansKey

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { image: 'base64_img', deviceId: 'test_dev' }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'LIMIT_EXCEEDED',
      message: 'You have reached your 12 free scans for this month.'
    });
  });

  test('should return 403 when daily IP limit (default 20) is reached', async () => {
    mockGet
      .mockResolvedValueOnce(0) // ratelimit
      .mockResolvedValueOnce(null) // passKey
      .mockResolvedValueOnce(20); // ipKey count 20

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { image: 'base64_img', deviceId: 'test_dev' }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'LIMIT_EXCEEDED',
      message: 'Daily limit of 20 free scans reached for this network. Please try again tomorrow!'
    });
  });

  test('should respect custom IP_DAILY_FREE_SCANS_LIMIT', async () => {
    process.env.IP_DAILY_FREE_SCANS_LIMIT = '50';

    mockGet
      .mockResolvedValueOnce(0) // ratelimit
      .mockResolvedValueOnce(null) // passKey
      .mockResolvedValueOnce(50); // ipKey count 50

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { image: 'base64_img', deviceId: 'test_dev' }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'LIMIT_EXCEEDED',
      message: 'Daily limit of 50 free scans reached for this network. Please try again tomorrow!'
    });
  });
});
