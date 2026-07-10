// Categories metadata API — returns lightweight category info (no products)
// GET /api/categories-lookup

let cached = null;
let cacheTime = 0;
const TTL = 600000;

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (!cached || (now - cacheTime) > TTL) {
      const r = await fetch('https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/categories-index.json');
      if (!r.ok) throw new Error('Failed to fetch');
      cached = await r.json();
      cacheTime = now;
    }
    
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(cached);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
