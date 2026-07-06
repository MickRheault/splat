import { Redis } from '@upstash/redis';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Verify shared webhook secret for security
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (secret && authHeader !== `Bearer ${secret}` && authHeader !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { event } = req.body;
  if (!event) {
    res.status(400).json({ error: 'Missing event payload' });
    return;
  }

  const deviceId = event.app_user_id;
  const eventType = event.type;
  const entitlementId = event.entitlement_id; // e.g. "trip" or "yearly"

  if (!deviceId) {
    res.status(400).json({ error: 'Missing app_user_id (deviceId)' });
    return;
  }

  try {
    const kv = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
      ? new Redis({
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        })
      : null;

    if (kv) {
      const passKey = `pass:${deviceId}`;
      const rateLimitKey = `ratelimit:${deviceId}`;

      switch (eventType) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'UNCANCELLATION':
        case 'TRANSFER':
          if (entitlementId === 'trip' || entitlementId === 'yearly') {
            const expirationMs = event.expiration_at_ms;
            let seconds = 0;
            if (expirationMs) {
              seconds = Math.max(0, Math.ceil((expirationMs - Date.now()) / 1000));
            } else {
              // Default fallback if expiration_at_ms is not provided
              seconds = entitlementId === 'trip' ? 7 * 24 * 60 * 60 : 365 * 24 * 60 * 60;
            }

            if (seconds > 0) {
              await kv.set(passKey, entitlementId, { ex: seconds });
              await kv.del(rateLimitKey);
              console.log(`Webhook: Activated entitlement "${entitlementId}" for device "${deviceId}" for ${seconds} seconds.`);
            }
          }
          break;

        case 'EXPIRATION':
        case 'CANCELLATION':
        case 'BILLING_ISSUE':
          // Verify if the expired entitlement matches the stored one
          const currentPass = await kv.get(passKey);
          if (currentPass === entitlementId) {
            await kv.del(passKey);
            console.log(`Webhook: Cancelled/Expired entitlement "${entitlementId}" for device "${deviceId}".`);
          }
          break;

        default:
          console.log(`Webhook: Ignored unhandled event type "${eventType}".`);
          break;
      }
    }

    res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('RevenueCat webhook processing error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
