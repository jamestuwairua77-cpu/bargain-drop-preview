// CJ → Shopify product sync. SKU-matched (not title), multi-variant aware, inventory push.
// GET: status. POST: run one page. Body: { page?, limit?, category?, dry?: bool }
import { cors, cjFetch, shopifyFetch, appendSyncLog, SHOPIFY_TOKEN, CJ_API_KEY } from './_sync-lib.js';
// fix: truncate title to 255 chars to avoid Shopify 422 + surface API errors in response

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      cj_configured: !!CJ_API_KEY,
      shopify_configured: !!SHOPIFY_TOKEN,
      hint: 'POST { page, limit, category, dry } to sync one page (max 50 products) from CJ → Shopify.',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!CJ_API_KEY || !SHOPIFY_TOKEN) return res.status(500).json({ error: 'CJ or Shopify not configured' });

  const { category, page = 1, limit = 50, dry = false } = (req.body || {});
  const results = { page, cj_products: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const params = new URLSearchParams({ pageNum: String(page), pageSize: String(Math.min(limit, 50)) });
    if (category) params.set('categoryId', category);

    const cj = await cjFetch(`/product/list?${params}`, { method: 'GET' });
    if (cj.code !== 200) return res.status(400).json({ error: 'CJ product fetch failed', details: cj });
    const cjProducts = cj.data?.list || [];
    results.cj_products = cjProducts.length;

    // Prefetch a page of Shopify products to build a SKU index for this batch.
    // Cheap heuristic: pull the same-size Shopify page; matches on SKU below regardless.
    const shopIndex = new Map(); // sku → { product, variant }
    const { body: shopBody } = await shopifyFetch(`/products.json?limit=250&fields=id,title,variants,handle`);
    for (const p of (shopBody.products || [])) {
      for (const v of (p.variants || [])) {
        if (v.sku) shopIndex.set(v.sku.trim(), { product: p, variant: v });
      }
    }

    for (const cp of cjProducts) {
      try {
        const title = (cp.productNameEn || cp.productName || cp.nameEn || 'Untitled').substring(0, 255);
        const description = cp.description || cp.productDescEn || '';
        const tags = (cp.categoryName ? String(cp.categoryName).split(/[,>]/).map(s => s.trim()) : []).filter(Boolean);
        // Extract images from remark HTML + productImage
        const remarkImgs = [];
        if (cp.remark) {
          const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
          let m;
          while ((m = imgRegex.exec(cp.remark)) !== null) remarkImgs.push(m[1]);
        }
        const mainImg = cp.productImage || '';
        const images = [mainImg, ...remarkImgs]
          .filter(Boolean)
          .slice(0, 10)
          .map(src => ({ src }));

        // Variants: CJ productName is a JSON array of Chinese variant names
        // Parse them to get variant options (usually: [full_name, medium_name, short_name])
        let variantNames = [];
        try { 
          const pn = JSON.parse(cp.productName || '[]');
          if (Array.isArray(pn)) variantNames = pn;
        } catch {}
        // If no variant names found, use a single default
        if (!variantNames.length) variantNames = ['Default'];
        
        // Use the CJ product SKU as base for variant SKUs
        const baseSku = cp.productSku || cp.pid || '';
        const basePrice = cp.sellPrice || '0';
        const weightRange = (cp.productWeight || '').split('-');
        const minWeight = parseFloat(weightRange[0] || '0');
        const maxWeight = parseFloat(weightRange[1] || weightRange[0] || '0');
        const weightStep = variantNames.length > 1 ? (maxWeight - minWeight) / (variantNames.length - 1) : 0;
        
        // Generate variants from parsed names
        const variants = variantNames.map((vn, i) => ({
          sku: variantNames.length > 1 ? (baseSku + '-' + (i+1)) : baseSku,
          price: String(basePrice),
          option1: String(vn).substring(0, 255),
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          requires_shipping: true,
          weight: Number((minWeight + (weightStep * i)).toFixed(0)),
          weight_unit: 'g',
        }));
        
        // Also check for CJ variantList if it exists (some products have real SKUs)
        const cjVariantList = (cp.variants || cp.variantList || []).length
          ? (cp.variants || cp.variantList).map(vv => ({
              sku: (vv.variantSku || vv.sku || vv.vid || '').trim(),
              price: String(vv.variantSellPrice || vv.sellPrice || vv.price || cp.sellPrice || 0),
              option1: vv.variantNameEn || vv.variantName || 'Default',
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              requires_shipping: true,
              weight: Number(vv.variantWeight || cp.productWeight || 0),
              weight_unit: 'g',
            }))
          : variants;
        // Match by ANY variant SKU present in the Shopify index.
        const match = variants.map(v => shopIndex.get(v.sku)).find(Boolean);
        if (dry) { results.skipped++; continue; }

        if (match) {
          // Update in place: price, title, images, tags, description.
          const productId = match.product.id;
          const upRes = await shopifyFetch(`/products/${productId}.json`, {
            method: 'PUT',
            body: JSON.stringify({
              product: {
                id: productId,
                title,
                body_html: description,
                tags: tags.join(', '),
                variants: variants.map((v, i) => ({
                  id: match.product.variants[i]?.id,
                  price: v.price,
                  sku: v.sku,
                })).filter(v => v.id),
                ...(images.length ? { images } : {}),
              },
            }),
          });
          if (upRes.ok || upRes.status === 200) results.updated++; else results.errors.push({ product: title.substring(0,30), error: 'Update failed: ' + upRes.status, details: JSON.stringify(upRes.body).substring(0,200) });
        } else {
          const crRes = await shopifyFetch('/products.json', {
            method: 'POST',
            body: JSON.stringify({
              product: {
                title,
                body_html: description,
                vendor: 'CJ Dropshipping',
                product_type: tags[0] || '',
                tags: tags.join(', '),
                status: 'active',
                options: [{ name: 'Variant' }],
                variants,
                ...(images.length ? { images } : {}),
                metafields: [
                  { namespace: 'cjdropship', key: 'pid', value: String(cp.pid || cp.productId || ''), type: 'single_line_text_field' },
                ],
              },
            }),
          });
          if (crRes.ok || crRes.status === 201) results.created++; else results.errors.push({ product: title.substring(0,30), error: 'Create failed: ' + crRes.status, details: JSON.stringify(crRes.body).substring(0,200) });
        }
        await sleep(200); // Shopify rate limit
      } catch (e) {
        results.errors.push({ product: cp.productNameEn || cp.pid, error: e.message });
      }
    }

    appendSyncLog({ kind: 'product-sync', ok: true, ...results });
    res.status(200).json({ success: true, results, message: `Synced page ${page}: +${results.created} new, ~${results.updated} updated` });
  } catch (e) {
    appendSyncLog({ kind: 'product-sync', ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
}
