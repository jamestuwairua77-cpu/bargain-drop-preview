// Categories metadata API — reads from local file
// GET /api/categories-lookup
import { readFileSync } from 'fs';
import { join } from 'path';

let cached = null;

export default function handler(req, res) {
  try {
    if (!cached) {
      const raw = readFileSync(join(process.cwd(), 'categories-index.json'), 'utf-8');
      cached = JSON.parse(raw);
    }
    
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(cached);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
