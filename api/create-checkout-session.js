export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { line_items, customer_email, success_url, cancel_url, metadata, payment_method } = req.body;
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
    
    // Enable all payment methods Stripe supports
    const payment_method_types = ['card'];
    
    if (payment_method === 'paypal') {
      payment_method_types.push('paypal');
    } else if (payment_method === 'google_pay') {
      payment_method_types.push('card'); // GPay processes as card token
    } else {
      // Default: enable all supported methods
      payment_method_types.push('paypal');
    }
    
    payment_method_types.forEach(t => params.append('payment_method_types[]', t));
    
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

    // Add shipping options if any
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
      res.status(400).json({ error: data.error || data || 'Stripe error' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
