export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { line_items, customer_email, success_url, cancel_url, metadata } = req.body;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';

  if (!STRIPE_KEY) {
    return res.status(500).json({ error: 'Stripe key not configured' });
  }

  try {
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', success_url);
    params.append('cancel_url', cancel_url);
    params.append('customer_email', customer_email);

    // All AU payment methods — remove any that aren't activated in your dashboard
    // All activated payment methods from Stripe dashboard
    const methods = ['card', 'link', 'afterpay_clearpay', 'klarna', 'scalapay', 'zip', 'pay_by_bank', 'payto', 'bancontact', 'blik', 'eps', 'ideal', 'bizum', 'mb_way', 'pix', 'satispay', 'upi'];
    methods.forEach(m => params.append('payment_method_types[]', m));
    
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, v);
      }
    }

    line_items.forEach((item, i) => {
      params.append(`line_items[${i}][price_data][currency]`, item.price_data.currency);
      params.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
      if (item.price_data.product_data.images && item.price_data.product_data.images[0]) {
        params.append(`line_items[${i}][price_data][product_data][images][]`, item.price_data.product_data.images[0]);
      }
      params.append(`line_items[${i}][price_data][unit_amount]`, item.price_data.unit_amount);
      params.append(`line_items[${i}][quantity]`, item.quantity);
    });

    const shipping_options = req.body.shipping_options;
    if (shipping_options && shipping_options.length > 0) {
      shipping_options.forEach((opt, i) => {
        if (opt.shipping_rate_data) {
          params.append(`shipping_options[${i}][shipping_rate_data][display_name]`, opt.shipping_rate_data.display_name);
          params.append(`shipping_options[${i}][shipping_rate_data][type]`, opt.shipping_rate_data.type);
          params.append(`shipping_options[${i}][shipping_rate_data][fixed_amount][amount]`, opt.shipping_rate_data.fixed_amount.amount);
          params.append(`shipping_options[${i}][shipping_rate_data][fixed_amount][currency]`, opt.shipping_rate_data.fixed_amount.currency);
        }
      });
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    
    if (data.url) {
      res.status(200).json({ url: data.url });
    } else {
      console.error('Stripe error:', JSON.stringify(data));
      res.status(400).json({ error: data.error?.message || 'Stripe error', details: data });
    }
  } catch (e) {
    console.error('Server error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
