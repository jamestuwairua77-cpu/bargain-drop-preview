// Sync products from CJ Dropshipping to Shopify
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CJ_TOKEN = process.env.CJ_ACCESS_TOKEN || '';
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';

  const results = { cj_products: 0, shopify_created: 0, shopify_updated: 0, errors: [] };

  // ── GET: Check sync status ─────────────────────────────
  if (req.method === 'GET') {
    const status = {
      cj_configured: !!CJ_TOKEN,
      shopify_configured: !!SHOPIFY_TOKEN,
      shopify_domain: SHOPIFY_DOMAIN,
      message: (CJ_TOKEN && SHOPIFY_TOKEN) 
        ? 'Both CJ and Shopify configured. POST to start sync.'
        : !CJ_TOKEN ? 'CJ token not configured. Set CJ_ACCESS_TOKEN.'
        : 'Shopify token not configured. Set SHOPIFY_ACCESS_TOKEN.'
    };
    return res.status(200).json(status);
  }

  // ── POST: Execute sync ──────────────────────────────────
  if (!CJ_TOKEN) return res.status(500).json({ error: 'CJ_ACCESS_TOKEN not configured' });
  if (!SHOPIFY_TOKEN) return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' });

  try {
    // 1. Authenticate with CJ
    const authRes = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: CJ_TOKEN })
    });
    const authData = await authRes.json();
    const cjToken = authData.data?.accessToken;
    if (!cjToken) return res.status(500).json({ error: 'CJ authentication failed', details: authData });

    // 2. Get products from CJ
    const { category, page = 1, limit = 50 } = req.body;
    let cjProducts = [];

    const cjParams = new URLSearchParams({
      page: String(page),
      size: String(Math.min(limit, 50))
    });
    if (category) cjParams.set('categoryId', category);

    const cjRes = await fetch(
      `https://developers.cjdropshipping.com/api2.0/v1/product/list?${cjParams}`,
      { headers: { 'CJ-Access-Token': cjToken } }
    );
    const cjData = await cjRes.json();

    if (cjData.code === 200 && cjData.data?.list) {
      cjProducts = cjData.data.list;
      results.cj_products = cjProducts.length;
    } else {
      return res.status(400).json({ error: 'CJ product fetch failed', details: cjData });
    }

    // 3. Get existing Shopify products
    const shopProducts = {};
    let shopPage = 1;
    let hasMore = true;
    while (hasMore) {
      const shopRes = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products.json?limit=250&page=${shopPage}&fields=id,title,variants`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const shopData = await shopRes.json();
      if (shopData.products?.length > 0) {
        shopData.products.forEach(p => {
          // Map by title for matching
          shopProducts[p.title.toLowerCase().trim()] = p;
        });
        shopPage++;
      } else {
        hasMore = false;
      }
    }
    results.shopify_existing = Object.keys(shopProducts).length;

    // 4. Sync each CJ product to Shopify
    for (const cp of cjProducts) {
      try {
        const title = cp.productNameEn || cp.productName || '';
        const price = cp.sellPrice || cp.price || 0;
        const sku = cp.productSku || cp.sku || cp.pid || '';
        const images = (cp.productImageList || []).map(img => ({
          src: img.url || img
        })).filter(i => i.src);
        const description = cp.description || cp.productDescEn || '';
        const tags = cp.categoryName ? cp.categoryName.split(',').map(t => t.trim()) : [];
        const cjVid = cp.vid || cp.pid || '';

        const existingProduct = shopProducts[title.toLowerCase().trim()];

        if (existingProduct) {
          // Update existing product — update images and price
          await fetch(
            `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products/${existingProduct.id}.json`,
            {
              method: 'PUT',
              headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                product: {
                  id: existingProduct.id,
                  title: title,
                  body_html: description,
                  tags: tags.join(', '),
                  variants: [{
                    id: existingProduct.variants[0]?.id,
                    price: String(price),
                    sku: sku
                  }],
                  ...(images.length > 0 ? { images: images.slice(0, 10) } : {})
                }
              })
            }
          );
          results.shopify_updated++;
        } else {
          // Create new product
          const newProduct = {
            product: {
              title: title,
              body_html: description,
              vendor: 'CJ Dropshipping',
              product_type: tags[0] || '',
              tags: tags.join(', '),
              status: 'active',
              variants: [{
                price: String(price),
                sku: sku,
                inventory_management: null,
                requires_shipping: true
              }],
              ...(images.length > 0 ? { images: images.slice(0, 10) } : {})
            }
          };

          await fetch(
            `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products.json`,
            {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify(newProduct)
            }
          );
          results.shopify_created++;
        }
      } catch (e) {
        results.errors.push({ product: cp.productNameEn || cp.pid, error: e.message });
      }
    }

    res.status(200).json({
      success: true,
      results,
      message: `Synced ${results.shopify_created} new + ${results.shopify_updated} updated products from CJ to Shopify`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
