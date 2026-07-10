// Quick runtime env check — tells us what's actually available (prefixes only).
// Also tests the Shopify token against a real API call.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const keys = [
    'CJ_ACCESS_TOKEN', 'SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_DOMAIN', 'SHOPIFY_WEBHOOK_SECRET',
    'STRIPE_SECRET_KEY', 'SENDGRID_API_KEY', 'STRIPE_PUBLISHABLE_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GPAY_PRIVATE_KEY', 'GPAY_PRIVATE_KEY_PEM_B64',
  ];

  const env = {};
  for (const k of keys) {
    const v = process.env[k];
    env[k] = v
      ? { present: true, prefix: v.substring(0, 12) + (v.length > 12 ? '...' : ''), length: v.length }
      : { present: false };
  }

  // Test Shopify token
  let shopifyTest = { tried: false, ok: false, error: '' };
  if (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_DOMAIN) {
    shopifyTest.tried = true;
    try {
      const r = await fetch(
        `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/shop.json`,
        { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN } }
      );
      const j = await r.json();
      shopifyTest.ok = r.ok;
      shopifyTest.status = r.status;
      shopifyTest.shop_name = j?.shop?.name || null;
      shopifyTest.error = !r.ok ? (JSON.stringify(j).substring(0, 400)) : null;
    } catch (e) {
      shopifyTest.error = e.message;
    }
  }

  // Test CJ token
  let cjTest = { tried: false, ok: false, error: '' };
  if (process.env.CJ_ACCESS_TOKEN) {
    cjTest.tried = true;
    try {
      const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: process.env.CJ_ACCESS_TOKEN }),
      });
      const j = await r.json();
      cjTest.ok = !!j?.data?.accessToken;
      cjTest.message = j?.message || (cjTest.ok ? 'auth ok' : 'auth failed');
    } catch (e) {
      cjTest.error = e.message;
    }
  }

  res.status(200).json({ env, shopifyTest, cjTest });
}
