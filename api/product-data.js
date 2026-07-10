import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  try {
    const raw = readFileSync(join(process.cwd(), 'categories-data.json'), 'utf-8');
    const data = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
}