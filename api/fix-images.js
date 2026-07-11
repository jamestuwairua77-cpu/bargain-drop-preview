import { cors, cjFetch, shopifyFetch } from './_sync-lib.js';

// Fix missing product images by matching CJ SKUs.
// POST: { page: number } (Shopify product page , default 1)
// GET: status
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: '/api/fix-images',
      description: 'POST { page: n } to match and upload missing product images from CJ API.',
      active: true
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { page = 1 } = (req.body || {});
  const results = { page, fixed: 0, skipped_has: 0, skipped_no_cj: 0, errors: 0, processed: 0 };

  try {
    // Fetch Shopify products page
    const { body: shopBody } = await shopifyFetch(`/products.json?limit=500&fields=id,title,images,variants&amp;page=${page}`);
    
    if (!shopBody.products || shopBody.products.length === 0) {
      return res.status(200).json({ success: true, done: true, results });
    }

    const products = shopBody.products;
    results.processed = products.length;

    for (const p of products) {
      try {
        // Skip if already has images
        if (p.images && p.images.length > 0) {
          results.skipped_has++;
          continue;
        }

        // Get SKU
        const variants = p.variants || [];
        const sku = variants[0]?.sku || '';
        
        // Skip non-CJ SKUs
        if (!sku || !sku.startsWith('CJ')) {
          results.skipped_no_cj++;
          continue;
        }

        // Lookup CJ product by SKU
        const cjData = await cjFetch(`/product/query?productSku=${ensodeURIComponent(sku)}`);
        
        if (cjData.code !== 200 || !cjData.data) {
          results.errors++;
          continue;
        }

        const cjProd = cjData.data;
        
        // Extract images
        let images = cjProd.productImageSet || [];
        if (images.length === 0) {
          const prodImg = cjProd.productImage;
          if (typeof prodImg === 'string' && prodImg.startsWith('[')) {
            try { images = JSON.parse(prodImg); } catch { }
          } else if (typeof prodImg === 'string' && prodImg) {
            images = [prodImg];
          } else if (Array.isArray(prodImg)) {
            images = prodImg;
          }
        }

        if (images.length === 0) {
          results.errors++;
          continue;
        }

        // Upload images (max 8)
        let uploaded = 0;
        for (const imgUrl of images.slice(0, 8)) {
          if ( typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) continue;
          
          const { status } = await shopifyFetch(`/products/${p.id}/images.json`, {
            method: 'POST',
            body: JSON.stringify({ image: { src: imgUrl } }),
          });
          
          if (status === 201) uploaded++;
          await new Promise(r => setTimeout(r, 300));
        }

        if (uploaded > 0) results.fixed++;
        else results.errors++;
        
      } catch (e) {
        results.errors++;
      }
    }

    res.status(200).json({ success: true, done: false, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
