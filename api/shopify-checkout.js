export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { line_items, customer_email, shipping_address, payment_method } = req.body;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const SHOP = 'bargain-drop-8194.myshopify.com';

  if (!SHOPIFY_TOKEN) {
    return res.status(500).json({ error: 'Shopify access token not configured' });
  }

  if (!line_items || !line_items.length) {
    return res.status(400).json({ error: 'No items in cart' });
  }

  try {
    const currency = (req.body.currency || (line_items[0]?.price_data?.currency) || 'AUD').toLowerCase();

    // Create a DRAFT ORDER (gives us a proper invoice_url for checkout)
    const draftData = {
      draft_order: {
        email: customer_email,
        currency: currency.toUpperCase(),
        line_items: line_items.map(item => ({
          title: item.price_data?.product_data?.name || 'Product',
          price: (item.price_data?.unit_amount / 100).toFixed(2),
          quantity: item.quantity || 1
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
        note_attributes: [
          { name: 'source', value: 'bargain-drop-v10' },
          { name: 'payment_method', value: payment_method || 'shop_pay' }
        ]
      }
    };

    const draftRes = await fetch(`https://${SHOP}/admin/api/2025-04/draft_orders.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(draftData)
    });

    const draft = await draftRes.json();

    if (draft.draft_order && draft.draft_order.invoice_url) {
      res.status(200).json({
        url: draft.draft_order.invoice_url,
        order_id: draft.draft_order.id,
        order_number: draft.draft_order.name
      });
    } else {
      console.error('Draft order error:', JSON.stringify(draft));
      res.status(400).json({ error: 'Failed to create checkout', details: draft });
    }
  } catch (e) {
    console.error('Server error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
