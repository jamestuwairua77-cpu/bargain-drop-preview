import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};
  
  const keyHex = process.env.GPAY_PRIVATE_KEY || '';
  results.key_set = !!keyHex;
  results.key_len = keyHex.length;
  
  if (keyHex) {
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(keyHex, 'hex'));
      const pub = ecdh.getPublicKey(null, 'uncompressed');
      results.pub_len = pub.length;
      results.pub_base64 = pub.toString('base64').substring(0, 30) + '...';
      
      // Test with a known public key from GPay spec
      const testPubBuf = pub; // our own public key
      try {
        const ss = ecdh.computeSecret(testPubBuf);
        results.ecdh_self_ok = true;
        results.ss_len = ss.length;
      } catch(e) {
        results.ecdh_self_err = e.message;
      }
      
      // Test with hardcoded uncompressed point
      const rawPoint = Buffer.alloc(65);
      rawPoint[0] = 0x04;
      try {
        ecdh.computeSecret(rawPoint);
        results.ecdh_zero_ok = 'passed (but shouldn\'t)';
      } catch(e) {
        results.ecdh_zero_err = e.message;
      }
      
    } catch(e) {
      results.init_err = e.message;
    }
  }
  
  res.status(200).json(results);
}
