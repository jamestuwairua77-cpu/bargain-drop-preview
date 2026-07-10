// Vercel Cron entry — runs periodic sync tasks. Configured in vercel.json.
// Vercel signs cron requests with x-vercel-cron; we don't strictly need to verify.
import { cors, appendSyncLog } from './_sync-lib.js';

async function callSelf(host, path, method = 'POST', body = {}) {
  const r = await fetch(`https://${host}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: r.ok }));
}

export default async function handler(req, res) {
  cors(res);
  const host = req.headers.host || 'bargain-drop.online';
  const task = (req.query.task || 'all').toLowerCase();
  const out = {};
  try {
    if (task === 'all' || task === 'inventory')
      out.inventory = await callSelf(host, '/api/sync-inventory', 'POST', { limit: 500 });
    if (task === 'all' || task === 'orders')
      out.orders    = await callSelf(host, '/api/sync-cj-orders', 'POST', {});
    appendSyncLog({ kind: 'cron', task, ok: true, out });
    res.status(200).json({ success: true, task, out });
  } catch (e) {
    appendSyncLog({ kind: 'cron', task, ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
}
