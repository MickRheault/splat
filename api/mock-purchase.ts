import { Redis } from '@upstash/redis';

declare const process: any;

const kv = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

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
    if (hasKV && kv) {
      const passKey = `pass:${deviceId}`;
      const rateLimitKey = `ratelimit:${deviceId}`;
      
      if (type === 'reset') {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const freeScansKey = `free:${deviceId}:${currentMonth}`;
        
        await kv.del(passKey);
        await kv.del(rateLimitKey);
        await kv.del(freeScansKey);
        
        res.status(200).json({ success: true, message: `Reset usage and passes for ${deviceId}` });
      } else {
        const seconds = type === 'trip' ? 14 * 24 * 60 * 60 : 365 * 24 * 60 * 60;
        await kv.set(passKey, type, { ex: seconds });
        await kv.del(rateLimitKey);
        
        res.status(200).json({ success: true, message: `Activated ${type} pass for ${deviceId}` });
      }
    } else {
      res.status(200).json({ success: true, message: 'No KV database linked, simulated operation successfully!' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
