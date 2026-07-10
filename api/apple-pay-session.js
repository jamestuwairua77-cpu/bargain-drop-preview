// Apple Pay merchant validation — uses Stripe to create an Apple Pay session
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { validationURL } = req.body;
  if (!validationURL) return res.status(400).json({ error: 'Missing validationURL' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key not configured' });

  try {
    // Use Stripe to validate the Apple Pay merchant session
    const resp = await fetch('https://api.stripe.com/v1/apple_pay/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ validation_url: validationURL, domain_name: 'bargain-drop.online' }).toString()
    });
    const session = await resp.json();
    res.status(200).json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
