/**
 * Vercel Serverless Function — Health Check
 * GET /api/health
 */

const fetch = require('node-fetch');

const AUTH_URL    = 'https://auth.firstbasehq.com/oauth2/default/v1/token';
const CLIENT_ID   = process.env.FB_CLIENT_ID    || '0oau04j3bsve6vpjw5d7';
const CLIENT_SECRET = process.env.FB_CLIENT_SECRET || 'MiwE0mSx9MiCDT5sc9NRCfKM2svJ0dgGYQljA77dxd5CneM-JzfH_OKW6oP3fMGI';
const BASIC_AUTH  = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

module.exports = async function handler(req, res) {
  try {
    const tokenRes = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${BASIC_AUTH}`
      },
      body: 'grant_type=client_credentials&scope=firstbase:m2m:read-only'
    });
    const data = await tokenRes.json();
    return res.status(200).json({
      status: data.access_token ? 'ok' : 'error',
      hasToken: !!data.access_token
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
};
