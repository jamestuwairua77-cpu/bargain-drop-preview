export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ key: process.env.STRIPE_PUBLISHABLE_KEY || '' });
}
