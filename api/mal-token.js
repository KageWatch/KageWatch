export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier } = req.body || {};
  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'Code and code_verifier are required' });
  }

  const clientId = (process.env.MAL_CLIENT_ID || 'bc840070a0f2635e9e5139ca75929f27').trim();
  const clientSecret = (process.env.MAL_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.MAL_REDIRECT_URI || 'https://kage-watch.vercel.app/auth/mal').trim();

  console.log("MAL Token Exchange request received.");
  console.log("Using Client ID:", clientId);
  console.log("Has Client Secret:", !!clientSecret);
  console.log("Redirect URI:", redirectUri);

  try {
    const bodyParams = {
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      code_verifier: code_verifier,
      redirect_uri: redirectUri
    };

    if (clientSecret) {
      bodyParams.client_secret = clientSecret;
    }

    const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(bodyParams).toString()
    });

    const data = await response.json();
    if (response.ok) {
      console.log("MAL Token exchange successful!");
      res.status(200).json(data);
    } else {
      console.error("MAL API returned error status:", response.status);
      console.error("MAL API error payload:", data);
      res.status(response.status).json(data);
    }
  } catch (err) {
    console.error("Fetch Exception during MAL token exchange:", err.message);
    res.status(500).json({ error: err.message });
  }
}
