export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CJ_TOKEN = process.env.CJ_ACCESS_TOKEN || '';
  const CJ_REFRESH = process.env.CJ_REFRESH_TOKEN || '';
  const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

  async function cjCall(path, method = 'POST', body = null) {
    const opts = { method, headers: { 'CJ-Access-Token': CJ_TOKEN, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(CJ_BASE + path, opts);
    return r.json();
  }

  const { line_items, customer_email, shipping_address, payment_method, success_url } = req.body;

  if (!line_items || line_items.length === 0) {
    return res.status(400).json({ error: 'No line items provided' });
  }

  try {
    // Build products array from line items
    const products = line_items.map((item, i) => ({
      vid: item.vid || null,  // CJ variant ID - set if you have it
      sku: item.sku || null,
      quantity: item.quantity || 1,
      unitPrice: (item.price_data?.unit_amount / 100).toFixed(2),
      storeLineItemId: 'v10-' + Date.now().toString(36) + '-' + i
    }));

    const orderData = {
      orderNumber: 'BD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
      shippingCountryCode: shipping_address?.country_code || 'AU',
      shippingCountry: shipping_address?.country || 'Australia',
      shippingProvince: shipping_address?.province || shipping_address?.state || 'Western Australia',
      shippingCity: shipping_address?.city || 'Perth',
      shippingZip: shipping_address?.zip || '6000',
      shippingPhone: shipping_address?.phone || '',
      shippingCustomerName: (shipping_address?.first_name || 'Customer') + ' ' + (shipping_address?.last_name || ''),
      shippingAddress: shipping_address?.address1 || shipping_address?.addr || '',
      shippingAddress2: shipping_address?.address2 || '',
      email: customer_email || '',
      remark: payment_method ? 'Payment: ' + payment_method : '',
      platform: 'shopify',
      fromCountryCode: 'CN',
      logisticName: 'CJPacket Ordinary',  // default - you can change this
      products: products
    };

    const result = await cjCall('/shopping/order/createOrderV2', 'POST', orderData);

    if (result.code === 200 && result.result) {
      const cjData = result.data;
      res.status(200).json({
        success: true,
        cj_order_id: cjData.orderId,
        order_number: cjData.orderNumber,
        order_amount: cjData.orderAmount,
        product_amount: cjData.productAmount,
        postage_amount: cjData.postageAmount,
        cj_pay_url: cjData.cjPayUrl || '',
        order_status: cjData.orderStatus,
        message: 'Order sent to CJ Dropshipping'
      });
    } else {
      res.status(400).json({ success: false, error: result.message || 'CJ order failed', details: result });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
