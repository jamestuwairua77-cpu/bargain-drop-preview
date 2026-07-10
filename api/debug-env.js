export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const missing = [
    'CJ_ACCESS_TOKEN', 'SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_DOMAIN', 'SHOPIFY_WEBHOOK_SECRET',
    'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SENDGRID_API_KEY',
  ];

  const env = {};
  for (const k of missing) {
    const v = process.env[k];
    env[k] = v ? `✅ ${v.substring(0, 20)}...` : '❌ MISSING';
  }

  // Test Shopify token now that domain is set
  let shopifyOk = null;
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    try {
      const r = await fetch(
        `https://${process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com'}/admin/api/2024-01/shop.json`,
        { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN } }
      );
      const j = await r.json();
      shopifyOk = r.ok ? `✅ Shop: ${j?.shop?.name || 'yes'}` : `❌ ${JSON.stringify(j).substring(0,300)}`;
    } catch (e) { shopifyOk = `❌ ${e.message}`; }
  }

  // Test CJ token
  let cjOk = null;
  if (process.env.CJ_ACCESS_TOKEN) {
    try {
      const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: process.env.CJ_ACCESS_TOKEN }),
      });
      const j = await r.json();
      cjOk = j?.data?.accessToken ? `✅ ${j.data.accessToken.substring(0,10)}...` : `❌ ${j.message}`;
    } catch (e) { cjOk = `❌ ${e.message}`; }
  }

  res.status(200).json({ env, shopify: shopifyOk, cj: cjOk });
}
