export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.GPAY_PRIVATE_KEY || '';
  res.status(200).json({
    has_key: !!key,
    key_len: key.length,
    key_start: key ? key.substring(0,8) : 'none',
    stripe_set: !!process.env.STRIPE_SECRET_KEY,
    node_ver: process.version
  });
}
