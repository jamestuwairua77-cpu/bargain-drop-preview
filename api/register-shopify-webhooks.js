// One-shot: registers all Shopify webhooks that point at our /api/shopify-webhook endpoint.
// Run manually after deploy or after rotating tokens.  GET to list, POST to register.
import { cors, shopifyFetch, SHOPIFY_TOKEN } from './_sync-lib.js';

const TARGET = 'https://bargain-drop.online/api/shopify-webhook';
const TOPICS = ['orders/create', 'orders/updated', 'orders/cancelled', 'refunds/create',
                'fulfillments/create', 'fulfillments/update'];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SHOPIFY_TOKEN) return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' });

  const { body: existing } = await shopifyFetch('/webhooks.json');
  const have = new Set((existing.webhooks || []).filter(w => w.address === TARGET).map(w => w.topic));

  if (req.method === 'GET') return res.status(200).json({ registered: [...have], expected: TOPICS });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const created = [];
  for (const topic of TOPICS) {
    if (have.has(topic)) continue;
    const r = await shopifyFetch('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address: TARGET, format: 'json' } }),
    });
    created.push({ topic, ok: r.ok, err: r.ok ? null : r.body?.errors });
  }
  res.status(200).json({ success: true, target: TARGET, already: [...have], created });
}
