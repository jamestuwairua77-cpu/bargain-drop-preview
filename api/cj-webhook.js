export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
  const FROM_EMAIL = 'orders@bargain-drop.online';

  try {
    const payload = req.body;
    
    const eventType = payload.event || payload.type || 'unknown';
    const orderNumber = payload.orderNumber || payload.order_number || '';
    const trackingNumber = payload.trackingNumber || payload.tracking_number || '';
    const logisticName = payload.logisticName || payload.logistics_name || '';
    const customerEmail = payload.email || payload.customer_email || '';

    let emailSent = false;
    if (trackingNumber && customerEmail && SENDGRID_KEY) {
      const trackingUrl = 'https://track.17track.net/en#nums=' + trackingNumber;
      try {
        await fetch('https://api.sendgrid.net/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SENDGRID_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: customerEmail }],
              subject: 'Your Bargain Drop Order #' + orderNumber + ' Has Shipped!'
            }],
            from: { email: FROM_EMAIL, name: 'Bargain Drop' },
            content: [{
              type: 'text/html',
              value: '<h2>Your Order Has Shipped!</h2><p>Order: <strong>#' + orderNumber + '</strong></p><p>Carrier: <strong>' + logisticName + '</strong></p><p>Tracking Number: <strong>' + trackingNumber + '</strong></p><p><a href="' + trackingUrl + '" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Track Your Package</a></p><p style="margin-top:20px">Thank you for shopping with Bargain Drop!</p>'
            }]
          })
        });
        emailSent = true;
      } catch (e) { console.error('SendGrid shipping email failed:', e.message); }
    }

    res.status(200).json({
      success: true,
      event: eventType,
      tracking_saved: !!trackingNumber,
      email_sent: emailSent,
      message: 'Webhook processed successfully'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}