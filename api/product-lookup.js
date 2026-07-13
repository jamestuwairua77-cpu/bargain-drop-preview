// Product lookup API — fetches product by ID
// GET /api/product-lookup?id=9115605336195
// Loads data from deployed static files, not bundled in function

let cachedData = null;
let cachedIndex = null;
let cacheTime = 0;

async function loadData() {
  // Refresh cache every 5 minutes
  const now = Date.now();
  if (cachedData && cachedIndex && (now - cacheTime) < 300000) {
    return { data: cachedData, index: cachedIndex };
  }

  const base = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'https://bargain-drop.online';

  try {
    const [dataResp, idxResp] = await Promise.all([
      fetch(`${base}/categories-data.json`, {
        headers: { 'Accept-Encoding': 'br' },
        cache: 'no-cache'
      }),
      fetch(`${base}/products-index.json`, {
        headers: { 'Accept-Encoding': 'br' },
        cache: 'no-cache'
      })
    ]);

    cachedData = await dataResp.json();
    cachedIndex = await idxResp.json();
    cacheTime = now;
  } catch (e) {
    // Fall back to whatever is cached (or null)
    console.error('Failed to load data:', e.message);
  }

  return { data: cachedData, index: cachedIndex };
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing product id' });
  }

  try {
    const { data, index } = await loadData();

    // Try index lookup first
    if (index) {
      const entry = index[String(id)];
      if (entry) {
        const idx = entry.idx !== undefined ? entry.idx : entry.index;
        const category = data[entry.category];
        if (category && idx !== undefined) {
          const product = category[idx];
          if (product && String(product.id || product.id) === String(id)) {
            // Normalize tags: convert array to comma-separated string for frontend compatibility
            if (Array.isArray(product.tags)) product.tags = product.tags.join(',');
            return res.status(200).json({ product, category: entry.category });
          }
        }
      }
    }

    // Fallback: linear search
    if (data) {
      for (const [catName, catData] of Object.entries(data)) {
        const products = Array.isArray(catData) ? catData : (catData.products || []);
        const product = products.find(p => String(p.id) === String(id));
        if (product) {
          // Normalize tags
            if (Array.isArray(product.tags)) product.tags = product.tags.join(',');
            return res.status(200).json({ product, category: catName });
        }
      }
    }

    return res.status(404).json({ error: 'Product not found' });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
}
