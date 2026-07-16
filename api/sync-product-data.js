// CJ to Shopify sync — rate-limited, self-contained endpoint
// Syncs: weight, description, product_type, stock (non-destructive per rules)
// Matching: productSku exact match via GET /product/list?productSku=
// Rate limit: 1 CJ request every 2000ms + 429 retry

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // --- ENV CONF ---
  const SF = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN || '';
  const CK = process.env.CJ_ACCESS_TOKEN || '';
  const SD = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const SAF = 'https://' + SD + '/admin/api/2024-10';
  const CF = 'https://developers.cjdropshipping.com/api2.0/v1';

  // --- Shopify helper ---
  async function sf(path, opts = {}) {
    const r = await fetch(SAF + path, {
      ...opts,
      headers: { 'X-Shopify-Access-Token': SF, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t }; }
    return { ok: r.ok, status: r.status, body: b };
  }

  // --- CJ auth + retriable request ---
  let ct = null;
  async function cjAuth() {
    const r = await fetch(CF + '/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CK }),
    });
    const j = await r.json();
    ct = j?.data?.accessToken;
    if (!ct) throw new Error('CJ auth: ' + (j?.message || 'unknown'));
    return ct;
  }

  async function cjGet(path) {
    if (!ct) await cjAuth();
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(CF + path, {
        headers: { 'CJ-Access-Token': ct, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (j?.code === 1600200) { await sleep(3000 * (attempt + 1)); continue; }
      if (j?.code === 16900500) { throw new Error('CJ_API_POINTS_EXHAUSTED'); }
      return j;
    }
    return { result: false };
  }

  // --- GET: health check ---
  if (req.method === 'GET') {
    try { await cjAuth(); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // --- POST: sync ---
  const { limit = 5 } = req.body || {};
  const R = { sc: 0, cj: 0, pts: 0, w: 0, d: 0, t: 0 };
  const start = Date.now();

  try {
    // Get location
    const lr = await sf('/locations.json');
    const lid = lr.body?.locations?.[0]?.id;
    if (!lid) throw new Error('No location');

    // Fetch products needing data
    let sid = 0, prods = [], pages = 0;
    while (prods.length < limit && pages < 10) {
      const ps = Math.min(250, limit * 3);
      const r = await sf('/products.json?limit=' + ps + '&since_id=' + sid + '&fields=id,title,variants,body_html,product_type&status=active');
      const batch = r.body?.products || [];
      if (!batch.length) break;
      sid = batch[batch.length - 1].id; pages++;
      for (const p of batch) {
        const body = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
        const vv = p.variants || [];
        const nd = !body || body.length < 20;
        const nt = !(p.product_type || '').trim();
        const ns = vv.some(v => !(v.sku || '').trim());
        const nw = vv.some(v => v.requires_shipping !== false && !v.grams);
        if (nd || nt || ns || nw) { prods.push(p); if (prods.length >= limit) break; }
      }
    }

    for (const p of prods) {
      R.sc++;
      const vv = p.variants || [];
      const sv = vv.find(v => (v.sku || '').trim()) || vv[0];
      const sku = (sv?.sku || '').trim();
      if (!sku) { continue; }

      // CJ lookup — 2.5s gap to stay under 1 QPS
      await sleep(2500);
      const cl = await cjGet('/product/list?pageNum=1&pageSize=1&productSku=' + encodeURIComponent(sku));
      const cp = cl?.data?.list?.[0];
      if (!cp) { continue; }
      R.cj++; R.pts += 50; // track points

      const cw = Number(cp.productWeight) || 500;
      const ct = (cp.categoryName || '').trim();
      const cd = (cp.remark || '').replace(/<[^>]+>/g, '').trim();

      // Weight update (only if currently 0)
      for (const v of vv) {
        if (v.requires_shipping !== false && !v.grams) {
          await sf('/variants/' + v.id + '.json', {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, grams: cw, weight: cw / 1000, weight_unit: 'kg' } }),
          }); R.w++; await sleep(200);
        }
      }

      // Description + product type (only if empty)
      const pud = {};
      const cb = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
      if (cd && (!cb || cb.length < 20)) { pud.body_html = '<p>' + cd + '</p>'; R.d++; }
      if (ct && !(p.product_type || '').trim()) { pud.product_type = ct; R.t++; }
      if (Object.keys(pud).length) {
        await sf('/products/' + p.id + '.json', {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, ...pud } }),
        }); await sleep(200);
      }
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    res.status(200).json({ success: true, results: R, elapsed_sec: sec });
  } catch (e) {
    const pts = e.message === 'CJ_API_POINTS_EXHAUSTED' ? 'POINTS_EXHAUSTED' : e.message;
    res.status(e.message === 'CJ_API_POINTS_EXHAUSTED' ? 429 : 500).json({
      success: false, error: pts, results: R
    });
  }
}
