/**
 * Vercel Serverless Function — /api/graphql
 *
 * Proxies GraphQL requests to the Firstbase API.
 * Handles OAuth client_credentials token exchange server-side
 * (required because Firstbase auth blocks browser token requests).
 */

const AUTH_TOKEN_URL = 'https://auth.firstbasehq.com/oauth2/default/v1/token';
const AUTH_BASIC     = 'Basic MG9hdTA0ajNic3ZlNnZwanc1ZDc6TWl3RTBtU3g5TWlDRFQ1c2M5TlJDZktNMnN2SjBkZ0dZUWxqQTc3ZHhkNUNuZU0tSnpmSF9PS1c2b1AzZk1HSQ==';
const AUTH_SCOPE     = 'firstbase:service-accounts';
const GRAPHQL_URL    = 'https://api.firstbasehq.com/graphql';

// Token cache (persists across warm invocations on the same Vercel instance)
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const res = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': AUTH_BASIC
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(AUTH_SCOPE)}`
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Token request failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getAccessToken();

    const apiRes = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (err) {
    console.error('[api/graphql] Proxy error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
