import { activateMock, getBillingRedis, mockBillingEnabled, resetMock, usageInfo, validDeviceId, RETRY_ERROR } from '../server/billing.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    // Deployment configuration, never a client flag or NODE_ENV, controls this endpoint.
    if (!mockBillingEnabled()) { res.status(404).json({ error: 'Not Found' }); return; }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
    const { deviceId, type } = req.body ?? {};
    if (!validDeviceId(deviceId) || !['trip', 'yearly', 'reset'].includes(type)) {
      res.status(400).json({ error: 'Invalid deviceId or mock purchase type' }); return;
    }
    const kv = getBillingRedis();
    if (type === 'reset') await resetMock(kv, deviceId);
    else await activateMock(kv, deviceId, type);
    res.status(200).json(await usageInfo(kv, deviceId));
  } catch { res.status(503).json(RETRY_ERROR); }
}
