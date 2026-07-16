// CJ → Shopify product data sync: weight, stock, description, SKU, product type.
// POST { action: "cycle", limit?: N } — fetches N products needing fixes, queries CJ, writes to Shopify.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ─── Inline CJ + Shopify helpers ───
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const CJ_API_KEY = process.env.CJ_ACCESS_TOKEN || '';
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const SHOPIFY_API = `https://${SHOPIFY_DOMAIN}/admin/api/2024-10`;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function sf(path, opts = {}) {
    if (!SHOPIFY_TOKEN) throw new Error('SHOPIFY_ACCESS_TOKEN missing');
    const r = await fetch(SHOPIFY_API + path, {
      ...opts,
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t }; }
    return { ok: r.ok, status: r.status, body: b };
  }

  async function cjAuth() {
    if (!CJ_API_KEY) throw new Error('CJ_ACCESS_TOKEN missing');
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CJ_API_KEY }),
    });
    const j = await r.json();
    const tok = j?.data?.accessToken;
    if (!tok) throw new Error('CJ auth failed: ' + (j?.message || ''));
    return tok;
  }

  let _tok = null;
  async function cj(path, opts = {}) {
    if (!_tok) _tok = await cjAuth();
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1' + path, {
      ...opts,
      headers: { 'CJ-Access-Token': _tok, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return r.json();
  }

  // ─── GET: status check ───
  if (req.method === 'GET') {
    try {
      await cjAuth();
      return res.status(200).json({ configured: true, hint: 'POST { action: "cycle", limit?: 50 }' });
    } catch (e) {
      return res.status(200).json({ configured: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, limit = 50 } = req.body || {};
  const results = { scanned: 0, matched_cj: 0, missing_cj: 0, weight: 0, stock: 0, desc: 0, sku: 0, type: 0, errors: [] };
  const start = Date.now();

  try {
    // Resolve location
    const locR = await sf('/locations.json');
    const locId = locR.body?.locations?.[0]?.id;
    if (!locId) throw new Error('No location');

    // Fetch products needing data — cycle through active products with issues
    let sinceId = 0, products = [];
    while (products.length < limit) {
      const ps = Math.min(250, limit - products.length);
      const r = await sf(`/products.json?limit=${ps}&since_id=${sinceId}&fields=id,title,status,variants,body_html,product_type&status=active`);
      const batch = r.body?.products || [];
      if (!batch.length) break;
      sinceId = batch[batch.length - 1].id;
      for (const p of batch) {
        const body = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
        const needsDesc = !body || body.length < 30;
        const needsType = !(p.product_type || '').trim();
        const vars = p.variants || [];
        const needsSku = vars.some(v => !(v.sku || '').trim());
        const needsWeight = vars.some(v => v.requires_shipping !== false && !v.grams);
        if (needsDesc || needsType || needsSku || needsWeight) {
          products.push(p);
          if (products.length >= limit) break;
        }
      }
    }

    for (const p of products) {
      results.scanned++;
      const variants = p.variants || [];
      const skuVar = variants.find(v => (v.sku || '').trim()) || variants[0];
      const sku = (skuVar?.sku || '').trim();
      if (!sku) { results.missing_cj++; continue; }

      // CJ lookup
      const stk = await cj(`/product/stock/queryByVid?vid=${encodeURIComponent(sku)}`, { method: 'GET' });
      const stkData = stk?.data?[0] || stk?.data;
      if (!stkData) { results.missing_cj++; continue; }
      results.matched_cj++;

      let detail = null;
      if (stkData.pid) {
        const d = await cj(`/product/queryByPid?pid=${encodeURIComponent(stkData.pid)}`, { method: 'GET' });
        detail = d?.data;
      }

      const cjDesc = (detail?.description || detail?.enDescription || '').trim();
      const cjType = (detail?.categoryName || detail?.productType || '').trim();
      const cjWeight = detail?.weight || stkData?.weight || 500;

      // Update variants: weight, SKU, stock
      for (const v of variants) {
        // Weight
        if (v.requires_shipping !== false && !v.grams) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, grams: Number(cjWeight), weight: Number(cjWeight) / 1000, weight_unit: 'kg' } }),
          });
          results.weight++;
          await sleep(150);
        }
        // SKU
        if (!(v.sku || '').trim() && stkData.vid) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, sku: String(stkData.vid) } }),
          });
          results.sku++;
          await sleep(150);
        }
        // Stock
        if (v.inventory_item_id && stkData.stockNum != null) {
          const qty = Math.max(0, Math.min(9999, Number(stkData.stockNum)));
          await sf('/inventory_levels/set.json', {
            method: 'POST', body: JSON.stringify({ location_id: locId, inventory_item_id: v.inventory_item_id, available: qty }),
          });
          results.stock++;
          await sleep(250);
        }
      }

      // Product-level: description, product_type
      if (cjDesc && !(p.body_html || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, body_html: `<p>${cjDesc}</p>` } }),
        });
        results.desc++;
        await sleep(150);
      }
      if (cjType && !(p.product_type || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, product_type: cjType } }),
        });
        results.type++;
        await sleep(150);
      }

      await sleep(50);
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    return res.status(200).json({ success: true, results, elapsed_sec: sec });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message, results });
  }
}
