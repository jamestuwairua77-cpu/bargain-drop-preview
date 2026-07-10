// Processes Stripe token from Google Pay PAYMENT_GATEWAY.
// Google Pay creates the token → we confirm PaymentIntent with SECRET key.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key not configured' });

  const { token, amount, currency, email } = req.body;
  if (!token || !amount) return res.status(400).json({ error: 'Missing token or amount' });

  try {
    const pmParams = new URLSearchParams();
    pmParams.append('type', 'card');
    pmParams.append('card[token]', token);

    const pmResp = await fetch('https://api.stripe.com/v1/payment_methods', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: pmParams.toString()
    });
    const pmData = await pmResp.json();
    if (pmData.error) throw new Error(pmData.error.message);

    const piParams = new URLSearchParams();
    piParams.append('amount', String(amount));
    piParams.append('currency', (currency || 'aud').toLowerCase());
    piParams.append('payment_method', pmData.id);
    piParams.append('confirm', 'true');
    piParams.append('capture_method', 'automatic');
    if (email) piParams.append('receipt_email', email);

    const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: piParams.toString()
    });
    const piData = await piResp.json();
    if (piData.error) throw new Error(piData.error.message);

    res.status(200).json({ success: true, payment_intent_id: piData.id, status: piData.status });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
