// Product lookup API — returns single product by ID
// GET /api/product-lookup?id=9115605336195
import { readFileSync } from 'fs';
import { join } from 'path';

let cachedData = null; // v2 — supports both idx and index keys
let cachedIndex = null;

function loadData() {
  if (cachedData && cachedIndex) return { data: cachedData, index: cachedIndex };
  cachedData = JSON.parse(readFileSync(join(process.cwd(), 'categories-data.json'), 'utf-8'));
  cachedIndex = JSON.parse(readFileSync(join(process.cwd(), 'products-index.json'), 'utf-8'));
  return { data: cachedData, index: cachedIndex };
}

export default function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing product id' });

  try {
    const { data, index } = loadData();
    const entry = index[String(id)];

    if (entry) {
      // Support both 'idx' and 'index' field names
      const idx = entry.idx !== undefined ? entry.idx : entry.index;
      const category = data[entry.category];
      if (category?.products && idx !== undefined) {
        const product = category.products[idx];
        if (product && String(product.id) === String(id)) {
          res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.status(200).json({ product, category: entry.category });
        }
      }
    }

    // Fallback: linear search
    for (const [catName, catData] of Object.entries(data)) {
      const product = (catData.products || []).find(p => String(p.id) === String(id));
      if (product) {
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({ product, category: catName });
      }
    }

    return res.status(404).json({ error: 'Product not found' });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
}
