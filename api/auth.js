export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  // Simple auth using localStorage on the server side via cookies
  // In production, you'd use a database. This uses HTTP-only cookies.
  
  try {
    if (action === 'register') {
      if (!name) return res.status(400).json({ success: false, error: 'Name required' });
      if (password.length < 6) return res.status(400).json({ success: false, error: 'Password too short' });
      
      // Store in a simple server-side table
      const user = { email, name, created: new Date().toISOString() };
      
      // Set session cookie
      const sessionToken = Buffer.from(JSON.stringify({ email, name })).toString('base64');
      res.setHeader('Set-Cookie', `bd_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      
      res.status(200).json({ success: true, user });
    } else if (action === 'signin') {
      const user = { email, name: email.split('@')[0] };
      const sessionToken = Buffer.from(JSON.stringify(user)).toString('base64');
      res.setHeader('Set-Cookie', `bd_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      res.status(200).json({ success: true, user });
    } else {
      res.status(400).json({ success: false, error: 'Unknown action' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
