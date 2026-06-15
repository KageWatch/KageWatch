export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, code_verifier } = req.body;

  // 1. Basic validation for incoming request body variables
  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'Missing code or code_verifier' });
  }

  try {
    // 2. Base64 encode the client credentials for HTTP Basic Auth
    const credentials = Buffer.from(
      `${process.env.MAL_CLIENT_ID}:${process.env.MAL_CLIENT_SECRET}`
    ).toString('base64');

    const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}` // Pass authorization credentials here
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://vercel.app',
        code_verifier // Unhashed plaintext verifier string (up to 128 characters)
      })
    });

    const data = await response.json();

    // 3. Handle unsuccessful status codes from MyAnimeList
    if (!response.ok) {
      return res.status(response.status).json({
        message: 'MyAnimeList OAuth error response received',
        details: data
      });
    }

    // 4. Return tokens securely to the client application
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
