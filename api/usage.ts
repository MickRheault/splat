import { getBillingRedis, usageInfo, validDeviceId, RETRY_ERROR } from '../server/billing.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  const deviceId = req.query?.deviceId;
  if (!validDeviceId(deviceId)) { res.status(400).json({ error: 'Missing or invalid deviceId' }); return; }
  try {
    res.status(200).json(await usageInfo(getBillingRedis(), deviceId));
  } catch {
    res.status(503).json(RETRY_ERROR);
  }
}
