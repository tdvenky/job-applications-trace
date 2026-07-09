import { createOAuth2Client, hasGoogleCredentials, SCOPES, saveToken } from '../google/auth';
import { saveGoogleCredentials } from '../config';
import open from 'open';
import * as http from 'http';
import * as crypto from 'crypto';
import * as readline from 'readline/promises';
import { URL } from 'url';

const REDIRECT_PORT = 3000;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function runAuth(): Promise<void> {
  await ensureGoogleCredentials();

  const client = await createOAuth2Client();
  console.log('Opening browser for Google authentication...');
  const code = await waitForAuthCode(client);
  const { tokens } = await client.getToken(code);
  await saveToken(tokens);
  console.log('Authentication successful. Token saved.');
}

/**
 * If Google OAuth credentials are not yet configured, guides the user through
 * creating their own OAuth app in Google Cloud Console and saves the result.
 */
async function ensureGoogleCredentials(): Promise<void> {
  if (await hasGoogleCredentials()) return;

  console.log('\nThis tool needs a Google OAuth client ID and secret to access your Gmail and Calendar.');
  console.log('You need to create one in Google Cloud Console (one-time setup):\n');
  console.log('  1. Go to https://console.cloud.google.com/');
  console.log('  2. Create a project, then enable the Gmail API and Google Calendar API');
  console.log('  3. Go to Credentials -> Create Credentials -> OAuth client ID');
  console.log('  4. Choose "Desktop app" as the application type');
  console.log('  5. Under "Authorized redirect URIs", add: http://localhost:3000/oauth2callback');
  console.log('  6. Download or copy the Client ID and Client Secret\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const clientId = (await rl.question('Client ID: ')).trim();
  const clientSecret = (await rl.question('Client Secret: ')).trim();
  rl.close();

  if (!clientId || !clientSecret) {
    console.error('Client ID and Client Secret are both required.');
    process.exit(1);
  }

  await saveGoogleCredentials(clientId, clientSecret);
  console.log('Google credentials saved to ~/.job-applications-trace/config.json\n');
}

function waitForAuthCode(client: Awaited<ReturnType<typeof createOAuth2Client>>): Promise<string> {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString('hex');
    let settled = false;

    const finish = (err: Error | null, code?: string) => {
      if (settled) return;
      settled = true;
      server.close();
      if (err) reject(err);
      else resolve(code!);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const returnedState = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authentication complete. You can close this tab.</h1>');

      if (error) {
        finish(new Error(`OAuth error: ${error}`));
      } else if (returnedState !== state) {
        finish(new Error('State mismatch. Please try authenticating again.'));
      } else if (code) {
        finish(null, code);
      } else {
        finish(new Error('No authorization code received.'));
      }
    });

    // Start listening first, then open the browser so the server is ready
    // before Google redirects back.
    server.listen(REDIRECT_PORT, () => {
      const authUrl = client.generateAuthUrl({
        access_type: 'online',
        scope: SCOPES,
        prompt: 'select_account',
        state,
      });
      open(authUrl).catch(() => {
        console.log('Could not open browser automatically. Visit this URL:');
        console.log(authUrl);
      });
    });

    setTimeout(() => {
      finish(new Error(`Auth timed out after ${AUTH_TIMEOUT_MS / 1000}s.`));
    }, AUTH_TIMEOUT_MS);
  });
}
