export const config = {
  maxDuration: 30,
};

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
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: 'Missing image data' });
      return;
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
2. Extract all individual line items (name, price).
3. Do NOT include tax, service charges, VAT, or card fees in the items list.
4. Extract tax, service charge, card fee, or roundings as individual entries in an adjustments array:
   Example: [{"name": "Tax", "value": 3.50}, {"name": "Service Charge", "value": 5.00}]
5. Extract the tip value (if specified on the receipt).
6. Validate if the image is a valid receipt. If it's a photo of something else (like a dog, a car, landscape, blank screen, or arbitrary text), return a JSON with error: "This image does not appear to be a valid receipt."

Return format must be EXACTLY this JSON structure:
{
  "restaurant": "Restaurant Name",
  "date": "YYYY-MM-DD",
  "items": [
    {"name": "Item Name", "price": 10.50}
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
