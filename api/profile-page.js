export default async function handler(req, res) {
  try {
    const r = await fetch('https://backupv2-o8atc4n1n-jamestuwairua77-7116s-projects.vercel.app/profile.html');
    const html = await r.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(200).send(html);
  } catch(e) {
    res.status(502).send('Profile page temporarily unavailable');
  }
}
