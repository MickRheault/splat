import { kv } from '@vercel/kv';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { deviceId, type } = req.body; // type = 'trip' or 'yearly'
  if (!deviceId) {
    res.status(400).json({ error: 'Missing deviceId' });
    return;
  }

  try {
    const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (hasKV) {
      const passKey = `pass:${deviceId}`;
      const seconds = type === 'trip' ? 7 * 24 * 60 * 60 : 365 * 24 * 60 * 60;
      await kv.set(passKey, type, { ex: seconds });
      
      // Also clear rate limits and monthly caps for testing
      const rateLimitKey = `ratelimit:${deviceId}`;
      await kv.del(rateLimitKey);
      
      res.status(200).json({ success: true, message: `Activated ${type} pass for ${deviceId}` });
    } else {
      res.status(200).json({ success: true, message: 'No KV database linked, simulated purchase successfully!' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
