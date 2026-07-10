export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amount, currency, customer_email, metadata } = req.body;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';

  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key not configured' });

  try {
    const params = new URLSearchParams();
    params.append('amount', amount); // cents
    params.append('currency', (currency || 'aud').toLowerCase());
    params.append('receipt_email', customer_email || '');
    if (metadata) {
      Object.entries(metadata).forEach(([k, v]) => params.append(`metadata[${k}]`, v));
    }

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (data.client_secret) {
      res.status(200).json({ client_secret: data.client_secret });
    } else {
      res.status(400).json({ error: data.error?.message || 'PaymentIntent failed', details: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
