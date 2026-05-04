// api/track.js — KeyDelivery proxy (runs server-side, no CORS issues)
const crypto = require('crypto');

const API_KEY = process.env.KD_API_KEY;
const SECRET  = process.env.KD_SECRET;

function sign(bodyStr) {
  return crypto.createHash('md5').update(bodyStr + API_KEY + SECRET).digest('hex').toUpperCase();
}

module.exports = async (req, res) => {
  // Allow requests from the same Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  const URLS = {
    detect: 'https://www.kd100.com/api/v1/carriers/detect',
    track:  'https://www.kd100.com/api/v1/tracking/realtime',
  };

  if (!URLS[action]) return res.status(400).json({ error: 'Invalid action. Use "detect" or "track".' });

  const bodyStr = JSON.stringify(params);

  try {
    const response = await fetch(URLS[action], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': API_KEY,
        'signature': sign(bodyStr),
      },
      body: bodyStr,
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
};
