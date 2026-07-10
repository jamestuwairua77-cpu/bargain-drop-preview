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
  
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key missing' });
  if (!GPAY_KEY_HEX) return res.status(500).json({ error: 'Google Pay key missing' });

  const { encryptedMessage, ephemeralPublicKey, tag, amount, currency, email } = req.body;
  if (!encryptedMessage || !ephemeralPublicKey || !tag || !amount) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Step 1: Decrypt Google Pay DIRECT token (ECv2)
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(GPAY_KEY_HEX, 'hex'));
    const sharedSecret = ecdh.computeSecret(base64ToBytes(ephemeralPublicKey));
    const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'Google Pay ECv2', 32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.alloc(12, 0));
    decipher.setAuthTag(base64ToBytes(tag));
    decipher.setAAD(base64ToBytes(ephemeralPublicKey));
    
    let decrypted = decipher.update(base64ToBytes(encryptedMessage));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const details = JSON.parse(decrypted.toString('utf8')).paymentMethodDetails;
    if (!details || !details.pan) throw new Error('Invalid card data');

    const cur = (currency || 'aud').toLowerCase();
    const pan = details.pan;
    const em = String(details.expirationMonth);
    const ey = String(details.expirationYear);
    const cv = details.cryptogram || '';

    // Step 2: Try every Stripe API path for raw card processing
    // Path A: Token API
    async function tryPath(name, fn) {
      try { const r = await fn(); return r; } catch(e) { return { _err: e.message }; }
    }

    let result;

    // Path A: Token → PaymentMethod → PaymentIntent
    result = await tryPath('token', async () => {
      const t = await fetch('https://api.stripe.com/v1/tokens', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'card[number]': pan, 'card[exp_month]': em, 'card[exp_year]': ey, 'card[cvc]': cv }).toString()
      });
      const d = await t.json();
      if (d.error) throw new Error(d.error.message);
      const pm = await fetch('https://api.stripe.com/v1/payment_methods', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ type: 'card', 'card[token]': d.id }).toString()
      });
      const pmd = await pm.json();
      if (pmd.error) throw new Error(pmd.error.message);
      const pi = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ amount: String(amount), currency: cur, payment_method: pmd.id, confirm: 'true', capture_method: 'automatic', ...(email ? { receipt_email: email } : {}) }).toString()
      });
      const pid = await pi.json();
      if (pid.error) throw new Error(pid.error.message);
      return { success: true, payment_intent_id: pid.id, status: pid.status };
    });
    if (result && result.success) return res.status(200).json(result);
    if (result && result._err && result._err.toLowerCase().includes('unsafe')) {
      return res.status(400).json({ success: false, error: 'Raw card processing must be enabled in Stripe Dashboard → Settings → Integrations → Raw Card Data API', url: 'https://dashboard.stripe.com/settings/integration' });
    }

    // Path B: PaymentIntent directly with payment_method_data
    result = await tryPath('pi_direct', async () => {
      const pi = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          amount: String(amount), currency: cur, confirm: 'true', capture_method: 'automatic',
          'payment_method_types[]': 'card',
          'payment_method_data[type]': 'card',
          'payment_method_data[card][number]': pan,
          'payment_method_data[card][exp_month]': em,
          'payment_method_data[card][exp_year]': ey,
          'payment_method_data[card][cvc]': cv,
          ...(email ? { receipt_email: email } : {})
        }).toString()
      });
      const d = await pi.json();
      if (d.error) throw new Error(d.error.message);
      return { success: true, payment_intent_id: d.id, status: d.status };
    });
    if (result && result.success) return res.status(200).json(result);

    // Path C: Create Source → attach to Customer → charge
    result = await tryPath('source', async () => {
      let custId;
      if (email) {
        const cs = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
          headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
        });
        const cd = await cs.json();
        if (cd.data && cd.data.length > 0) custId = cd.data[0].id;
      }
      if (!custId) {
        const cr = await fetch('https://api.stripe.com/v1/customers', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ ...(email ? { email } : {}) }).toString()
        });
        const cd = await cr.json();
        if (cd.error) throw new Error(cd.error.message);
        custId = cd.id;
      }
      const sr = await fetch('https://api.stripe.com/v1/sources', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'source[object]': 'card', 'source[number]': pan,
          'source[exp_month]': em, 'source[exp_year]': ey, 'source[cvc]': cv
        }).toString()
      });
      const sd = await sr.json();
      if (sd.error) throw new Error(sd.error.message);
      const ci = await fetch('https://api.stripe.com/v1/charges', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          amount: String(amount), currency: cur, customer: custId, source: sd.id,
          ...(email ? { receipt_email: email } : {})
        }).toString()
      });
      const cd2 = await ci.json();
      if (cd2.error) throw new Error(cd2.error.message);
      return { success: true, charge_id: cd2.id, status: cd2.status };
    });
    if (result && result.success) return res.status(200).json(result);

    // All paths failed
    throw new Error(result?._err || 'All payment paths failed');

  } catch (e) {
    const msg = e.message || '';
    if (msg.toLowerCase().includes('unsafe')) {
      return res.status(400).json({
        success: false,
        error: 'Raw card processing must be enabled in Stripe Dashboard → Settings → Integrations → Raw Card Data API',
        url: 'https://dashboard.stripe.com/settings/integration'
      });
    }
    res.status(500).json({ success: false, error: msg });
  }
}
