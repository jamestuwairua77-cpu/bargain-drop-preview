// Full Shopify → Json data rebuild
// GET /api/sync-full?action=status | sync
// Sync: Pulls all products with full details, writes JSON data files to GitHub

const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';
const SD = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
const GHTOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'jamestuwairua77-cpu/bargain-drop-preview';
const API = 'https://' + SD + '/admin/api/2025-10';
const GHAPI = 'https://api.github.com/repos/' + REPO;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sFetch(path) {
  const r = await fetch(API + path, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
  });
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, body: JSON.parse(t) }; } catch { return { ok: false, status: r.status, body: { raw: t } }; }
}

async function ghRead(path) {
  const r = await fetch(GHAPI + '/contents/' + path, {
    headers: { 'Authorization': 'Bearer ' + GHTOKEN, 'Accept': 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return { sha: d.sha, path: d.path };
}

async function ghWrite(path, content, msg, existingSha) {
  const body = {
    message: msg,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: 'main',
  };
  if (existingSha) body.sha = existingSha;
  const r = await fetch(GHAPI + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + GHTOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const d = await r.text(); throw new Error('GH write ' + r.status + ': ' + d.slice(0,200)); }
  return await r.json();
}

function getImages(prod) {
  const out = [];
  if (prod.image && prod.image.src) out.push(prod.image.src);
  else if (typeof prod.image === 'string') out.push(prod.image);
  if (Array.isArray(prod.images)) {
    for (const img of prod.images) {
      if (img.src && !out.includes(img.src)) out.push(img.src);
      else if (typeof img === 'string' && !out.includes(img)) out.push(img);
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || 'status';

  if (!TOKEN) return res.status(400).json({ ok: false, error: 'Shopify token not configured' });

  if (action === 'status') {
    try {
      const r = await sFetch('/products/count.json');
      return res.json({ ok: true, count: r.body.count });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (action !== 'sync') return res.status(400).json({ error: 'Add ?action=status || sync' });

  if (!GHTOKEN) return res.status(400).json({ ok: false, error: 'GITHUB_TOKEN not set' });

  const start = Date.now();
  try {
    let prods = [], since_id = 0;

    while (true) {
      const r = await sFetch('/products.json?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,images,image,status&since_id=' + since_id);
      if (!r.ok) break;
      const batch = (r.body.products || []).filter(p => p.status === 'active' && p.title);
      if (batch.length === 0) break;
      prods.push(...batch);
      since_id = batch[batch.length - 1].id;
      if (batch.length < 250) break;
      await sleep(500);
    }

    if (!prods.length) return res.json({ ok: false, error: 'No active products' });

    const cats = {}, idx = {}, all = [];

    for (const p of prods) {
      const imgs = getImages(p);
      const price = Number(p.variants?.[0]?.price || 0);
      const comp = Number(p.variants?.[0]?.compare_at_price || 0);
      const vars = (p.variants || []).map(v => ({
        option1: v.option1, option2: v.option2, option3: v.option3,
        price: Number(v.price || 0), sku: v.sku,
        available: v.inventory_quantity > 0,
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
      const key = ptype.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-').replace(/["',]/g, '');
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

    const withDesc = all.filter(p => p.body_html && p.body_html.length > 20).length;
    const withImg = all.filter(p => p.image).length;

    const files = [
      { path: 'categories-data.json', data: JSON.stringify(cats, null, 2), msg: 'data: rebuild from Shopify full sync' },
      { path: 'all-products.json', data: JSON.stringify(all, null, 2), msg: 'data: rebuild from Shopify full sync' },
      { path: 'products-index.json', data: JSON.stringify(idx, null, 2), msg: 'data: rebuild from Shopify full sync' },
    ];

    let written = 0, err = [];
    for (const f of files) {
      try {
        const e = await ghRead(f.path);
        await ghWrite(f.path, f.data, f.msg, e?.sha);
        written++;
        await sleep(1500);
      } catch (e) { err.push({ file: f.path, error: e.message }); }
    }

    const sec = ((Date.now() - start) / 1000).toFixed(1);
    return res.json({
      ok: true,
      shopify_total: prods.length, unique: all.length,
      with_descriptions: withDesc, with_images: withImg,
      categories: Object.keys(cats).length,
      files_written: written,
      errors: err.length ? err : undefined,
      elapsed_sec: sec,
      note: 'JSON data files rebuilt with descriptions. Vercel auto-deploys.',
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
