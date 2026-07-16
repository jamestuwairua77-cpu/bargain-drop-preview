// CJ → Shopify product data sync: stock, weight, description, SKU, type.
// Uses CJ product/list?productSku= for matching (NOT queryByVid — different ID space).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN || '';
  const CJKEY = process.env.CJ_ACCESS_TOKEN || '';
  const API = `https://${DOMAIN}/admin/api/2024-10`;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function sf(path, opts = {}) {
    if (!TOKEN) throw new Error('SHOPIFY_ACCESS_TOKEN missing');
    const r = await fetch(API + path, {
      ...opts,
      headers: {'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {})}
    });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t }; }
    return { ok: r.ok, status: r.status, body: b };
  }

  let _tok = null;
  async function cjAuth() {
    if (!CJKEY) throw new Error('CJ_ACCESS_TOKEN missing');
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CJKEY }),
    });
    const j = await r.json();
    const tok = j?.data?.accessToken;
    if (!tok) throw new Error('CJ auth failed: ' + (j?.message || ''));
    _tok = tok; return tok;
  }

  async function cj(path, opts = {}) {
    if (!_tok) await cjAuth();
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1' + path, {
      ...opts,
      headers: { 'CJ-Access-Token': _tok, 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    return r.json();
  }

  if (req.method === 'GET') {
    try { await cjAuth(); return res.status(200).json({ configured: true, hint: 'POST { action: "cycle", limit?: 50 }' }); }
    catch (e) { return res.status(200).json({ configured: false, error: e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, limit = 50 } = req.body || {};
  const R = { sc: 0, ok: 0, noCJ: 0, w: 0, s: 0, d: 0, sk: 0, t: 0, err: [] };
  const start = Date.now();

  try {
    const lr = await sf('/locations.json');
    const locId = lr.body?.locations?.[0]?.id;
    if (!locId) throw new Error('No location');

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
        if (nd || nt || ns || nw) { prods.push(p); if (prods.length >= limit) break; }
      }
    }

    for (const p of prods) {
      R.sc++;
      const vv = p.variants || [];
      const skuV = vv.find(v => (v.sku || '').trim()) || vv[0];
      const sku = (skuV?.sku || '').trim();
      if (!sku) { R.noCJ++; continue; }

      // CJ lookup ─ use productSku search (recognizes Shopify SKU format)
      await sleep(1000);
      const cjList = await cj(`/product/list?pageNum=1&pageSize=1&productSku=${encodeURIComponent(sku)}`);
      const cjProd = cjList?.data?.list?.[0];
      if (!cjProd) { R.noCJ++; continue; }
      R.ok++;

      const cjW = Number(cjProd.productWeight) || 500;
      const cjT = (cjProd.categoryName || '').trim();
      const cjD = (cjProd.remark || '').replace(/<[^>]+>/g, '').trim();

      // Stock via variant
      let cjStock = null;
      await sleep(500);
      if (cjProd.pid) {
        try {
          const sr = await cj(`/product/stock/queryByVid?vid=${encodeURIComponent(cjProd.pid)}`);
          cjStock = sr?.data?[0] || sr?.data || null;
        } catch(e) {}
      }

      for (const v of vv) {
        if (v.requires_shipping !== false && !v.grams) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, grams: cjW, weight: cjW / 1000, weight_unit: 'kg' } }),
          }); R.w++; await sleep(150);
        }
        if (!(v.sku || '').trim() && cjProd.productSku) {
          await sf(`/variants/${v.id}.json`, {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, sku: cjProd.productSku } }),
          }); R.sk++; await sleep(150);
        }
        if (v.inventory_item_id && cjStock?.stockNum != null) {
          await sf('/inventory_levels/set.json', {
            method: 'POST', body: JSON.stringify({ location_id: locId, inventory_item_id: v.inventory_item_id, available: Math.max(0, Math.min(9999, Number(cjStock.stockNum))) }),
          }); R.s++; await sleep(250);
        }
      }

      if (cjD && !(p.body_html || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, body_html: `<p>${cjD}</p>` } }),
        }); R.d++; await sleep(150);
      }
      if (cjT && !(p.product_type || '').trim()) {
        await sf(`/products/${p.id}.json`, {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, product_type: cjT } }),
        }); R.t++; await sleep(150);
      }
      await sleep(500);
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    res.status(200).json({ success: true, results: R, elapsed_sec: sec });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, results: R });
  }
}
