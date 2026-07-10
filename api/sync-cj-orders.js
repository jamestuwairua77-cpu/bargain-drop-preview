// Poll CJ for the status of open orders in case a webhook was missed.
// For each still-open BD order (unpaid/processing), ask CJ; if shipped, apply the same
// updates as cj-webhook would have done (update local order, push fulfillment to Shopify).
import { cors, cjFetch, shopifyFetch, findShopifyOrderByBDId, loadJSON, saveJSON,
         appendSyncLog, ORDERS_FILE, TRACKING_FILE } from './_sync-lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const orders = loadJSON(ORDERS_FILE, []);
  const tracking = loadJSON(TRACKING_FILE, []);
  const openOrders = orders.filter(o => !['shipped','cancelled','refunded','delivered'].includes(o.status));

  const results = { checked: 0, updated: 0, shipped: 0, errors: [] };

  for (const o of openOrders.slice(0, 100)) {
    results.checked++;
    try {
      // CJ getOrderDetail by cj order id (fallback: by orderNumber).
      const detail = await cjFetch(
        o.cj_order_id
          ? `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(o.cj_order_id)}`
          : `/shopping/order/getOrderList?orderNumber=${encodeURIComponent(o.id)}&pageNum=1&pageSize=1`,
        { method: 'GET' }
      );
      const d = detail?.data?.list ? detail.data.list[0] : detail?.data;
      if (!d) continue;

      const trackingNumber = d.trackNumber || d.trackingNumber || '';
      const logistic = d.logisticName || '';
      const cjStatus = String(d.orderStatus || '').toLowerCase(); // e.g. shipped, delivered, cancelled

      let changed = false;
      if (trackingNumber && !o.tracking_number) {
        o.tracking_number = trackingNumber;
        o.tracking_url = `https://track.17track.net/en#nums=${trackingNumber}`;
        o.logistic_name = logistic;
        changed = true;
        // Merge into tracking file
        const idx = tracking.findIndex(t => t.order_number === o.id);
        const entry = { order_number: o.id, tracking_number: trackingNumber, logistic_name: logistic,
                        tracking_url: o.tracking_url, event: 'polled', updated_at: new Date().toISOString() };
        if (idx >= 0) Object.assign(tracking[idx], entry); else tracking.push(entry);
      }
      if (cjStatus.includes('shipped') && o.status !== 'shipped') { o.status = 'shipped'; o.shipped_at = new Date().toISOString(); changed = true; results.shipped++; }
      if (cjStatus.includes('delivered') && o.status !== 'delivered') { o.status = 'delivered'; o.delivered_at = new Date().toISOString(); changed = true; }
      if (cjStatus.includes('cancel') && o.status !== 'cancelled') { o.status = 'cancelled'; o.cancelled_at = new Date().toISOString(); changed = true; }

      // Push fulfillment to Shopify if we just learned about a shipment.
      if (changed && o.status === 'shipped' && trackingNumber) {
        const shopOrder = o.shopify_order_id
          ? (await shopifyFetch(`/orders/${o.shopify_order_id}.json`)).body?.order
          : await findShopifyOrderByBDId(o.id);
        if (shopOrder && !(shopOrder.fulfillments || []).length) {
          await shopifyFetch(`/orders/${shopOrder.id}/fulfillments.json`, {
            method: 'POST',
            body: JSON.stringify({
              fulfillment: {
                tracking_number: trackingNumber,
                tracking_company: logistic,
                tracking_urls: [o.tracking_url],
                notify_customer: false,
                line_items: (shopOrder.line_items || []).map(li => ({ id: li.id })),
              },
            }),
          });
        }
        results.updated++;
      }
    } catch (e) { results.errors.push({ order: o.id, err: e.message }); }
  }

  saveJSON(ORDERS_FILE, orders);
  saveJSON(TRACKING_FILE, tracking);
  appendSyncLog({ kind: 'cj-order-poll', ok: true, ...results });
  res.status(200).json({ success: true, results });
}
