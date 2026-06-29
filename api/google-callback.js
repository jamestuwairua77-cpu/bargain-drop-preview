export default async function handler(req, res) {
  const { code, state } = req.query;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '489382559871-t7hh34fgbr23vkifi1u8kd9s7dolrv20.apps.googleusercontent.com';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const REDIRECT_URI = 'https://bargain-drop-preview-v10.vercel.app/api/google-callback';

  console.log('Google callback hit - code present:', !!code);

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    // Exchange code for tokens using URLSearchParams
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', GOOGLE_CLIENT_ID);
    params.append('client_secret', GOOGLE_CLIENT_SECRET);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');

    console.log('Exchanging code for token...');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const tokens = await tokenRes.json();
    console.log('Token response:', JSON.stringify({ has_access_token: !!tokens.access_token, error: tokens.error || null }));

    if (!tokens.access_token) {
      return res.status(400).json({ error: 'Token exchange failed', detail: tokens });
    }

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token }
    });
    const user = await userRes.json();
    console.log('User info:', user.email);

    // Build profile payload
    const payload = {
      email: user.email,
      name: user.name,
      picture: user.picture,
      email_verified: user.email_verified,
      sub: user.sub,
      access_token: tokens.access_token,
      id_token: tokens.id_token
    };

    // Redirect back with token in URL fragment
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const redirectTo = state || 'https://bargain-drop-preview-v10.vercel.app/profile.html';
    res.writeHead(302, { Location: redirectTo + '#google-auth=' + encoded });
    res.end();
  } catch (e) {
    console.error('Google callback error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
