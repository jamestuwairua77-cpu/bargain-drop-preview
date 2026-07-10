// Receives Shopify webhooks (orders/create, orders/cancelled, orders/updated, refunds/create).
// For direct-Shopify sales we forward to CJ; for cancels/refunds we cancel the CJ order.
import crypto from 'crypto';
import { cors, cjFetch, shopifyToCjOrder, appendSyncLog, loadJSON, saveJSON, ORDERS_FILE } from './_sync-lib.js';

// Vercel gives us the parsed body; we need the raw one to verify HMAC.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function verifyHmac(raw, header, secret) {
  if (!secret || !header) return true; // if not configured, don't block
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header)); } catch { return false; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const raw = await readRaw(req);
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const topic = req.headers['x-shopify-topic'] || 'unknown';
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || '';

  if (!verifyHmac(raw, hmac, secret)) {
    appendSyncLog({ kind: 'shopify-webhook', topic, ok: false, error: 'HMAC mismatch' });
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  let payload; try { payload = JSON.parse(raw.toString('utf-8')); } catch { return res.status(400).json({ error: 'Bad JSON' }); }

  try {
    // ── orders/create → mirror to CJ if it didn't originate from our storefront ──
    if (topic === 'orders/create') {
      // If our storefront already created a CJ order for this, note_attributes carries bd_order_id.
      // If NOT (direct Shopify buy), we create one now.
      const bdAttr = (payload.note_attributes || []).find(a => a.name === 'bd_order_id');
      const alreadyMirrored = (payload.tags || '').includes('cj-synced');
      if (!alreadyMirrored) {
        const cjBody = shopifyToCjOrder(payload);
        const cj = await cjFetch('/shopping/order/createOrderV2', { method: 'POST', body: JSON.stringify(cjBody) });
        const ok = cj.code === 200;
        // Persist mapping so cj-webhook can update this Shopify order later.
        const orders = loadJSON(ORDERS_FILE, []);
        orders.push({
          id: cjBody.orderNumber,
          shopify_order_id: payload.id,
          shopify_order_name: payload.name,
          cj_order_id: cj?.data?.orderId || null,
          email: payload.email,
          status: ok ? 'processing' : 'unpaid',
          created_at: new Date().toISOString(),
          source: bdAttr ? 'storefront' : 'shopify-direct',
        });
        saveJSON(ORDERS_FILE, orders);
        appendSyncLog({ kind: 'shopify-webhook', topic, ok, order: payload.name, cj: cj?.data?.orderId, error: ok ? null : cj?.message });
        return res.status(200).json({ success: ok, cj_order_id: cj?.data?.orderId, message: cj?.message });
      }
      appendSyncLog({ kind: 'shopify-webhook', topic, ok: true, note: 'already mirrored' });
      return res.status(200).json({ success: true, skipped: 'already mirrored' });
    }

    // ── orders/cancelled → try to cancel on CJ ──
    if (topic === 'orders/cancelled') {
      const orders = loadJSON(ORDERS_FILE, []);
      const rec = orders.find(o => o.shopify_order_id === payload.id);
      let cjResult = null;
      if (rec?.cj_order_id) {
        cjResult = await cjFetch('/shopping/order/deleteOrder', {
          method: 'POST',
          body: JSON.stringify({ orderId: rec.cj_order_id }),
        });
        rec.status = 'cancelled';
        rec.cancelled_at = new Date().toISOString();
        saveJSON(ORDERS_FILE, orders);
      }
      appendSyncLog({ kind: 'shopify-webhook', topic, ok: true, order: payload.name, cj: cjResult });
      return res.status(200).json({ success: true, cj: cjResult });
    }

    // ── refunds/create → mark local order refunded (CJ has no true refund API; log for manual) ──
    if (topic === 'refunds/create') {
      const orders = loadJSON(ORDERS_FILE, []);
      const rec = orders.find(o => o.shopify_order_id === payload.order_id);
      if (rec) { rec.status = 'refunded'; rec.refunded_at = new Date().toISOString(); saveJSON(ORDERS_FILE, orders); }
      appendSyncLog({ kind: 'shopify-webhook', topic, ok: true, order_id: payload.order_id, refund: payload.id });
      return res.status(200).json({ success: true, note: 'Local mark; contact CJ if not yet shipped' });
    }

    // ── orders/updated → keep local status roughly synced ──
    if (topic === 'orders/updated') {
      const orders = loadJSON(ORDERS_FILE, []);
      const rec = orders.find(o => o.shopify_order_id === payload.id);
      if (rec) {
        if (payload.financial_status === 'paid' && rec.status === 'unpaid') rec.status = 'processing';
        if (payload.fulfillment_status === 'fulfilled')                        rec.status = 'shipped';
        saveJSON(ORDERS_FILE, orders);
      }
      return res.status(200).json({ success: true });
    }

    appendSyncLog({ kind: 'shopify-webhook', topic, ok: true, note: 'ignored' });
    return res.status(200).json({ success: true, ignored: topic });
  } catch (e) {
    appendSyncLog({ kind: 'shopify-webhook', topic, ok: false, error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
}
