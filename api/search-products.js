// Search API — paginated product search across all categories
// GET /api/search-products?q=&page=1&limit=50&category=

import { readFileSync } from 'fs';
import { join } from 'path';

let cachedAll = null;

function ensureData() {
  if (cachedAll) return;
  
  const raw = readFileSync(join(process.cwd(), 'categories-data.json'), 'utf-8');
  const data = JSON.parse(raw);
  
  // Flatten all products
  cachedAll = [];
  for (const [cat, catData] of Object.entries(data)) {
    for (const p of (catData.products || [])) {
      p._category = cat;
      cachedAll.push(p);
    }
  }
}

export default function handler(req, res) {
  try {
    ensureData();
    
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
