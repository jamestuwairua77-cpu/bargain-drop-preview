// Product lookup API — returns single product by ID
// GET /api/product-lookup?id=9115605336195

// Module-level cache (persists between warm invocations on Vercel)
import { readFileSync } from 'fs';
import { join } from 'path';

let cachedData = null;
let cachedIndex = null;

function loadData() {
  if (cachedData && cachedIndex) {
    return { data: cachedData, index: cachedIndex };
  }
  
  const dataRaw = readFileSync(join(process.cwd(), 'categories-data.json'), 'utf-8');
  const indexRaw = readFileSync(join(process.cwd(), 'products-index.json'), 'utf-8');
  
  cachedData = JSON.parse(dataRaw);
  cachedIndex = JSON.parse(indexRaw);
  
  return { data: cachedData, index: cachedIndex };
}

export default function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Missing product id' });
  }
  
  try {
    const { data, index } = loadData();
    
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
