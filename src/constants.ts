import * as path from 'path';
import * as os from 'os';

export const CONFIG_DIR = path.join(os.homedir(), '.job-applications-trace');
export const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const HISTORY_DIR = path.join(CONFIG_DIR, 'history');
