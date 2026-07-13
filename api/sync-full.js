// Direct Shopify → GitHub sync script
// Token is injected via Vercel env SHOPIFY_TOKEN (plaintext) or falls back

let SHOPIFY_TOKEN = '';
let SHOPIFY_DOMAIN = 'bargain-drop-8194.myshopify.com';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'jamestuwairua77-cpu/bargain-drop-preview';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || req.body?.action || 'sync';
  const t = req.query?.token || req.body?.token || '';
  
  // Allow token to be passed in request or from env
  if (t) SHOPIFY_TOKEN = t;
  else if (process.env.SHOPIFY_TOKEN) SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  
  if (action === 'status') {
    if (!SHOPIFY_TOKEN) return res.json({ success: false, error: 'No SHOPIFY_TOKEN configured. Pass ?token=... or set Vercel env.' });
    try {
      const resp = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products/count.json`, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      const data = await resp.json();
      return res.json({ success: true, shopify_count: data.count });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }
  
  if (!SHOPIFY_TOKEN) return res.json({ success: false, error: 'No SHOPIFY_TOKEN configured' });
  
  const page = parseInt(req.query?.page || req.body?.page || '1');
  
  try {
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products.json?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,images,image,status&page=${page}`;
    const resp = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } });
    
    if (!resp.ok) return res.json({ success: false, error: `Shopify ${resp.status}`, page });
    
    const data = await resp.json();
    const products = (data.products || []).filter(p => p.title && !p.title.startsWith('$p'));
    
    // Just return the products - let the caller handle saving
    // For now just report what we got
    return res.json({ 
      success: true, 
      page, 
      total_products: products.length,
      products: products.slice(0, 3).map(p => ({ id: p.id, title: p.title, image: p.image?.src || null, price: p.variants?.[0]?.price })),
      note: 'Full sync requires calling all pages. Use page=N parameter.'
    });
    
  } catch(e) {
    return res.json({ success: false, error: e.message, page });
  }
}
