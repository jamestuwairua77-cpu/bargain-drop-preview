// Apple Pay merchant validation endpoint
// Called by Apple's JS to validate the merchant domain
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { validationURL } = req.body;
    if (!validationURL) return res.status(400).json({ error: 'Missing validationURL' });

    // Fetch merchant session from Apple via our server
    const resp = await fetch(validationURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantIdentifier: 'merchant.com.bargaindrop',
        displayName: 'Bargain Drop',
        initiative: 'web',
        initiativeContext: process.env.VERCEL_URL || 'bargain-drop.online'
      })
    });

    const session = await resp.json();
    res.status(200).json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
