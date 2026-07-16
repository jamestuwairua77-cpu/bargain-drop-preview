// Full CJ → Shopify product data sync: stock, weight, description, SKU, product type.
// NO EXTERNAL IMPORTS - fully self-contained for Vercel.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- CONFIG ---
  const DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN || '';
  const CJKEY = process.env.CJ_ACCESS_TOKEN || '';
  const API = `https://${DOMAIN}/admin/api/2024-10`;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // --- SHOPIFY FETCH ---
  async function sf(path, opts = {}) {
    if (!TOKEN) throw new Error('SHOPIFY_ACCESS_TOKEN missing');
    const r = await fetch(API + path, {
      ...opts,
      headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {})},
    });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t }; }
    return { ok: r.ok, status: r.status, body: b };
  }

  // --- CJ AUTH ---
  let _tok = null;
  async function cjAuth() {
    if (!CJKEY) throw new Error('CJ_ACCESS_TOKEN missing');
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CJKEY }),
    });
    const j = await r.json();
    const tok = j?.data?.accessToken;
    if (!tok) throw new Error('CJ auth failed: ' + (j?.message || ''));
    _tok = tok;
    return tok;
  }

  // --- CJ FETCH ---
  async function cj(path, opts = {}) {
    if (!_tok) await cjAuth();
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1' + path, {
      ...opts,
      headers: { 'CJ-Access-Token': _tok, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return r.json();
  }

  // --- GET ---
  if (req.method === 'GET') {
    try {
      await cjAuth();
      return res.status(200).json({ configured: true, hint: 'POST { action: "cycle", limit?: 50 }' });
    } catch (e) {
      return res.status(200).json({ configured: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // --- POST ---
  const { action, limit = 50 } = req.body || {};
  const R = { sc: 0, ok: 0, noCJ: 0, w: 0, s: 0, d: 0, sk: 0, t: 0, err: [] };
  const start = Date.now();

  try {
    // Location
    const lr = await sf('/locations.json');
    const locId = lr.body?.locations?.[0]?.id;
    if (!locId) throw new Error('No location');

    // Fetch products needing data
    let sid = 0, prods = [];
    while (prods.length < limit) {
      const ps = Math.min(250, limit - prods.length);
      const r = await sf(`/products.json?limit=${ps}&since_id=${sid}&fields=id,title,status,variants,body_html,product_type&status=active`);
      const batch = r.body?.products || [];
      if (!batch.length) break;
      sid = batch[batch.length - 1].id;
      for (const p of batch) {
        const body = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
        const nd = !body || body.length < 30;
        const nt = !(p.product_type || '').trim();
        const vv = p.variants || [];
        const ns = vv.some(v => !(v.sku || '').trim());
        const nw = vv.some(v => v.requires_shipping !== false && !v.grams);
        if (nd || nt || ns || nw) {
          prods.push(p);
          if (prods.length >= limit) break;
        }
      }
    }

    for (const p of prods) {
      R.sc++;
      const vv = p.variants || [];
      const skuV = vv.find(v => (v.sku || '').trim()) || vv[0];
      const sku = (skuV?.sku || '').trim();
      if (!sku) { R.noCJ++; continue; }

      // CJ lookup
      const stk = await cj(`/product/stock/queryByVid?vid=${encodeURIComponent(sku)}`, { method: 'GET' });
      const stkD = stk?.data?.[0] || stk?.data;
      if (!stkD) { R.noCJ++; continue; }
      R.ok++;

      let det = null;
      if (stkD.pid) {
        const d = await cj(`/product/queryByPid?pid=${encodeURIComponent(stkD.pid)}`, { method: 'GET' });
        det = d?.data;
      }

      const cjD = (det?.description || det?.enDescription || '').trim();
      const cjT = (det?.categoryName || det?.productType || '').trim();
      const cjW = det?.weight || stkD?.weight || 500;

      // Variant updates
      for (const v of vv) {
        // Stock
        if (v.inventory_item_id && stkD.stockNum != null) {
          await sf('/inventory_levels/set.json', {
            method: 'POST',
            body: JSON.stringify({ location_id: locId, inventory_item_id: v.inventory_item_id, available: Math.max(0, Math.min(9999, Number(stkD.stockNum))) }),
          });
          R.s++;
          await sleep(200);
        }
        // Weight
        if (v.requires_shipping !== false && !v.grams) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, grams: Number(cjW), weight: Number(cjW) / 1000, weight_unit: 'kg' } }),
          });
          R.w++;
          await sleep(150);
        }
        // SKU
        if (!(v.sku || '').trim() && stkD.vid) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, sku: String(stkD.vid) } }),
          });
          R.sk++;
          await sleep(150);
        }
      }

      // Product level
      if (cjD && !(p.body_html || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, body_html: `<p>${cjD}</p>` } }),
        });
        R.d++;
        await sleep(150);
      }
      if (cjT && !(p.product_type || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, product_type: cjT } }),
        });
        R.t++;
        await sleep(150);
      }

      await sleep(80);
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    res.status(200).json({ success: true, results: R, elapsed_sec: sec });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, results: R });
  }
}
