const { google } = require('googleapis');

async function upsertCaptain(captainId, tokens) {
  const base = process.env.AIRTABLE_BASE_ID;
  const key = process.env.AIRTABLE_API_KEY;
  const headers = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  // Check if captain already exists
  const search = await fetch(
    `https://api.airtable.com/v0/${base}/Captains?filterByFormula=%7Bcaptain_id%7D%3D%22${encodeURIComponent(captainId)}%22`,
    { headers }
  );
  const existing = await search.json();
  const record = existing.records?.[0];

  const fields = {
    captain_id: captainId,
    google_access_token: tokens.access_token,
    token_expiry: new Date(tokens.expiry_date).toISOString(),
    connected_at: new Date().toISOString()
  };
  // Only store refresh token if Google sent one (they only send it on first auth)
  if (tokens.refresh_token) fields.google_refresh_token = tokens.refresh_token;

  if (record) {
    await fetch(`https://api.airtable.com/v0/${base}/Captains/${record.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields })
    });
  } else {
    await fetch(`https://api.airtable.com/v0/${base}/Captains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields })
    });
  }
}

exports.handler = async (event) => {
  const { code, state: captainId, error } = event.queryStringParameters || {};

  if (error || !code || !captainId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:4rem;">
        <h2>Connection failed</h2>
        <p>Something went wrong connecting your Google Calendar. Please contact us at captainoshq@gmail.com</p>
      </body></html>`
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SITE_URL}/.netlify/functions/google-callback`
  );

  const { tokens } = await oauth2Client.getToken(code);
  await upsertCaptain(captainId, tokens);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Calendar Connected — CaptainOS</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Crimson+Pro:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a1628; color: #f2ede6; font-family: 'Crimson Pro', Georgia, serif; font-weight: 300; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { max-width: 500px; padding: 3rem 2rem; text-align: center; }
  .icon { font-size: 3rem; margin-bottom: 1.5rem; }
  h1 { font-family: 'Bebas Neue', sans-serif; font-size: 3rem; letter-spacing: 0.06em; color: #1D9E75; margin-bottom: 1rem; }
  p { font-size: 1.1rem; color: #a8d4f5; line-height: 1.6; margin-bottom: 0.75rem; }
  .note { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: #8a9bb0; margin-top: 2rem; }
  a { color: #2d7dd2; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">⚓</div>
    <h1>You're Connected</h1>
    <p>Google Calendar is linked to your Dock Desk agent. Marina can now check your availability and book trips in real time.</p>
    <p>Head out fishing — we've got the dock covered.</p>
    <p class="note">Questions? <a href="mailto:captainoshq@gmail.com">captainoshq@gmail.com</a></p>
  </div>
</body>
</html>`
  };
};
