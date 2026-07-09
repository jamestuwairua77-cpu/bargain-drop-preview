export default async function handler(req, res) {
  const GOOGLE_CLIENT_ID = '489382559871-t7hh34fgbr23vkifi1u8kd9s7dolrv20.apps.googleusercontent.com';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const REDIRECT_URI = (req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers.host || 'bargain-drop.online') + '/api/google-callback';

  // Google Identity Services sends credential (ID token) via POST
  if (req.method === 'POST') {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential' });
    
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: credential,
          client_id: GOOGLE_CLIENT_ID
        }).toString()
      });
      const tokens = await tokenRes.json();
      
      if (tokens.access_token) {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + tokens.access_token }
        });
        const user = await userRes.json();
        const payload = { email: user.email, name: user.name, picture: user.picture, email_verified: user.email_verified };
        const encoded = encodeURIComponent(JSON.stringify(payload));
        return res.redirect(302, 'https://bargain-drop.online/profile.html#google-auth=' + encoded);
      }
      
      // Try parsing credential as JWT directly
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const user = { email: payload.email, name: payload.name, picture: payload.picture, email_verified: payload.email_verified };
        const encoded = encodeURIComponent(JSON.stringify(user));
        return res.redirect(302, 'https://bargain-drop.online/profile.html#google-auth=' + encoded);
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Traditional OAuth code flow (GET)
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  try {
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', GOOGLE_CLIENT_ID);
    params.append('client_secret', GOOGLE_CLIENT_SECRET);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return res.status(400).json({ error: 'Token exchange failed', detail: tokens });
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token }
    });
    const user = await userRes.json();

    const payload = {
      email: user.email,
      name: user.name,
      picture: user.picture,
      email_verified: user.email_verified,
      sub: user.sub
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const redirectTo = state || 'https://bargain-drop.online/profile.html';
    return res.redirect(302, redirectTo + '#google-auth=' + encoded);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
