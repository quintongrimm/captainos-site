const { google } = require('googleapis');

async function getCaptainTokens(captainId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Captains?filterByFormula=%7Bcaptain_id%7D%3D%22${encodeURIComponent(captainId)}%22`,
    { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

exports.handler = async (event) => {
  // Handle CORS preflight from Bland.ai
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let captain_id, date;
  try {
    ({ captain_id, date } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ available: false, message: 'Invalid request' }) };
  }

  if (!captain_id || !date) {
    return { statusCode: 400, body: JSON.stringify({ available: false, message: 'Missing captain_id or date' }) };
  }

  const tokens = await getCaptainTokens(captain_id);
  if (!tokens?.google_refresh_token) {
    return {
      statusCode: 200,
      body: JSON.stringify({ available: false, message: 'Calendar not connected — the captain will confirm availability.' })
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: tokens.google_refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Check free/busy for the full day in Eastern time
  const timeMin = new Date(`${date}T00:00:00-04:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59-04:00`).toISOString();

  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: 'primary' }]
    }
  });

  const busy = freebusy.data.calendars.primary.busy || [];
  const available = busy.length === 0;

  const formatted = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      available,
      message: available
        ? `${formatted} is open. Would you like to go ahead and book it?`
        : `${formatted} is already taken. Can I check a different date for you?`
    })
  };
};
