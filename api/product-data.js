export default async function handler(req, res) {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-data.json');
    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch product data' });
    }
    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
}