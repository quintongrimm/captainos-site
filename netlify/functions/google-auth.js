const { google } = require('googleapis');

exports.handler = async (event) => {
  const captainId = event.queryStringParameters?.captain_id;

  if (!captainId) {
    return { statusCode: 400, body: 'Missing captain_id' };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SITE_URL}/.netlify/functions/google-callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: captainId,
    prompt: 'consent'
  });

  return {
    statusCode: 302,
    headers: { Location: authUrl }
  };
};
