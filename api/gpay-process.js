// Google Pay DIRECT token (ECv2) → server-side Stripe processing with SECRET key.
// Zero Stripe.js on client — encrypted card decrypted server-side.
import crypto from 'crypto';

function base64ToBytes(b64) { return Buffer.from(b64, 'base64'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const GPAY_KEY_HEX = process.env.GPAY_PRIVATE_KEY;
  const origin = req.headers['origin'] || 'https://bargain-drop.online';
  
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key missing' });
  if (!GPAY_KEY_HEX) return res.status(500).json({ error: 'Google Pay key missing' });

  const { encryptedMessage, ephemeralPublicKey, tag, amount, currency, email } = req.body;
  if (!encryptedMessage || !ephemeralPublicKey || !tag || !amount) {
    return res.status(400).json({ error: 'Missing fields: encryptedMessage, ephemeralPublicKey, tag, amount' });
  }

  try {
    // Step 1: Decrypt Google Pay DIRECT token (ECv2)
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(GPAY_KEY_HEX, 'hex'));
    
    const ephemeralKeyBytes = base64ToBytes(ephemeralPublicKey);
    const sharedSecret = ecdh.computeSecret(ephemeralKeyBytes);
    
    const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'Google Pay ECv2', 32);
    
    const tagBytes = base64ToBytes(tag);
    const encryptedBytes = base64ToBytes(encryptedMessage);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.alloc(12, 0));
    decipher.setAuthTag(tagBytes);
    decipher.setAAD(ephemeralKeyBytes);
    
    let decrypted = decipher.update(encryptedBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const cardData = JSON.parse(decrypted.toString('utf8'));
    
    const details = cardData.paymentMethodDetails;
    if (!details || !details.pan) throw new Error('Invalid decrypted card data');

    // Step 2: Create & confirm PaymentIntent (card-only to avoid redirects)
    const piParams = new URLSearchParams();
    piParams.append('amount', String(amount));
    piParams.append('currency', (currency || 'aud').toLowerCase());
    piParams.append('confirm', 'true');
    piParams.append('capture_method', 'automatic');
    piParams.append('payment_method_types[]', 'card');
    piParams.append('payment_method_data[type]', 'card');
    piParams.append('payment_method_data[card][number]', details.pan);
    piParams.append('payment_method_data[card][exp_month]', String(details.expirationMonth));
    piParams.append('payment_method_data[card][exp_year]', String(details.expirationYear));
    piParams.append('payment_method_data[card][cvc]', details.cryptogram || '');
    if (email) piParams.append('receipt_email', email);

    const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: piParams.toString()
    });
    const piData = await piResp.json();

    if (piData.error) {
      // If PCI block (raw card data), return clear message
      if (piData.error.message && piData.error.message.includes('unsafe')) {
        return res.status(400).json({
          success: false,
          error: 'Raw card processing must be enabled in Stripe Dashboard → Settings → Integrations → Raw Card Data API',
          url: 'https://dashboard.stripe.com/settings/integration'
        });
      }
      throw new Error(piData.error.message);
    }

    // Handle 3DS if needed
    if (piData.status === 'requires_action' && piData.next_action) {
      return res.status(200).json({
        success: true,
        status: 'requires_action',
        next_action: piData.next_action,
        client_secret: piData.client_secret
      });
    }

    res.status(200).json({
      success: true,
      payment_intent_id: piData.id,
      status: piData.status
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
