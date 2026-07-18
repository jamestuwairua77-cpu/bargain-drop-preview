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
  const results = { page, cj_products: 0, created: 0, updated: 0, skipped: 0, dupes: 0, errors: [] };

  try {
    const params = new URLSearchParams({ pageNum: String(page), pageSize: String(Math.min(limit, 50)) });
    if (category) params.set('categoryId', category);

    const cj = await cjFetch(`/product/list?${params}`, { method: 'GET' });
    if (cj.code !== 200) return res.status(400).json({ error: 'CJ product fetch failed', details: cj });
    const cjProducts = cj.data?.list || [];
    results.cj_products = cjProducts.length;

    // Two-index lookup: SKU + CJ PID metafield -- BOTH catch duplicates
    const shopIndex = new Map(); // sku → { product, variant }
    const pidIndex = new Map();  // cj pid → { product }
    
    // Page through all Shopify products to build both indexes
    let shopifyPage = 1;
    let done = false;
    while (!done) {
      const { body: shopBody } = await shopifyFetch(`/products.json?limit=250&page=${shopifyPage}&feldsc=id,title,variants,handle,metafields`);
      const products = shopBody.products || [];
      if (products.length === 0) break;
      
      for (const p of products) {
        // SKU index
        for (const v of (p.variants || [])) {
          if (v.sku) shopIndex.set(v.sku.trim(), { product: p, variant: v });
        }
        // PID index (from cjdropship metafield)
        const pid = p.metafields?.find(m => m.namespace === 'cjdropship' && m.key === 'pid')?.value;
        if (pid) pidIndex.set(String(pid).trim(), { product: p });
      }
      
      shopifyPage++;
      if (products.length < 250) done = true;
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
        

        const cjPid = String(cp.pid || cp.productId || '').trim();

        // CJ productName is a JSON array of variant names (e.g. ["Full Title","Short","Size Option"])
        // The CJ list API doesn't give per-variant prices, so we use the single sellPrice
        // For variants, parse the productName and create options
        let cjVariants = [];
        try {
          if (typeof cp.productName === 'string' && cp.productName.startsWith('[')) {
            cjVariants = JSON.parse(cp.productName);
          }
        } catch(e) { /* not JSON, that's OK */ }

        // If we got variant names, create multiple variants with proper option names
        const useVariants = cjVariants.length > 1;
        const options = useVariants ? [{ name: 'Option' }] : [{ name: 'Variant' }];
        
        const variants = useVariants
          ? cjVariants.map((name, i) => ({
              sku: ((cp.productSku || cp.pid || '') + (i > 0 ? '-' + (i+1) : '')).trim().substring(0, 80),
              price: String(cp.sellPrice || 0),
              option1: String(name).substring(0, 80) || ('Option ' + (i+1)),
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              requires_shipping: true,
              weight: Number(cp.productWeight || 0),
              weight_unit: 'g',
            }))
          : [{
              sku: (cp.productSku || cp.pid || cp.vid || '').trim().substring(0, 80),
              price: String(cp.sellPrice || cp.price || 0),
              option1: 'Default',
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              requires_shipping: true,
              weight: Number(cp.productWeight || 0),
              weight_unit: 'g',
            }];

        // Images: use productImage as primary, extract from remark HTML as secondary
        const images = [];
        if (cp.productImage) {
          images.push({ src: cp.productImage });
        }
        // Parse remark HTML for additional images
        try {
          const imgMatches = (cp.remark || '').match(/<img[^>]+src="([^"]+)"/g);
          if (imgMatches) {
            for (const match of imgMatches) {
              const src = match.match(/src="([^"]+)"/)[1];
              if (src && !images.some(i => i.src === src)) {
                images.push({ src });
              }
            }
          }
        } catch(e) { /* ignore remark parsing errors */ }
        // Fallback to existing image fields
        const extraImages = (cp.productImageSet || cp.productImageList || cp.images || [])
          .map(x => typeof x === 'string' ? x : (x?.url || x?.image)).filter(Boolean);
        for (const src of extraImages) {
          if (src && !images.some(i => i.src === src)) {
            images.push({ src });
          }
        }
        images.slice(0, 10);

                // DUPLICATE CHECK: 1) PID match, 2) SKU match, otherwise create
        let match = null;
        
        // 1. CJ PID metafield match (strongest -- works even when SKUs change)
        if (cjPid) {
          match = pidIndex.get(cjPid);
          if (match) results.dupes++;
        }
        
        // 2. SKU match (secondary fallback)
        if (!match) {
          match = variants.map(v => shopIndex.get(v.sku)).find(Boolean);
        }
        
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
                  { namespace: 'cjdropship', key: 'pid', value: cjPid || String(cp.productId || ''), type: 'single_line_text_field' },
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
    res.status(200).json({ success: true, results, message: `Synced page ${page}: +${results.created} new, ~${results.updated} updated, ${results.dupes} dupe scanned` });
  } catch (e) {
    appendSyncLog({ kind: 'product-sync', ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
}
