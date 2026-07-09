import { Redis } from '@upstash/redis';

declare const process: any;

const kv = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

export const config = {
  maxDuration: 30,
};

function getWeekKey(deviceId: string) {
  const d = new Date();
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
  return `usage:${deviceId}:${d.getFullYear()}-W${weekNumber}`;
}

export default async function handler(req: any, res: any) {
  // Handle CORS preflight options
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { image, deviceId } = req.body;
    if (!image) {
      res.status(400).json({ error: 'Missing image data' });
      return;
    }

    // 1. Vercel KV limits and subscription checks (only run if KV env vars are set)
    const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (hasKV && deviceId && kv) {
      // A. Rate Limiting: Max 1 scan per 60 seconds per device ID
      const rateLimitKey = `ratelimit:${deviceId}`;
      const isRateLimited = await kv.get(rateLimitKey);
      if (isRateLimited) {
        res.status(429).json({ 
          error: 'RATE_LIMIT_EXCEEDED', 
          message: 'Please wait a minute before scanning another receipt.' 
        });
        return;
      }

      // B. Check subscription / pass status
      const passKey = `pass:${deviceId}`;
      const passType = await kv.get(passKey); // e.g. "trip" or "yearly"

      if (!passType) {
        // IP-based Rate Limiting for Free Scans: Max 10 scans per day per IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
        if (ip !== 'unknown') {
          const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const ipKey = `ipfree:${ip}:${today}`;
          const ipScans = (await kv.get<number>(ipKey)) || 0;
          if (ipScans >= 10) {
            res.status(403).json({
              error: 'LIMIT_EXCEEDED',
              message: 'Daily limit of 10 free scans reached for this network. Please try again tomorrow!'
            });
            return;
          }
          // Increment IP scan count
          await kv.incr(ipKey);
          await kv.expire(ipKey, 24 * 60 * 60); // 24 hours expiry
        }

        // No active pass. Check monthly free scan limit (cap of 5)
        const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
        const freeScansKey = `free:${deviceId}:${currentMonth}`;
        const freeScansUsed = (await kv.get<number>(freeScansKey)) || 0;

        if (freeScansUsed >= 5) {
          res.status(403).json({ 
            error: 'LIMIT_EXCEEDED', 
            message: 'You have used all 5 free scans for this month. Upgrade to continue!' 
          });
          return;
        }

        // Set rate limit cooldown (60 seconds)
        await kv.set(rateLimitKey, '1', { ex: 60 });
        // Increment free scan count
        await kv.incr(freeScansKey);
        // Set TTL on free scan key for 35 days so it auto-deletes later
        await kv.expire(freeScansKey, 35 * 24 * 60 * 60);
      } else {
        // Active pass exists! Enforce weekly fair-use limit of 50 scans
        const weekKey = getWeekKey(deviceId);
        const scansThisWeek = (await kv.get<number>(weekKey)) || 0;

        if (scansThisWeek >= 50) {
          res.status(403).json({ 
            error: 'LIMIT_EXCEEDED', 
            message: 'Fair Use limit of 50 scans per week reached. Please wait until next week!' 
          });
          return;
        }

        // Set rate limit cooldown (60 seconds)
        await kv.set(rateLimitKey, '1', { ex: 60 });
        // Increment weekly usage count
        await kv.incr(weekKey);
        // Set TTL on week key for 8 days
        await kv.expire(weekKey, 8 * 24 * 60 * 60);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Gemini API key is not configured on Vercel backend' });
      return;
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format. Expected base64 data URL.' });
      return;
    }
    
    const mimeType = match[1];
    const base64Data = match[2];

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert receipt parser. Analyze this receipt and return a clean JSON object.
Follow these rules strictly:
1. Extract the merchant/restaurant name and target date if present.
2. Extract all individual line items (name, total price, quantity count). If an item has a quantity/count specified (e.g. '3 - Beer : 15$'), return the quantity as 3, and the price as the total line price ($15.00). If no quantity is specified, default to 1.
3. Do NOT include tax, service charges, VAT, or card fees in the items list.
4. Extract tax, service charge, card fee, or roundings as individual entries in an adjustments array:
   Example: [{"name": "Tax", "value": 3.50}, {"name": "Service Charge", "value": 5.00}]
5. Extract the tip value (if specified on the receipt).
6. Validate if the image is a valid receipt. If it's a photo of something else (like a dog, a car, landscape, blank screen, or arbitrary text), return a JSON with error: "This image does not appear to be a valid receipt."
7. Categorize the bill type. Output exactly one of: 'food_drink' (restaurants/bars), 'groceries' (supermarkets), 'transport_fuel' (fuel/taxi/tolls), 'lodging' (hotels/hostels/Airbnb), 'tickets_entertainment' (movies/gigs/parks), 'shopping' (stores), 'activities' (tours/rental/sports), or 'general' (utilities/others).

Return format must be EXACTLY this JSON structure:
{
  "restaurant": "Restaurant Name",
  "date": "YYYY-MM-DD",
  "category": "food_drink",
  "items": [
    {"name": "Item Name", "price": 10.50, "quantity": 3}
  ],
  "adjustments": [
    {"name": "Tax/VAT/Service Charge Name", "value": 1.50}
  ],
  "tip": 5.00
}`
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Gemini API returned status ${response.status}: ${errorText}` });
      return;
    }

    const result = await response.json();
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
}
