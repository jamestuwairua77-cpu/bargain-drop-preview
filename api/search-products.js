// Search API — paginated product search across all categories
// GET /api/search-products?q=&page=1&limit=50&category=

let cachedData = null;
let cachedAll = null;
let cacheTime = 0;
const TTL = 600000;

async function ensureData() {
  const now = Date.now();
  if (cachedData && (now - cacheTime) < TTL) return;
  
  const res = await fetch('https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/categories-data.json');
  if (!res.ok) throw new Error('Failed to fetch');
  cachedData = await res.json();
  
  // Flatten all products
  cachedAll = [];
  for (const [cat, catData] of Object.entries(cachedData)) {
    for (const p of (catData.products || [])) {
      p._category = cat;
      cachedAll.push(p);
    }
  }
  cacheTime = now;
}

export default async function handler(req, res) {
  try {
    await ensureData();
    
    const q = (req.query.q || '').toLowerCase().trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const category = req.query.category || '';
    
    let results = cachedAll;
    
    if (category) {
      results = results.filter(p => p._category === category);
    }
    
    if (q) {
      results = results.filter(p => (p.title || '').toLowerCase().includes(q));
    }
    
    const total = results.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const pageResults = results.slice(start, start + limit);
    
    // Strip internal fields
    const clean = pageResults.map(p => {
      const { _category, ...rest } = p;
      return { ...rest, category: _category };
    });
    
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      products: clean,
      total: total,
      page: page,
      totalPages: totalPages,
      limit: limit
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
