export const config = {
  maxDuration: 60,
};

export default async function handler(req: Request) {
  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const { image } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: 'Missing image data' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key is not configured on Vercel backend' }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid image format. Expected base64 data URL.' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
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
      return new Response(JSON.stringify({ error: `Gemini API returned status ${response.status}: ${errorText}` }), {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const result = await response.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
