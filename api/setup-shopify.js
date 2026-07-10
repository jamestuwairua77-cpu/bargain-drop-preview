// Shopify Setup & Configuration Helper
export default async function handler(req, res) {
  const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '9ab0d272cfd0e8d378145a7eee7634ee';
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const CJ_TOKEN = process.env.CJ_ACCESS_TOKEN || '';

  const REDIRECT_URI = `https://bargain-drop.online/api/oauth/callback`;
  const SCOPES = 'read_products,write_products,read_orders,write_orders,read_fulfillments,write_fulfillments,read_customers,write_customers';

  if (req.method === 'GET') {
    const oauthUrl = `https://${SHOPIFY_DOMAIN}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Bargain Drop — Shopify Setup</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f9fafb;color:#111;padding:20px;max-width:600px;margin:0 auto}
.card{background:#fff;border-radius:14px;padding:24px;margin:16px 0;border:1px solid #e5e7eb}
h1{font-size:1.2rem;margin-bottom:8px}
h2{font-size:1rem;margin-bottom:12px;color:#374151}
.status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:600}
.status.ok{background:#ecfdf5;color:#059669}
.status.no{background:#fef3c7;color:#d97706}
.btn{display:inline-block;padding:12px 24px;border-radius:10px;font-size:.85rem;font-weight:700;text-decoration:none;cursor:pointer;border:none}
.btn-dark{background:#111;color:#fff}
.btn-outline{background:#fff;color:#111;border:1.5px solid #d1d5db}
pre{background:#f3f4f6;padding:12px;border-radius:8px;font-size:.7rem;overflow-x:auto;margin:8px 0}
code{font-family:monospace;font-size:.75rem}
.step{display:flex;gap:12px;margin:12px 0;align-items:flex-start}
.step-num{background:#111;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0}
.step-text{font-size:.8rem;line-height:1.5}
</style></head>
<body>
  <h1>🔧 Shopify + CJ Sync Setup</h1>

  <div class="card">
    <h2>CJ Dropshipping</h2>
    <span class="status ${CJ_TOKEN ? 'ok' : 'no'}">${CJ_TOKEN ? '✅ Connected' : '⚠ Not connected'}</span>
    ${CJ_TOKEN ? '<p style="margin-top:8px;font-size:.75rem;color:#777">CJ_ACCESS_TOKEN is set in Vercel environment variables.</p>'
    : '<p style="margin-top:8px;font-size:.75rem;color:#d97706">Add CJ_ACCESS_TOKEN to Vercel environment variables.</p>'}
  </div>

  <div class="card">
    <h2>Shopify</h2>
    <span class="status ${SHOPIFY_TOKEN ? 'ok' : 'no'}">${SHOPIFY_TOKEN ? '✅ Connected' : '⚠ Not connected'}</span>
    <p style="margin-top:8px;font-size:.75rem;color:#777">Store: <code>${SHOPIFY_DOMAIN}</code></p>

    ${!SHOPIFY_TOKEN ? `
    <div style="margin-top:16px">
      <div class="step"><div class="step-num">1</div><div class="step-text"><strong>Click Connect</strong> below to authorize Bargain Drop to access your Shopify store.</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Shopify will ask you to approve permissions (products, orders, fulfillments, customers).</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">After approval, you'll be redirected back and the access token will be saved.</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text"><strong>Copy the token shown on the success page</strong> and add it as <code>SHOPIFY_ACCESS_TOKEN</code> in Vercel environment variables.</div></div>
      <a href="${oauthUrl}" class="btn btn-dark" style="margin-top:12px">🔗 Connect Shopify Store</a>
    </div>
    ` : '<p style="margin-top:8px;font-size:.75rem;color:#059669">SHOPIFY_ACCESS_TOKEN is configured. Shopify orders and products will sync automatically.</p>'}
  </div>

  <div class="card">
    <h2>Environment Variables in Vercel</h2>
    <pre>STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
CJ_ACCESS_TOKEN=your_cj_api_key
SHOPIFY_CLIENT_ID=9ab0d272cfd0e8d378145a7eee7634ee
SHOPIFY_CLIENT_SECRET=your_shopify_secret
SHOPIFY_ACCESS_TOKEN=${SHOPIFY_TOKEN ? SHOPIFY_TOKEN.substring(0,12)+'...' : 'NOT SET — run OAuth above'}
SHOPIFY_DOMAIN=${SHOPIFY_DOMAIN}
SENDGRID_API_KEY=SG....
GPAY_PRIVATE_KEY=your_gpay_key</pre>
    <p style="font-size:.7rem;color:#777;margin-top:8px">Set these at <a href="https://vercel.com/dashboard" style="color:#111">vercel.com/dashboard</a> → Settings → Environment Variables</p>
  </div>

  <div class="card">
    <h2>API Endpoints</h2>
    <pre>POST /api/shopify-order   — Sync order to Shopify + CJ
POST /api/cj-webhook      — CJ tracking → Shopify fulfillment
POST /api/sync-products   — CJ products → Shopify catalog
GET  /api/setup-shopify   — This page
GET  /api/oauth/callback  — OAuth callback handler</pre>
  </div>

  <p style="text-align:center;font-size:.7rem;color:#999;margin:20px 0">Bargain Drop Sync System v1.0</p>
</body></html>`);
  }
}
