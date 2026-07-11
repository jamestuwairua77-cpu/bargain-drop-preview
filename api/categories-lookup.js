// Categories API - fetches from CDN directly
export default async function handler(req, res) {
  try {
    const r = await fetch("https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-index.json");
    const data = await r.json();
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}