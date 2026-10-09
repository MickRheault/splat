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

  test.each([undefined, null, '', '   ', 123, {}, []])('rejects invalid deviceId %j before any external call', async (deviceId) => {
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'POST', body: { image: 'data:image/jpeg;base64,abc', deviceId } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid deviceId' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  test('client paid-pass claim cannot bypass exhausted free quota', async () => {
    mockGet.mockImplementation(async (key: string) => key.startsWith('free:') ? 3 : null);
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'POST', headers: {}, body: { image: 'data:image/jpeg;base64,abc', deviceId: 'web_test', passType: 'yearly' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSet).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  test('should return 403 with dynamic message when monthly free limit is exceeded (default 3)', async () => {
    mockGet.mockImplementation(async (key: string) => key.startsWith('free:') ? 3 : null);

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

    mockGet.mockImplementation(async (key: string) => key.startsWith('free:') ? 12 : null);

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
    mockGet.mockImplementation(async (key: string) => key.startsWith('ipfree:') ? 20 : null);

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

    mockGet.mockImplementation(async (key: string) => key.startsWith('ipfree:') ? 50 : null);

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

  test('should successfully parse OCR and increment scan count when Gemini returns valid content', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGet.mockResolvedValue(null);

    const fakeGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  items: [{ name: 'Coffee', price: 5, quantity: 1 }],
                  adjustments: [],
                  currencySymbol: '$',
                  category: 'food_drink'
                })
              }
            ]
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(fakeGeminiResponse)
    } as any);

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { image: 'data:image/jpeg;base64,abc123', deviceId: 'test_dev' }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeGeminiResponse);
    expect(mockIncr).toHaveBeenCalled();
  });
});
