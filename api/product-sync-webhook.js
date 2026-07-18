// Handles Shopify product webhooks (products/create, products/update).
// When a product is created or updated, rebuilds the all-products.json data file
// and the categories-index.json so the new product appears on the site immediately.

import { cors, shopifyFetch, SHOPIFY_TOKEN } from './_sync-lib.js';
import crypto from 'crypto';

const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'jamestuwairua77-cpu/bargain-drop-preview';
const GHAPI = 'https://api.github.com/repos/' + REPO;

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function verifyHmac(raw, header, secret) {
  if (!secret || !header) return true;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header)); } catch { return false; }
}

// Read a file from GitHub
async function ghRead(path) {
  const r = await fetch(GHAPI + '/contents/' + path, {
    headers: { 'Authorization': 'Bearer ' + GH_TOKEN, 'Accept': 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  return await r.json();
}

// Write a file to GitHub
async function ghWrite(path, content, msg, existingSha) {
  const body = {
    message: msg,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: 'main',
  };
  if (existingSha) body.sha = existingSha;
  const r = await fetch(GHAPI + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + GH_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.text();
    throw new Error('GH write ' + r.status + ': ' + d.slice(0, 200));
  }
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

async function rebuildAllProducts() {
  // Step 1: Pull ALL products from Shopify
  let prods = [], since_id = 0;
  while (true) {
    const { body: shopBody } = await shopifyFetch(
      '/products.json?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,images,image,status&since_id=' + since_id
    );
    const batch = (shopBody.products || []).filter(p => p.status === 'active' && p.title);
    if (batch.length === 0) break;
    prods.push(...batch);
    since_id = batch[batch.length - 1].id;
    if (batch.length < 250) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!prods.length) throw new Error('No active products');

  // Step 2: Build JSON structures
  const cats = {}, all = [], idx = {};
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

  // Step 3: Write to GitHub
  const files = [
    { path: 'data/all-products.json', data: JSON.stringify(all, null, 2), msg: 'auto: rebuild from product webhook' },
    { path: 'data/categories-data.json', data: JSON.stringify(cats, null, 2), msg: 'auto: rebuild from product webhook' },
    { path: 'data/categories-index.json', data: JSON.stringify(idx, null, 2), msg: 'auto: rebuild from product webhook' },
  ];

  const results = [];
  for (const f of files) {
    const existing = await ghRead(f.path);
    const r = await ghWrite(f.path, f.data, f.msg, existing?.sha);
    results.push({ file: f.path, sha: r?.commit?.sha || r?.content?.sha });
  }

  return {
    total_products: all.length,
    with_descriptions: all.filter(p => p.body_html && p.body_html.length > 20).length,
    categories: Object.keys(cats).length,
    files: results,
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = await readRaw(req);
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const topic = req.headers['x-shopify-topic'] || 'unknown';
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || '';

  if (!verifyHmac(raw, hmac, secret)) {
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  let payload;
  try { payload = JSON.parse(raw.toString('utf-8')); } catch {
    return res.status(400).json({ error: 'Bad JSON' });
  }

  // Handle products/create and products/update
  if (topic === 'products/create' || topic === 'products/update') {
    try {
      const result = await rebuildAllProducts();
      return res.status(200).json({
        success: true,
        event: topic,
        product_title: payload.title,
        product_id: payload.id,
        ...result,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // Handle products/delete
  if (topic === 'products/delete') {
    try {
      const result = await rebuildAllProducts();
      return res.status(200).json({
        success: true,
        event: topic,
        product_id: payload.id,
        ...result,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(200).json({ success: true, ignored: topic });
}
