export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const API = process.env.CJ_ACCESS_TOKEN || '';
  if (!API) return res.status(500).json({ error: 'CJ token not configured' });
  async function getToken() {
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {l
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ apiKey: API })
    }); return (await r.json()).data?.accessToken || null; }
  try {
    const t = await getToken(); if (!t) return res.status(501).json({ error: 'CJ auth failed' });
    const { line_items, customer_email, shipping_address, payment_method, order_id } = req.body;
    if (!line_items || !line_items.length) return res.status(400).json({ error: 'No line items' });
    const n = Date.now(), oid = order_id || ('BD' + n.toString(36).toUpperCase());
    const body = { orderNumber: oid,
      shippingCountryCode: shipping_address?.country_code || 'AU',
      shippingCountry: shipping_address?.country || 'Australia',
      shippingProvince: shipping_address?.state || 'Western Australia',
      shippingCity: shipping_address?.city || 'Perth',
      shippingZip: shipping_address?.zip || '6000',
      shippingPhone: shipping_address?.phone || '',
      shippingCustomerName: (shipping_address?.first_name||'') + ' ' + (shipping_address?.last_name||''),
      shippingAddress: shipping_address?.addr || shipping_address?.address1 || '',
      email: customer_email,
      remark: payment_method ? 'Payment: '+ payment_method : '',
      platform: 'shopify', fromCountryCode: 'CN', logisticName: 'CJPacket Ordinary',
      products: line_items.map((it,i) => ({
        vid: it.vid || null, quantity: it.quantity || it.qty || 1,
        storeLineItemId: oid + '-' + i
      }))
    };
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2', {
      method: 'POST', headers: {'CJ-Access-Token': t, 'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const dd = await r.json();
    if (dd.code === 200 && dd.result) {
      res.status(200).json({ success: true, cj_order_id: dd.data.orderId, order_number: oid, message: 'Order synced to CJ Fulfillment' });
    } else { res.status(400).json({ success: false, error: dd.message || 'CJ order failed' }); }
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}