// Processes Google Pay DIRECT token (ECv2) server-side using Stripe SECRET key.
// Zero Stripe.js client involvement — encrypted card decrypted with private key on server.
import crypto from 'crypto';

function base64ToBytes(b64) { return Buffer.from(b64, 'base64'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const GPAY_PEM_B64 = process.env.GPAY_PRIVATE_KEY_PEM_B64;
  
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key missing' });
  if (!GPAY_PEM_B64) return res.status(500).json({ error: 'Google Pay key missing' });

  const { encryptedMessage, ephemeralPublicKey, tag, amount, currency, email } = req.body;
  if (!encryptedMessage || !ephemeralPublicKey || !tag || !amount) {
    return res.status(400).json({ error: 'Missing fields: encryptedMessage, ephemeralPublicKey, tag, amount' });
  }

  try {
    // Step 1: Decrypt Google Pay DIRECT token (ECv2)
    const privPem = Buffer.from(GPAY_PEM_B64, 'base64').toString('utf8');
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privPem);
    
    const ephemeralKeyBytes = base64ToBytes(ephemeralPublicKey);
    const sharedSecret = ecdh.computeSecret(ephemeralKeyBytes);
    
    // HKDF-SHA256: derive AES key
    const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'Google Pay ECv2', 32);
    
    // AES-256-GCM decrypt
    const tagBytes = base64ToBytes(tag);
    const encryptedBytes = base64ToBytes(encryptedMessage);
    const ciphertext = encryptedBytes;
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.alloc(12, 0));
    decipher.setAuthTag(tagBytes);
    decipher.setAAD(ephemeralKeyBytes);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const cardData = JSON.parse(decrypted.toString('utf8'));
    
    const details = cardData.paymentMethodDetails;
    if (!details || !details.pan || !details.expirationMonth || !details.expirationYear) {
      throw new Error('Invalid decrypted card data');
    }

    // Step 2: Create Stripe card token using SECRET key
    const tokParams = new URLSearchParams();
    tokParams.append('card[number]', details.pan);
    tokParams.append('card[exp_month]', String(details.expirationMonth));
    tokParams.append('card[exp_year]', String(details.expirationYear));
    tokParams.append('card[cvc]', details.cryptogram || '');

    const tokResp = await fetch('https://api.stripe.com/v1/tokens', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokParams.toString()
    });
    const tokData = await tokResp.json();
    if (tokData.error) throw new Error('Token: ' + tokData.error.message);

    // Step 3: Create & confirm PaymentIntent
    const piParams = new URLSearchParams();
    piParams.append('amount', String(amount));
    piParams.append('currency', (currency || 'aud').toLowerCase());
    piParams.append('payment_method_data[type]', 'card');
    piParams.append('payment_method_data[card][token]', tokData.id);
    piParams.append('confirm', 'true');
    piParams.append('capture_method', 'automatic');
    if (email) piParams.append('receipt_email', email);

    const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: piParams.toString()
    });
    const piData = await piResp.json();
    if (piData.error) throw new Error(piData.error.message);

    res.status(200).json({
      success: true,
      payment_intent_id: piData.id,
      status: piData.status,
      card_brand: details.pan ? details.pan.substring(0, 1) === '4' ? 'visa' : 'mc' : 'unknown'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
