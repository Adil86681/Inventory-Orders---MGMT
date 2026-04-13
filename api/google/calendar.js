// Proxies requests to Google Calendar API
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'Missing access_token' });
  }

  try {
    // Get events for today and tomorrow
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    const params = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfTomorrow.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20'
    });

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Google Calendar: ' + err.message });
  }
};
