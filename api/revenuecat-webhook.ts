import { timingSafeEqual } from 'node:crypto';
import { getBillingRedis, syncPass, validDeviceId, RETRY_ERROR } from '../server/billing.js';
const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'UNCANCELLATION',
  'EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'TRANSFER']);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) { res.status(503).json(RETRY_ERROR); return; }
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  const token = typeof header === 'string' ? header.replace(/^Bearer /, '') : '';
  if (Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  const event = req.body?.event;
  if (!event || typeof event !== 'object') { res.status(400).json({ error: 'Missing event payload' }); return; }
  if (!PURCHASE_EVENTS.has(event.type)) { res.status(200).json({ success: true }); return; }
  const ids: unknown[] = event.type === 'TRANSFER' ? [...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])] : [event.app_user_id];
  if (!ids.length || ids.some(id => !validDeviceId(id))) {
    res.status(400).json({ error: 'Missing or invalid app_user_id (deviceId)' }); return;
  }
  try {
    const kv = getBillingRedis();
    // Fetch current customer state instead of trusting event entitlement names/dates.
    // This also makes duplicate or out-of-order deliveries preserve original expiry.
    for (const id of new Set(ids as string[])) await syncPass(kv, id);
    res.status(200).json({ success: true });
  } catch { res.status(503).json(RETRY_ERROR); }
}
