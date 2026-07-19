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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { deviceId } = req.query;
  if (!deviceId) {
    res.status(400).json({ error: 'Missing deviceId' });
    return;
  }

  try {
    const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (hasKV && kv) {
      const passKey = `pass:${deviceId}`;
      const passType = await kv.get(passKey); // "trip", "yearly", or null
      let expirationDate = null;
      if (passType) {
        const ttl = await kv.ttl(passKey);
        if (ttl > 0) {
          expirationDate = new Date(Date.now() + ttl * 1000).toISOString();
        }
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      const freeScansKey = `free:${deviceId}:${currentMonth}`;
      const freeScansUsed = (await kv.get<number>(freeScansKey)) || 0;

      res.status(200).json({
        passType,
        expirationDate,
        freeScansUsed,
        freeScansLimit: 5,
        freeScansRemaining: Math.max(0, 5 - freeScansUsed)
      });
    } else {
      res.status(200).json({
        passType: 'dev_unlimited',
        freeScansUsed: 0,
        freeScansLimit: 5,
        freeScansRemaining: 5
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
