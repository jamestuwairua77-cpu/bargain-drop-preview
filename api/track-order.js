// Customer-facing tracking lookup: GET /api/track-order?order_id=BD...  or ?email=...
import { cors, loadJSON, ORDERS_FILE, TRACKING_FILE } from './_sync-lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { order_id, email } = req.query;
  const orders = loadJSON(ORDERS_FILE, []);
  const tracking = loadJSON(TRACKING_FILE, []);

  let matches = orders;
  if (order_id) matches = matches.filter(o => o.id === order_id || o.cj_order_id === order_id || String(o.shopify_order_id) === String(order_id));
  else if (email) matches = matches.filter(o => (o.email || '').toLowerCase() === String(email).toLowerCase());
  else return res.status(400).json({ error: 'Provide order_id or email' });

  const withTracking = matches.map(o => {
    const t = tracking.find(t => t.order_number === o.id) || null;
    return {
      order_id: o.id,
      status: o.status,
      tracking_number: o.tracking_number || t?.tracking_number || null,
      tracking_url: o.tracking_url || t?.tracking_url || null,
      logistic_name: o.logistic_name || t?.logistic_name || null,
      shipped_at: o.shipped_at || null,
      delivered_at: o.delivered_at || null,
      shopify_order_name: o.shopify_order_name || null,
    };
  });

  res.status(200).json({ success: true, count: withTracking.length, orders: withTracking });
}
