// Product lookup API — returns single product by ID
// GET /api/product-lookup?id=9115605336195

// Module-level cache (persists between warm invocations on Vercel)
let cachedData = null;
let cachedIndex = null;
let cacheTime = 0;
const CACHE_TTL = 600000; // 10 minutes

async function loadData() {
  const now = Date.now();
  if (cachedData && (now - cacheTime) < CACHE_TTL) {
    return { data: cachedData, index: cachedIndex };
  }
  
  const [dataRes, indexRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/categories-data.json'),
    fetch('https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/products-index.json')
  ]);
  
  if (!dataRes.ok || !indexRes.ok) throw new Error('Failed to fetch data');
  
  cachedData = await dataRes.json();
  cachedIndex = await indexRes.json();
  cacheTime = now;
  
  return { data: cachedData, index: cachedIndex };
}

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Missing product id' });
  }
  
  try {
    const { data, index } = await loadData();
    
    // Fast path: use index to find product location
    const entry = index[String(id)];
    if (entry) {
      const category = data[entry.category];
      if (category && category.products) {
        const product = category.products[entry.idx];
        if (product && String(product.id) === String(id)) {
          res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.status(200).json({
            product: product,
            category: entry.category
          });
        }
      }
    }
    
    // Fallback: linear search (in case index is stale)
    for (const [catName, catData] of Object.entries(data)) {
      const products = catData.products || [];
      const product = products.find(p => String(p.id) === String(id));
      if (product) {
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({
          product: product,
          category: catName
        });
      }
    }
    
    return res.status(404).json({ error: 'Product not found' });
  } catch (e) {
    console.error('Product lookup error:', e.message);
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
}
