import { kv } from '@vercel/kv';

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
    if (hasKV) {
      const passKey = `pass:${deviceId}`;
      const passType = await kv.get(passKey); // "trip", "yearly", or null

      const currentMonth = new Date().toISOString().slice(0, 7);
      const freeScansKey = `free:${deviceId}:${currentMonth}`;
      const freeScansUsed = (await kv.get<number>(freeScansKey)) || 0;

      res.status(200).json({
        passType,
        freeScansUsed,
        freeScansLimit: 3,
        freeScansRemaining: Math.max(0, 3 - freeScansUsed)
      });
    } else {
      res.status(200).json({
        passType: 'dev_unlimited',
        freeScansUsed: 0,
        freeScansLimit: 3,
        freeScansRemaining: 3
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
