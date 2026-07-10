// Pull CJ stock levels → push to Shopify inventory (SKU-matched).
// Trigger: GET for status, POST to run. Rate-limited to avoid Shopify 429s.
import { cors, cjFetch, shopifyFetch, appendSyncLog, SHOPIFY_TOKEN, CJ_API_KEY } from './_sync-lib.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      cj_configured: !!CJ_API_KEY,
      shopify_configured: !!SHOPIFY_TOKEN,
      hint: 'POST to run inventory sync. Body: { limit?: number }',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!CJ_API_KEY || !SHOPIFY_TOKEN) return res.status(500).json({ error: 'CJ or Shopify not configured' });

  const { limit = 100 } = (req.body || {});
  const results = { scanned: 0, matched: 0, updated: 0, missing_on_cj: 0, errors: [] };

  try {
    // 1. Get Shopify location (needed for inventory_levels).
    const locRes = await shopifyFetch('/locations.json');
    const locationId = locRes.body?.locations?.[0]?.id;
    if (!locationId) throw new Error('No Shopify location found');

    // 2. Page through Shopify variants (only ones with a SKU are eligible).
    let sinceId = 0;
    while (results.scanned < limit) {
      const pageSize = Math.min(250, limit - results.scanned);
      const { body } = await shopifyFetch(
        `/products.json?limit=${pageSize}&since_id=${sinceId}&fields=id,title,variants`
      );
      const products = body.products || [];
      if (products.length === 0) break;
      sinceId = products[products.length - 1].id;

      for (const p of products) {
        for (const v of (p.variants || [])) {
          results.scanned++;
          const sku = (v.sku || '').trim();
          if (!sku || !v.inventory_item_id) continue;

          // 3. Ask CJ for stock by VID / SKU.
          const cj = await cjFetch(`/product/stock/queryByVid?vid=${encodeURIComponent(sku)}`, { method: 'GET' });
          const qty = cj?.data?.[0]?.stockNum ?? cj?.data?.stockNum ?? null;
          if (qty == null) { results.missing_on_cj++; continue; }
          results.matched++;

          // 4. Set the Shopify inventory level.
          const upd = await shopifyFetch('/inventory_levels/set.json', {
            method: 'POST',
            body: JSON.stringify({
              location_id: locationId,
              inventory_item_id: v.inventory_item_id,
              available: Math.max(0, Math.min(9999, Number(qty))),
            }),
          });
          if (upd.ok) results.updated++;
          else results.errors.push({ sku, err: upd.body?.errors });
          await sleep(120); // Shopify 2 req/sec safe zone
        }
      }
      if (products.length < pageSize) break;
    }
    appendSyncLog({ kind: 'inventory-sync', ok: true, ...results });
    res.status(200).json({ success: true, results });
  } catch (e) {
    appendSyncLog({ kind: 'inventory-sync', ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message, results });
  }
}
