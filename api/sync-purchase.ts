import { getBillingRedis, syncPass, usageInfo, validDeviceId, RETRY_ERROR } from '../server/billing.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  const deviceId = req.body?.deviceId;
  if (!validDeviceId(deviceId)) { res.status(400).json({ error: 'Missing or invalid deviceId' }); return; }
  try {
    const kv = getBillingRedis();
    const pass = await syncPass(kv, deviceId);
    res.status(200).json(await usageInfo(kv, deviceId, pass));
  } catch { res.status(503).json(RETRY_ERROR); }
}
