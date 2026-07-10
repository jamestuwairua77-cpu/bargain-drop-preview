// Create order in Shopify and sync with CJ
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { order, customer, line_items, shipping_address } = req.body;
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';

  const results = { shopify: null, cj: null, stripe: null };

  // ── 1. SYNC TO SHOPIFY ──────────────────────────────────
  if (SHOPIFY_TOKEN) {
    try {
      // First, find or create customer
      let customerId = null;
      if (customer?.email) {
        const custSearch = await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(customer.email)}`,
          { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
        );
        const custData = await custSearch.json();
        if (custData.customers?.length > 0) {
          customerId = custData.customers[0].id;
        } else {
          const custCreate = await fetch(
            `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers.json`,
            {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customer: {
                  first_name: customer.first_name || '',
                  last_name: customer.last_name || '',
                  email: customer.email,
                  phone: customer.phone || '',
                  addresses: shipping_address ? [{
                    address1: shipping_address.addr || shipping_address.address1 || '',
                    city: shipping_address.city || '',
                    province: shipping_address.state || '',
                    zip: shipping_address.zip || '',
                    country: shipping_address.country || 'Australia',
                    first_name: customer.first_name || '',
                    last_name: customer.last_name || '',
                    phone: customer.phone || ''
                  }] : []
                }
              })
            }
          );
          const newCust = await custCreate.json();
          customerId = newCust.customer?.id;
        }
      }

      // Create the order in Shopify
      const orderLineItems = (line_items || order?.items || []).map((item, i) => ({
        title: item.title || `Product ${i + 1}`,
        quantity: item.qty || item.quantity || 1,
        price: String(item.price || 0),
        sku: item.id || item.sku || `BD-${i}`,
        requires_shipping: true
      }));

      const shopifyOrder = {
        order: {
          email: customer?.email || order?.email || '',
          financial_status: 'paid',
          fulfillment_status: null,
          send_receipt: false,
          note: `Bargain Drop Order #${order?.id || ''} | Payment: ${order?.payment || 'Stripe'}`,
          note_attributes: [
            { name: 'bd_order_id', value: order?.id || '' },
            { name: 'payment_method', value: order?.payment || 'Stripe' }
          ],
          line_items: orderLineItems,
          ...(customerId ? { customer: { id: customerId } } : {}),
          ...(shipping_address ? {
            shipping_address: {
              first_name: (customer?.first_name || shipping_address.first_name || '').trim() || 'Customer',
              last_name: (customer?.last_name || shipping_address.last_name || '').trim() || '',
              address1: shipping_address.addr || shipping_address.address1 || 'N/A',
              city: shipping_address.city || '',
              province: shipping_address.state || '',
              zip: shipping_address.zip || '',
              country: shipping_address.country || 'Australia',
              phone: shipping_address.phone || ''
            }
          } : {})
        }
      };

      const shopRes = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json`,
        {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(shopifyOrder)
        }
      );
      const shopData = await shopRes.json();
      
      if (shopData.order) {
        results.shopify = {
          success: true,
          order_id: shopData.order.id,
          order_number: shopData.order.name,
          admin_url: `https://admin.shopify.com/store/${SHOPIFY_DOMAIN.replace('.myshopify.com','')}/orders/${shopData.order.id}`
        };
      } else {
        results.shopify = { success: false, error: shopData.errors || 'Shopify order creation failed' };
      }
    } catch (e) {
      results.shopify = { success: false, error: e.message };
    }
  } else {
    results.shopify = { success: false, error: 'Shopify access token not configured. Set SHOPIFY_ACCESS_TOKEN in Vercel.' };
  }

  // ── 2. SYNC TO CJ DROPSHIPPING ──────────────────────────
  try {
    const CJ_TOKEN = process.env.CJ_ACCESS_TOKEN || '';
    if (CJ_TOKEN) {
      // Get CJ access token
      const authRes = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: CJ_TOKEN })
      });
      const authData = await authRes.json();
      const cjToken = authData.data?.accessToken;

      if (cjToken) {
        const items = line_items || order?.items || [];
        const cjBody = {
          orderNumber: order?.id || ('BD' + Date.now().toString(36).toUpperCase()),
          shippingCountryCode: shipping_address?.country_code || 'AU',
          shippingCountry: shipping_address?.country || 'Australia',
          shippingProvince: shipping_address?.state || 'Western Australia',
          shippingCity: shipping_address?.city || 'Perth',
          shippingZip: shipping_address?.zip || '6000',
          shippingPhone: shipping_address?.phone || '',
          shippingCustomerName: `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Customer',
          shippingAddress: shipping_address?.addr || shipping_address?.address1 || '',
          email: customer?.email || order?.email || '',
          remark: `Payment: ${order?.payment || 'Stripe'} | BD Order: ${order?.id || ''}`,
          platform: 'shopify',
          fromCountryCode: 'CN',
          logisticName: 'CJPacket Ordinary',
          products: items.map((it, i) => ({
            vid: it.vid || null,
            quantity: it.qty || it.quantity || 1,
            storeLineItemId: `${order?.id || 'BD'}-${i}`
          }))
        };

        const cjRes = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2', {
          method: 'POST',
          headers: { 'CJ-Access-Token': cjToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(cjBody)
        });
        const cjData = await cjRes.json();
        
        if (cjData.code === 200) {
          results.cj = { success: true, order_id: cjData.data?.orderId, order_number: order?.id };
        } else {
          results.cj = { success: false, error: cjData.message || 'CJ order failed' };
        }
      } else {
        results.cj = { success: false, error: 'CJ auth failed' };
      }
    } else {
      results.cj = { success: false, error: 'CJ token not configured' };
    }
  } catch (e) {
    results.cj = { success: false, error: e.message };
  }

  // ── 3. GET STRIPE PAYMENT DETAILS ───────────────────────
  if (STRIPE_KEY && req.body.stripe_session_id) {
    try {
      const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${req.body.stripe_session_id}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
      });
      const stripeData = await stripeRes.json();
      results.stripe = {
        payment_intent: stripeData.payment_intent,
        payment_status: stripeData.payment_status,
        amount_total: stripeData.amount_total,
        currency: stripeData.currency
      };
    } catch (e) {
      results.stripe = { error: e.message };
    }
  }

  // ── FINAL ────────────────────────────────────────────────
  const overall = results.shopify?.success && results.cj?.success;
  res.status(200).json({
    success: overall || results.shopify?.success || results.cj?.success,
    results,
    message: overall ? 'Synced to Shopify + CJ' 
      : results.shopify?.success ? 'Synced to Shopify (CJ pending)'
      : results.cj?.success ? 'Synced to CJ (Shopify pending)'
      : 'Sync incomplete — check configuration'
  });
}
