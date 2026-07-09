import * as fs from 'fs/promises';
import * as readline from 'readline/promises';
import { CONFIG_DIR, CONFIG_PATH } from '../constants';

interface Config {
  provider: 'anthropic';
  apiKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

/**
 * Resolves the Anthropic API key in priority order:
 *   1. JOB_APPLICATIONS_TRACE_API_KEY env var
 *   2. ANTHROPIC_API_KEY env var (convenience fallback)
 *   3. Saved config file at ~/.job-applications-trace/config.json
 *   4. Prompt the user once, then save for future runs
 */
export async function resolveApiKey(): Promise<string> {
  if (process.env.JOB_APPLICATIONS_TRACE_API_KEY) {
    return process.env.JOB_APPLICATIONS_TRACE_API_KEY;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw) as Config;
    if (config.apiKey) return config.apiKey;
  } catch {
    // no config yet — fall through to prompt
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const apiKey = (await rl.question('Enter your Anthropic API key: ')).trim();
  rl.close();

  if (!apiKey) {
    console.error(
      'No API key found. Provide one by:\n' +
      '  - Setting the JOB_APPLICATIONS_TRACE_API_KEY environment variable\n' +
      '  - Setting the ANTHROPIC_API_KEY environment variable\n' +
      '  - Re-running and entering it when prompted (it will be saved for future runs)'
    );
    process.exit(1);
  }

  await mergeConfig({ apiKey });
  console.log('API key saved to ~/.job-applications-trace/config.json');

  return apiKey;
}

/**
 * Saves Google OAuth credentials to the config file, preserving any existing fields.
 */
export async function saveGoogleCredentials(clientId: string, clientSecret: string): Promise<void> {
  await mergeConfig({ googleClientId: clientId, googleClientSecret: clientSecret });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return { provider: 'anthropic' };
  }
}

async function mergeConfig(partial: Partial<Config>): Promise<void> {
  const existing = await loadConfig();
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ ...existing, ...partial }, null, 2), 'utf-8');
}
