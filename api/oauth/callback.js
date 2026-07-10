// Enhanced Shopify OAuth Callback — saves access token
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const DATA_DIR = '/tmp/data';
const TOKEN_FILE = '/tmp/data/shopify-token.json';

export default async function handler(req, res) {
  const { code, shop, hmac } = req.query;
  
  if (!code || !shop) {
    // Show setup page if no code
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h2>Shopify OAuth Callback</h2>
      <p style="color:#d97706">No authorization code received.</p>
      <p>Go to <a href="/api/setup-shopify">Setup Page</a></p>
    </body></html>`);
    return;
  }
  
  const clientId = process.env.SHOPIFY_CLIENT_ID || '9ab0d272cfd0e8d378145a7eee7634ee';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  
  if (!clientSecret) {
    return res.status(500).json({ error: 'Shopify client secret not configured in Vercel env' });
  }
  
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const data = await tokenRes.json();
    
    if (data.access_token) {
      // Save token to filesystem for persistence
      try {
        if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(TOKEN_FILE, JSON.stringify({
          access_token: data.access_token,
          shop: shop,
          scope: data.scope || '',
          created_at: new Date().toISOString(),
          expires_at: null
        }, null, 2));
      } catch (e) {
        console.error('Failed to save token file:', e.message);
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Shopify Connected — Bargain Drop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:14px;padding:32px;max-width:480px;text-align:center;border:1px solid #e5e7eb}
.check{width:56px;height:56px;background:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;color:#fff}
h1{font-size:1.2rem;margin-bottom:8px}
p{font-size:.8rem;color:#777;line-height:1.5;margin-bottom:4px}
.token-box{background:#f3f4f6;padding:16px;border-radius:10px;margin:16px 0;word-break:break-all}
.token-box code{font-size:.65rem;color:#374151}
.copy-btn{background:#111;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:.75rem;cursor:pointer;margin-top:8px}
.alert{background:#fef3c7;color:#92400e;padding:12px;border-radius:8px;font-size:.75rem;margin:16px 0;text-align:left}
</style></head>
<body>
<div class="card">
  <div class="check">✓</div>
  <h1>Shopify Connected!</h1>
  <p>Store: <strong>${shop}</strong></p>
  <p>Scopes: <code style="font-size:.65rem">${data.scope || 'N/A'}</code></p>

  <div class="alert">
    <strong>⚠ IMPORTANT — Save this token:</strong><br>
    Copy the access token below and add it as <code>SHOPIFY_ACCESS_TOKEN</code> in your Vercel environment variables.
  </div>

  <div class="token-box">
    <code id="token">${data.access_token}</code>
  </div>
  <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('token').textContent);this.textContent='Copied!'">📋 Copy Token</button>

  <p style="margin-top:20px;font-size:.7rem">
    Go to <a href="https://vercel.com/dashboard" style="color:#111">Vercel Dashboard</a> → Settings → Environment Variables → Add <code>SHOPIFY_ACCESS_TOKEN</code>
  </p>
</div>
</body></html>`);
    } else {
      res.status(400).json({ error: 'Token exchange failed', details: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
