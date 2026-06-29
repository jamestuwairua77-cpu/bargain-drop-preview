export default async function handler(req, res) {
  const { code, shop, hmac } = req.query;
  if (!code || !shop) {
    return res.status(400).json({ error: 'Missing code or shop' });
  }
  
  const clientId = process.env.SHOPIFY_CLIENT_ID || '9ab0d272cfd0e8d378145a7eee7634ee';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  
  if (!clientSecret) {
    return res.status(500).json({ error: 'Shopify client secret not configured' });
  }
  
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const data = await tokenRes.json();
    
    if (data.access_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px"><h1>✅ Connected!</h1><p>Shop: ${shop}</p><p>Token generated. You can close this page.</p></body></html>`);
    } else {
      res.status(400).json({ error: 'Token exchange failed', details: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
