export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { line_items, customer_email, success_url, cancel_url, shipping_address, payment_method } = req.body;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const SHOP = 'bargain-drop-8194.myshopify.com';
  
  if (!SHOPIFY_TOKEN || !SHOPIFY_TOKEN.startsWith('shp')) {
    return res.status(500).json({ error: 'Shopify access token not configured' });
  }

  try {
    // Map line items to Shopify format
    const items = line_items.map(item => ({
      variant_id: item.variant_id || null,
      title: item.price_data?.product_data?.name || 'Product',
      price: (item.price_data?.unit_amount / 100).toFixed(2),
      quantity: item.quantity || 1
    }));

    // Create order via Shopify REST API
    const orderData = {
      order: {
        email: customer_email,
        financial_status: 'pending',
        send_receipt: true,
        send_fulfillment_receipt: true,
        line_items: items.map(i => ({
          title: i.title,
          price: i.price,
          quantity: i.quantity
        })),
        shipping_address: shipping_address || {
          first_name: 'Customer',
          last_name: '',
          address1: '123 Main St',
          city: 'Sydney',
          province: 'NSW',
          country: 'AU',
          zip: '2000'
        },
        note: payment_method ? `Payment method: ${payment_method}` : undefined,
        note_attributes: [{
          name: 'source',
          value: 'bargain-drop-v10'
        }, {
          name: 'payment_method',
          value: payment_method || 'shop_pay'
        }]
      }
    };

    const orderRes = await fetch(`https://${SHOP}/admin/api/2025-04/orders.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const order = await orderRes.json();
    
    if (order.order) {
      // Redirect to Shopify's hosted checkout (supports Shop Pay, PayPal, GPay, etc.)
      const checkoutUrl = `https://${SHOP}/cart/${order.order.id}:1?checkout[email]=${encodeURIComponent(customer_email)}`;
      
      res.status(200).json({ 
        url: checkoutUrl,
        order_id: order.order.id,
        order_number: order.order.order_number
      });
    } else {
      console.error('Shopify order error:', JSON.stringify(order));
      res.status(400).json({ error: 'Failed to create Shopify order', details: order });
    }
  } catch (e) {
    console.error('Server error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
