export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.CJ_ACCESS_TOKEN || '';
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
  const FROM_EMAIL = 'orders@bargain-drop.online';

  async function getCJToken() {
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: API_KEY })
    });
    const d = await r.json();
    return d.code === 200 ? d.data.accessToken : null;
  }

  async function cjCall(path, method, token, body) {
    const opts = { method, headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1' + path, opts);
    return r.json();
  }

  const { line_items, customer_email, shipping_address, payment_method, order_id, order_data } = req.body;

  if (!line_items || line_items.length === 0) {
    return res.status(400).json({ error: 'No line items provided' });
  }

  try {
    const token = await getCJToken();
    if (!token) return res.status(500).json({ error: 'CJ authentication failed' });

    const products = line_items.map((item, i) => ({
      vid: item.vid || item.variant_id || null,
      quantity: item.quantity || 1,
      storeLineItemId: 'BD-' + Date.now().toString(36) + '-' + i
    }));

    const now = Date.now();
    const orderNumber = order_id || ('BD-' + now.toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase());
    
    const orderData = {
      orderNumber: orderNumber,
      shippingCountryCode: shipping_address?.country_code || 'AU',
      shippingCountry: shipping_address?.country || 'Australia',
      shippingProvince: shipping_address?.state || shipping_address?.province || 'Western Australia',
      shippingCity: shipping_address?.city || 'Perth',
      shippingZip: shipping_address?.zip || '6000',
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

    const result = await cjCall('/shopping/order/createOrderV2', 'POST', token, orderData);

    if (result.code === 200 && result.result) {
      const d = result.data;
      
      let emailSent = false;
      if (SENDGRID_KEY && customer_email) {
        try {
          await fetch('https://api.sendgrid.net/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + SENDGRID_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{
                to: [{ email: customer_email }],
                subject: 'Order #' + orderNumber + ' Confirmed - Bargain Drop'
              }],
              from: { email: FROM_EMAIL, name: 'Bargain Drop' },
              content: [{
                type: 'text/html',
                value: '<h2>Order Confirmed!</h2><p>Your order <strong>#' + orderNumber + '</strong> has been placed and sent to our fulfillment center.</p><p>CJ Order ID: ' + d.orderId + '</p><p>We will email you tracking information once your order ships.</p><p>Thank you for shopping with Bargain Drop!</p>'
              }]
            })
          });
          emailSent = true;
        } catch (e) { }
      }

      res.status(200).json({
        success: true,
        cj_order_id: d.orderId,
        order_number: d.orderNumber || orderNumber,
        product_amount: d.productAmount,
        logistics_missing: d.logisticsMiss,
        order_status: d.orderStatus || 'created',
        email_sent: emailSent,
        message: 'Order synced to CJ Dropshipping'
      });
    } else {
      res.status(400).json({ success: false, error: result.message || 'CJ order failed', details: result });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}