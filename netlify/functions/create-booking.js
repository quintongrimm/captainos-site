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

  let captain_id, date, start_time, trip_type, party_size, customer_name, customer_phone;
  try {
    ({ captain_id, date, start_time, trip_type, party_size, customer_name, customer_phone } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid request' }) };
  }

  const tokens = await getCaptainTokens(captain_id);
  if (!tokens?.google_refresh_token) {
    return {
      statusCode: 200,
      body: JSON.stringify({ success: false, message: 'Calendar not connected — the captain will follow up to confirm your booking.' })
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: tokens.google_refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const durationHours = trip_type?.toLowerCase().includes('full') ? 8 : 4;
  const tripStart = new Date(`${date}T${start_time || '07:00:00'}-04:00`);
  const tripEnd = new Date(tripStart.getTime() + durationHours * 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `${trip_type || 'Charter Trip'} — ${customer_name} (${party_size || '?'} people)`,
      description: [
        `Customer: ${customer_name}`,
        `Phone: ${customer_phone}`,
        `Party size: ${party_size}`,
        `Trip type: ${trip_type}`,
        '',
        'Booked via Dock Desk / Marina',
        'Status: Tentative — confirm deposit to lock in'
      ].join('\n'),
      start: { dateTime: tripStart.toISOString() },
      end: { dateTime: tripEnd.toISOString() },
      colorId: '2', // green
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 },
          { method: 'popup', minutes: 2 * 60 }
        ]
      }
    }
  });

  const formatted = tripStart.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      success: true,
      event_id: event.data.id,
      message: `You're all set, ${customer_name}! I've got you tentatively booked for ${formatted}. The captain will reach out to confirm and send deposit info. You'll hear from them within a few hours.`
    })
  };
};
