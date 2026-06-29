export default async function handler(req, res) {
  const { code, state } = req.query;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://bargain-drop-preview-v10.vercel.app/api/google-callback';

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
      }).toString()
    });
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return res.status(400).json({ error: 'Token exchange failed', detail: tokens });
    }

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    // Build profile payload for frontend
    const payload = {
      email: user.email,
      name: user.name,
      picture: user.picture,
      email_verified: user.email_verified,
      sub: user.sub,
      access_token: tokens.access_token,
      id_token: tokens.id_token
    };

    // Redirect back to auth page with token in URL fragment
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const redirectTo = state || '/';
    res.writeHead(302, { Location: `${redirectTo}#google-auth=${encoded}` });
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
