export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CJ_TOKEN = process.env.CJ_ACCESS_TOKEN || '';
  const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

  async function cjCall(path, method = 'POST', body = null) {
    const opts = { method, headers: { 'CJ-Access-Token': CJ_TOKEN, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(CJ_BASE + path, opts);
    return r.json();
  }

  const { line_items, customer_email, shipping_address, payment_method } = req.body;

  if (!line_items || line_items.length === 0) {
    return res.status(400).json({ error: 'No line items provided' });
  }

  try {
    // Build products - only send fields CJ accepts
    const products = line_items.map((item, i) => ({
      vid: item.vid || item.variant_id || null,
      quantity: item.quantity || 1,
      storeLineItemId: 'v10-' + Date.now().toString(36) + '-' + i
    }));

    const now = Date.now();
    const orderData = {
      orderNumber: 'BD-' + now.toString(36).toUpperCase() + Math.random().toString(36).substring(2,6).toUpperCase(),
      shippingCountryCode: shipping_address?.country_code || 'AU',
      shippingCountry: shipping_address?.country || 'Australia',
      shippingProvince: shipping_address?.state || shipping_address?.province || 'Western Australia',
      shippingCity: shipping_address?.city || 'Perth',
      shippingZip: shipping_address?.zip || '',
      shippingPhone: shipping_address?.phone || '',
      shippingCustomerName: (shipping_address?.first_name || '') + ' ' + (shipping_address?.last_name || ''),
      shippingAddress: shipping_address?.addr || shipping_address?.address1 || '',
      email: customer_email || '',
      remark: payment_method ? 'Payment: ' + payment_method : '',
      platform: 'shopify',
      fromCountryCode: 'CN',
      logisticName: 'CJPacket Ordinary',
      products: products
    };

    const result = await cjCall('/shopping/order/createOrderV2', 'POST', orderData);

    if (result.code === 200 && result.result) {
      const d = result.data;
      res.status(200).json({
        success: true,
        cj_order_id: d.orderId,
        order_number: d.orderNumber,
        product_amount: d.productAmount,
        logistics_missing: d.logisticsMiss,
        order_status: d.orderStatus || 'created',
        message: 'Order synced to CJ Dropshipping'
      });
    } else {
      res.status(400).json({ success: false, error: result.message || 'CJ order failed', details: result });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
