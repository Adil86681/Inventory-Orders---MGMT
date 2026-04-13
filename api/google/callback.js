// Handles the Google OAuth2 callback — exchanges code for tokens
// and passes them back to the frontend via the URL fragment
module.exports = async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.send(`<script>window.opener.postMessage({type:'google-auth-error',error:'${error}'},'*');window.close();</script>`);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('Google OAuth credentials not configured.');
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${protocol}://${host}/api/google/callback`;

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResp.json();

    if (!tokenResp.ok) {
      return res.send(`<script>window.opener.postMessage({type:'google-auth-error',error:'${tokens.error_description || tokens.error}'},'*');window.close();</script>`);
    }

    // Send tokens back to the opener window via postMessage, then close the popup
    res.send(`
      <!DOCTYPE html>
      <html><body>
      <p>Authenticating... this window will close automatically.</p>
      <script>
        window.opener.postMessage({
          type: 'google-auth-success',
          access_token: '${tokens.access_token}',
          refresh_token: '${tokens.refresh_token || ''}',
          expires_in: ${tokens.expires_in || 3600}
        }, '*');
        window.close();
      </script>
      </body></html>
    `);
  } catch (err) {
    res.send(`<script>window.opener.postMessage({type:'google-auth-error',error:'${err.message}'},'*');window.close();</script>`);
  }
};
