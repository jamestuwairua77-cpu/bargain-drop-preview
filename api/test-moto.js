export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.STRIPE_SECRET_KEY;
  const results = {};

  // Try different approaches

  // 1. PaymentIntent with moto + payment_method_data
  const t1 = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      amount: '100', currency: 'aud', confirm: 'true',
      'payment_method_data[type]': 'card',
      'payment_method_data[card][number]': '4111111111111111',
      'payment_method_data[card][exp_month]': '12',
      'payment_method_data[card][exp_year]': '2030',
      'payment_method_data[card][cvc]': '123',
      'payment_method_options[card][moto]': 'true'
    }).toString()
  });
  results.moto_pi = await t1.json();

  // 2. SetupIntent + moto
  const t2 = await fetch('https://api.stripe.com/v1/setup_intents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'payment_method_data[type]': 'card',
      'payment_method_data[card][number]': '4111111111111111',
      'payment_method_data[card][exp_month]': '12',
      'payment_method_data[card][exp_year]': '2030',
      'payment_method_data[card][cvc]': '123',
      'payment_method_options[card][moto]': 'true'
    }).toString()
  });
  results.moto_si = await t2.json();

  // 3. Try listing restricted API keys
  const t3 = await fetch('https://api.stripe.com/v1/account', {
    headers: { 'Authorization': `Bearer ${KEY}` }
  });
  const acc = await t3.json();
  results.account_id = acc.id;

  // 4. Try to check if account has publishable key tokenization info
  const t4 = await fetch('https://api.stripe.com/v1/accounts/' + acc.id, {
    headers: { 'Authorization': `Bearer ${KEY}` }
  });
  const accFull = await t4.json();
  results.settings = accFull.settings || {};

  res.status(200).json(results);
}
