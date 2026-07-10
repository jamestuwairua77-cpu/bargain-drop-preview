// Create a fulfillment order on CJ. Fixed: correct code check (was `dd.result`).
import { cors, cjFetch, appendSyncLog, loadJSON, saveJSON, ORDERS_FILE } from './_sync-lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { line_items, customer_email, shipping_address, payment_method, order_id, shopify_order_id } = req.body;
    if (!line_items?.length) return res.status(400).json({ error: 'No line items' });

    const oid = order_id || ('BD' + Date.now().toString(36).toUpperCase());
    const body = {
      orderNumber: oid,
      shippingCountryCode: shipping_address?.country_code || 'AU',
      shippingCountry:     shipping_address?.country      || 'Australia',
      shippingProvince:    shipping_address?.state        || '',
      shippingCity:        shipping_address?.city         || '',
      shippingZip:         shipping_address?.zip          || '',
      shippingPhone:       shipping_address?.phone        || '',
      shippingCustomerName: `${shipping_address?.first_name || ''} ${shipping_address?.last_name || ''}`.trim() || 'Customer',
      shippingAddress:     shipping_address?.addr || shipping_address?.address1 || '',
      email: customer_email,
      remark: payment_method ? `Payment: ${payment_method}` : '',
      platform: 'shopify',
      fromCountryCode: 'CN',
      logisticName: 'CJPacket Ordinary',
      products: line_items.map((it, i) => ({
        vid: it.vid || it.sku || null,
        quantity: it.quantity || it.qty || 1,
        storeLineItemId: `${oid}-${i}`,
      })),
    };

    const dd = await cjFetch('/shopping/order/createOrderV2', { method: 'POST', body: JSON.stringify(body) });
    const ok = dd.code === 200 && dd.data?.orderId;

    if (ok) {
      // Persist the BD↔CJ↔Shopify mapping so webhooks/polling can back-link later.
      const orders = loadJSON(ORDERS_FILE, []);
      const idx = orders.findIndex(o => o.id === oid);
      const rec = {
        id: oid,
        cj_order_id: dd.data.orderId,
        shopify_order_id: shopify_order_id || null,
        email: customer_email,
        status: 'processing',
        created_at: new Date().toISOString(),
      };
      if (idx >= 0) orders[idx] = { ...orders[idx], ...rec }; else orders.push(rec);
      saveJSON(ORDERS_FILE, orders);
      appendSyncLog({ kind: 'cj-order', ok: true, order: oid, cj: dd.data.orderId });
      return res.status(200).json({ success: true, cj_order_id: dd.data.orderId, order_number: oid, message: 'Order synced to CJ Fulfillment' });
    }

    appendSyncLog({ kind: 'cj-order', ok: false, order: oid, error: dd.message });
    res.status(400).json({ success: false, error: dd.message || 'CJ order failed', details: dd });
  } catch (e) {
    appendSyncLog({ kind: 'cj-order', ok: false, error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
}
