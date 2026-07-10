export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'No Stripe key configured' });

  try {
    const r = await fetch('https://api.stripe.com/v1/account', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    res.status(200).json({
      account_id: d.id,
      name: d.settings?.dashboard?.display_name || d.business_profile?.name || 'N/A',
      email: d.email,
      country: d.country,
      charges_enabled: d.charges_enabled,
      pub_key_prefix: 'pk_live_' + d.id.substring(0,7) + '...'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
