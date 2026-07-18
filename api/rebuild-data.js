// GET /api/rebuild-data : {@action: status | sync}
// One-shot data rebuild: pulls All products from Shopify, writes JSON files to GitHub

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TK = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';
  const GHTOKEN = process.env.GITHUB_TOKEN || '';
  const SDOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const REPO = 'jamestwuairua77-cpu/bargain-drop-preview';
  const API = `https://${SDOMAIN}/admin/api/2025-10`;
  const GHAPI = `https://api.github.com/repos/${REPO}`;

  if (!TK || !GHTOKEN) return res.json({ ok: false, error: 'Missing env variables' });

  const action = req.query?.action || 'status';
  if (action === 'status') {
    try {
      const r = await fetch(API + '/products/count.json', { headers: {'X-Shopify-Access-Token': TK} });
      const d = await r.json();
      return res.json({ ok: true, count: d.count });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }
  if (action !== 'sync') return res.status(400).json({ error: 'Use ?action=status|sync' });

  // BUILD DATA
  const start = Date.now();
  try {
    // 1. Pull all Shopify products
    let prods = [], since_id = 0;
    while (true) {
      const r = await fetch(`${API]/products.json?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,images,image,status&since_id=${since_id}`, {
        headers: { 'X-Shopify-Access-Token': TK },
      });
      if (!r.ok) break;
      const d = await r.json();
      const batch = (d.products || []).filter(p => p.status === 'active' && p.title);
      if (batch.length === 0) break;
      prods.push(...batch);
      since_id = batch[batch.length - 1].id;
      if (batch.length < 250) break;
      await new Promise(r => setTimeout(r, 500));
    }

    // 2. Build JSON structures
    const cats = {}, all = [], idx = {};
    for (const p of prods) {
      const imgs = [];
      if (p.image?.src) imgs.push(p.image.src);
      if (Array.isArray(p.images))
        for (const i of p.images)
          if (i.src && !imgs.includes(i.src)) imgs.push(i.src);

      const price = Number(p.variants?.[0]?.price || 0);
      const comp = Number(p.variants?.[0]?.compare_at_price || 0);
      const vars = (p.variants || []).map(v => ({
        option1: v.option1, option2: v.option2, option3: v.option3,
        price: Number(v.price || 0), sku: v.sku,
        available: (v.inventory_quantity || 0) > 0,
      }));

      all.push({
        id: String(p.id), title: p.title, price,
        compare_at_price: comp > price ? comp : undefined,
        image: imgs[0] || null, images: imgs,
        body_html: p.body_html || '', vendor: p.vendor,
        product_type: p.product_type, tags: p.tags,
        variants: vars,
      });

      const ptype = p.product_type || 'other';
      const key = ptype.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-').replace(/[",']/g, '');
      if (!cats[key]) cats[key] = { name: ptype, products: [] };
      cats[key].products.push({
        id: String(p.id), title: p.title, price,
        image: imgs[0] || null,
        body_html: p.body_html || '',
        vendor: p.vendor,
        product_type: p.product_type,
        variants: vars.length, images: imgs.length,
      });
      idx[String(p.id)] = { idx: cats[key].products.length - 1, category: key };
    }

    // 3. Push to GitHub
    const headers = { 'Authorization': `Bearer ${GHTOKEN}`, 'Content-Type': 'application/json' };

    async function putFile(path, content, cmsg) {
      let sha = null;
      try {
        const ra = await fetch(`${GHAPI}/contents/${path}`, { headers });
        if (ra.ok) { const jd = await ra.json(); sha = jd.sha; }
      } catch {}

      const body = { message: cmsg, content: Buffer.from(content).toString('base64'), branch: 'main' };
      if (sha) body.sha = sha;
      const wb = await fetch(`${GHAPI}/contents/${path}`, { 
        method: 'PUT', body: JSON.stringify(body), headers 
      });
      if (!wb.ok) { const err = await wb.text(); throw new Error(`GH put ${path}: ${wb.status} ${err.slice(0,100)}`); }
      return await wb.json();
    }

    let errors = [], written = 0;
    for (const [path, data, name] of [
      ['categories-data.json', JSON.stringify(cats), 'categories'],
      ['all-products.json', JSON.stringify(all), 'all-products'],
      ['products-index.json', JSON.stringify(idx), 'index'],
    ]) {
      try { await putFile(path, data, `data: rebuild ${name} from Shopify`); written++; }
      catch (e) { errors.push({ file: path, error: e.message }); }
    }

    const desc = all.filter(p => p.body_html && p.body_html.length > 20).length;
    return res.json({
      ok: true, products: all.length, categories: Object.keys(cats).length,
      with_descriptions: desc, files_written: written,
      errors: errors.length ? errors : undefined,
      elapsed_sec: ((Date.now() - start) / 1000).toFixed(1),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
