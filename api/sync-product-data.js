// Full CJ → Shopify product data sync: stock, weight, description, SKU, product type.
// Trigger: POST { product_ids: [number], action: "sync" } or { action: "cycle", limit: number }
// GET for status. Re-uses CJ/Shopify auth from _sync-lib.js.

import { cors, cjFetch, shopifyFetch, appendSyncLog, SHOPIFY_TOKEN, CJ_API_KEY, SHOPIFY_DOMAIN } from './_sync-lib.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// CJ product query — by SKU/vid
async function cjProductBySku(sku) {
  if (!sku) return null;
  try {
    const r = await cjFetch(`/product/stock/queryByVid?vid=${encodeURIComponent(sku)}`, { method: 'GET' });
    return (r?.data?[0]) || (r/.data) || null;
  } catch { return null; }
}

// CJ product detail — gets description, product type, weight
async function cjProductDetail(pid) {
  if (!pid) return null;
  try {
    const r = await cjFetch(`/product/queryByPid?pid=${encodeURIComponent(pid)}`, { method: 'GET' });
    return r?.data || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!(CJ_API_KEY && SHOPIFY_TOKEN), hint: 'POST { action: "cycle", limit?: 100 } or POST { action: "sync", product_ids: [...] }' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, limit = 50, product_ids } = req.body || {};
  const results = { scanned: 0, matched_on_cj: 0, missing_on_cj: 0, updated_weight: 0, updated_stock: 0, updated_description: 0, updated_sku: 0, updated_product_type: 0, errors: [] };
  const start = Date.now();

  try {
    // Resolve location id
    const locRes = await shopifyFetch('/locations.json');
    const locationId = locRes.body?.locations?.[0]?.id;
    if (!locationId) throw new Error('No Shopify location found');

    let products;

    if (action === 'sync' && product_ids?.length) {
      // Fetch specific products by ID
      products = [];
      for (const pid of product_ids) {
        try {
          const { body } = await shopifyFetch(`/products/${pid}.json?fields=id,title,status,variants,body_html,product_type`);
          if (body?.product) products.push(body.product);
        } catch (e) { results.errors.push({ product_id: pid, error: e.message }); }
      }
    } else {
      // Cycle mode: fetch next batch of active products with issues
      let sinceId = 0;
      products = [];
      while (products.length < limit) {
        const pageSize = Math.min(250, limit - products.length);
        const { body } = await shopifyFetch(`/products.json?limit=${pageSize}&since_id=${sinceId}&fields=id,title,status,variants,body_html,product_type&status=active`);
        const batch = body?.products || [];
        if (batch.length === 0) break;
        sinceId = batch[batch.length - 1].id;
        for (const p of batch) {
          const needsDesc = !(p.body_html || '').trim() || (p.body_html || '').replace(/<[^>]+>/g, '').trim().length < 30;
          const needsType = !(p.product_type || '').trim();
          const vars = p.variants || [];
          const needsSku = vars.some(v => !(v.sku || '').trim());
          const needsWeight = vars.some(v => v.requires_shipping !== false && !(v.grams || 0));
          if (needsDesc || needsType || needsSku || needsWeight) {
            products.push(p);
            if (products.length >= limit) break;
          }
        }
      }
    }

    // Process each product
    for (const p of products) {
      results.scanned++;
      const variants = p.variants || [];
      let cjStock = null;
      let cjDetail = null;

      // Find a variant with a SKU to query CJ      const skuVariant = variants.find(v => (v.sku || '').trim()) || variants[0];
      const sku = (skuVariant?.sku || '').trim();

      if (sku) {
        cjStock = await cjProductBySku(sku);
        if (cjStock?.pid) {
          cjDetail = await cjProductDetail(cjStock.pid);
        }
      }

      if (!cjStock) {
        results.missing_on_cj++;
        continue;
      }
      results.matched_on_cj++;

      const description = (cjDetail?.description || cjDetail?.enDescription || '').trim();
      const productType = (cjDetail?.categoryName || cjDetail?.productType || '').trim();

      const weightUpdates = [];

      for (const v of variants) {
        const vSku = (v.sku || '').trim();
        const vWeight = v.grams || 0;
        const vRequiresShip = v.requires_shipping !== false;

        // Weight from Cj
        if (vRequiresShip && !vWeight) {
          const cjWeight = cjDetail?.weight || cjStock?.weight || 500;
          weightUpdates.push({ variant_id: v.id, grams: Number(cjWeight) });
          results.updated_weight++;
        }

        // SKU from CJ
        if (!vSku && cjStock?.vid) {
          weightUpdates.push({ variant_id: v.id, sku: String(cjStock.vid) });
          results.updated_sku++;
        }

        // Inventory levels
        const cjQty = cjStock?.stockNum != null ? Number(cjStock.stockNum) : null;
        if (cjQty != null && v.inventory_item_id) {
          await shopifyFetch('/inventory_levels/set.json', {
            method: 'POST',
            body: JSON.stringify({ location_id: locationId, inventory_item_id: v.inventory_item_id, available: Math.max(0, Math.min(9999, cjQty)) }),
          });
          results.updated_stock++;
          await sleep(250);
        }
      }

      // Weight + SKU updates via variant PUTs
      for (const wu of weightUpdates) {
        const payload = { variant: { id: wu.variant_id } };
        if (wu.grams) payload.variant.grams = wu.grams;
        if (wu.sku) payload.variant.sku = wu.sku;
        await shopifyFetch(`/variants/${wu.variant_id}.json`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        await sleep(150);
      }

      // Product-level updates: description, product_type
      const pUpdates = {};
      if (description && !(p.body_html || '').trim()) {
        pUpdates.body_html = `<p>${description}</p>`;
        results.updated_description++;
      }
      if (productType && !(p.product_type || '').trim()) {
        pUpdates.product_type = productType;
        results.updated_product_type++;
      }
      if (Object.keys(pUpdates).length) {
        await shopifyFetch(`/products/${p.id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ product: { id: p.id, ...pUpdates } }),
        });
        await sleep(150);
      }

      await sleep(100);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    appendSyncLog({ kind: 'product-data-sync', ok: true, ...results, elapsed_sec: elapsed });
    res.status(200).json({ success: true, results, elapsed_sec: elapsed });
  } catch (e) {
    appendSyncLog({ kind: 'product-data-sync', ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message, results });
  }
}
