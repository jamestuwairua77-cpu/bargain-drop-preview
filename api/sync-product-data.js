// CJ to Shopify product data sync
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SK = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN || '';
  const CK = process.env.CJ_ACCESS_TOKEN || '';
  const SD = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const SA = 'https://' + SD + '/admin/api/2024-10';
  const CB = 'https://developers.cjdropshipping.com/api2.0/v1';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function sf(path, opts = {}) {
    const r = await fetch(SA + path, {
      ...opts,
      headers: { 'X-Shopify-Access-Token': SK, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t }; }
    return { ok: r.ok, status: r.status, body: b };
  }

  let ct = null;
  async function cjAuth() {
    const r = await fetch(CB + '/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CK }),
    });
    const j = await r.json();
    ct = j?.data?.accessToken;
    if (!ct) throw new Error('CJ auth failed: ' + (j?.message || ''));
    return ct;
  }

  async function cj(path, opts = {}) {
    if (!ct) await cjAuth();
    const url = CB + path;
    // CJ rate limit: 1 req/sec. Retry on 429 with backoff.
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(url, {
        ...opts,
        headers: { 'CJ-Access-Token': ct, 'Content-Type': 'application/json', ...(opts.headers || {}) },
      });
      const j = await r.json();
      if (j?.code === 1600200) {
        // Rate limited — wait and retry
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return j;
    }
    return { result: false };
  }

  if (req.method === 'GET') {
    try { await cjAuth(); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { limit = 30 } = req.body || {};
  const R = { sc: 0, cj: 0, no: 0, w: 0, d: 0, t: 0 };
  const start = Date.now();

  try {
    const lr = await sf('/locations.json');
    const lid = lr.body?.locations?.[0]?.id;
    if (!lid) throw new Error('No location');

    let sid = 0, prods = [];
    while (prods.length < limit) {
      const ps = Math.min(250, limit - prods.length);
      const r = await sf('/products.json?limit=' + ps + '&since_id=' + sid + '&fields=id,title,status,variants,body_html,product_type&status=active');
      const batch = r.body?.products || [];
      if (!batch.length) break;
      sid = batch[batch.length - 1].id;
      for (const p of batch) {
        const body = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
        const nd = !body || body.length < 20;
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
      const sv = vv.find(v => (v.sku || '').trim()) || vv[0];
      const sku = (sv?.sku || '').trim();
      if (!sku) { R.no++; continue; }

      // CJ match by productSku — with 2s gap for rate limiting
      await sleep(2000);
      const cl = await cj('/product/list?pageNum=1&pageSize=1&productSku=' + encodeURIComponent(sku));
      const cp = cl?.data?.list?.[0];
      if (!cp) { R.no++; continue; }
      R.cj++;

      const cw = Number(cp.productWeight) || 500;
      const ct = (cp.categoryName || '').trim();
      const cd = (cp.remark || '').replace(/<[^>]+>/g, '').trim();

      for (const v of vv) {
        if (v.requires_shipping !== false && !v.grams) {
          await sf('/variants/' + v.id + '.json', {
            method: 'PUT', body: JSON.stringify({ variant: { id: v.id, grams: cw, weight: cw / 1000, weight_unit: 'kg' } }),
          }); R.w++; await sleep(250);
        }
      }
      const pud = {};
      const cb = (p.body_html || '').replace(/<[^>]+>/g, '').trim();
      if (cd && (!cb || cb.length < 20)) { pud.body_html = '<p>' + cd + '</p>'; R.d++; }
      if (ct && !(p.product_type || '').trim()) { pud.product_type = ct; R.t++; }
      if (Object.keys(pud).length) {
        await sf('/products/' + p.id + '.json', {
          method: 'PUT', body: JSON.stringify({ product: { id: p.id, ...pud } }),
        }); await sleep(250);
      }
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    res.status(200).json({ success: true, results: R, elapsed_sec: sec });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, results: R });
  }
}
