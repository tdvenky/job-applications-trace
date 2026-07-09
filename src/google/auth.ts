import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import { CONFIG_DIR, TOKEN_PATH, CONFIG_PATH } from '../constants';

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// Module-level cache — avoids re-reading the config file on every API call during a scan.
let _cachedCreds: { clientId: string; clientSecret: string } | null = null;

async function resolveCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (_cachedCreds) return _cachedCreds;

  const envClientId = process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    _cachedCreds = { clientId: envClientId, clientSecret: envClientSecret };
    return _cachedCreds;
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw) as Record<string, string>;
    if (config.googleClientId && config.googleClientSecret) {
      _cachedCreds = { clientId: config.googleClientId, clientSecret: config.googleClientSecret };
      return _cachedCreds;
    }
  } catch {
    // config not found or unreadable
  }

  throw new Error(
    'Google credentials not configured. Run `job-applications-trace auth` to set them up.'
  );
}

export async function createOAuth2Client(): Promise<OAuth2Client> {
  const { clientId, clientSecret } = await resolveCredentials();
  return new OAuth2Client(clientId, clientSecret, REDIRECT_URI);
}

/** Returns true if Google OAuth credentials are already saved (env var or config file). */
export async function hasGoogleCredentials(): Promise<boolean> {
  try {
    await resolveCredentials();
    return true;
  } catch {
    return false;
  }
}

export async function saveToken(tokens: Credentials): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  // mode 0o600: owner read/write only — token contains a Google OAuth credential
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function loadToken(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}
