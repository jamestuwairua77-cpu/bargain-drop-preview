// Product lookup API — fetches product by ID
// GET /api/product-lookup?id=9115605336195
// Loads data from GitHub (always fresh) with fast in-memory cache

let cachedData = null;
let cachedIndex = null;
let cacheTime = 0;

async function loadData() {
  const now = Date.now();
  if (cachedData && cachedIndex && (now - cacheTime) < 120000) {
    return { data: cachedData, index: cachedIndex };
  }

  const BASE = 'https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main';

  try {
    const [dataResp, idxResp] = await Promise.all([
      fetch(`${BASE}/categories-data.json`, {
        headers: { 'Accept-Encoding': 'br', 'Cache-Control': 'no-cache' }
      }),
      fetch(`${BASE}/products-index.json`, {
        headers: { 'Accept-Encoding': 'br', 'Cache-Control': 'no-cache' }
      })
    ]);

    if (!dataResp.ok || !idxResp.ok) {
      throw new Error(`GitHub fetch failed: ${dataResp.status}/${idxResp.status}`);
    }

    cachedData = await dataResp.json();
    cachedIndex = await idxResp.json();
    cacheTime = now;
  } catch (e) {
    console.error('Failed to load data:', e.message);
    // Fallback to deployment's own files
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://bargain-drop.online';
    try {
      const [dataResp2, idxResp2] = await Promise.all([
        fetch(`${base}/categories-data.json`, { headers: { 'Accept-Encoding': 'br' } }),
        fetch(`${base}/products-index.json`, { headers: { 'Accept-Encoding': 'br' } })
      ]);
      cachedData = await dataResp2.json();
      cachedIndex = await idxResp2.json();
    } catch (e2) {
      console.error('Fallback also failed:', e2.message);
    }
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

    if (!data || !index) {
      return res.status(503).json({ error: 'Data not yet available' });
    }

    // Try index lookup first
    const entry = index[String(id)];
    if (entry) {
      const idx = entry.idx !== undefined ? entry.idx : entry.index;
      const catData = data[entry.category];
      if (catData && idx !== undefined) {
        const products = Array.isArray(catData) ? catData : (catData.products || []);
        const product = products[idx];
        if (product && String(product.id) === String(id)) {
          if (Array.isArray(product.tags)) product.tags = product.tags.join(',');
          return res.status(200).json({ product, category: entry.category });
        }
      }
    }

    // Fallback: linear search
    for (const [catName, catData] of Object.entries(data)) {
      const products = Array.isArray(catData) ? catData : (catData.products || []);
      const product = products.find(p => String(p.id) === String(id));
      if (product) {
        if (Array.isArray(product.tags)) product.tags = product.tags.join(',');
        return res.status(200).json({ product, category: catName });
      }
    }

    return res.status(404).json({ error: 'Product not found' });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
}
