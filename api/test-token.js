export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return res.status(500).json({ error: 'No key configured' });

  const results = {};

  // Test 1: Token API with raw card
  const t1 = await fetch('https://api.stripe.com/v1/tokens', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'card[number]': '4111111111111111', 'card[exp_month]': '12', 'card[exp_year]': '2030', 'card[cvc]': '123' }).toString()
  });
  results.token = await t1.json();

  // Test 2: PaymentMethod with card data
  const t2 = await fetch('https://api.stripe.com/v1/payment_methods', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ type: 'card', 'card[number]': '4111111111111111', 'card[exp_month]': '12', 'card[exp_year]': '2030', 'card[cvc]': '123' }).toString()
  });
  results.payment_method = await t2.json();

  // Test 3: Account + key prefix
  const t3 = await fetch('https://api.stripe.com/v1/account', {
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
  });
  const acc = await t3.json();
  results.account = { id: acc.id, name: acc.settings?.dashboard?.display_name || acc.business_profile?.name };

  res.status(200).json(results);
}
