import { resolve } from 'node:path';
import { readEncryptionKeyFile } from './encryptionKey.js';

export interface AuthConfig {
  origin: string;
  secure: boolean;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  providerOrigin: string;
  apiOrigin: string;
  sessionSeconds: number;
}

export interface RuntimeConfig {
  host: string;
  port: number;
  dataDirectory: string;
  clientDirectory: string;
  serveClient: boolean;
  auth: AuthConfig | null;
}


function isLoopback(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
}

function readAuth(environment: NodeJS.ProcessEnv, directory: string): AuthConfig | null {
  const clientId = environment['GITHUB_CLIENT_ID'];
  const clientSecret = environment['GITHUB_CLIENT_SECRET'];
  const keyFile = environment['TOKEN_ENCRYPTION_KEY_FILE'];
  if (keyFile !== undefined && environment['TOKEN_ENCRYPTION_KEY'] !== undefined) {
    throw new Error('Choose TOKEN_ENCRYPTION_KEY_FILE or TOKEN_ENCRYPTION_KEY, not both.');
  }
  const key = keyFile === undefined ? environment['TOKEN_ENCRYPTION_KEY']
    : readEncryptionKeyFile(resolve(directory, keyFile));
  if (!clientId && !clientSecret && !key) return null;
  if (!clientId || !clientSecret || !key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('Configure GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and a 64-hex encryption key together.');
  }
  const origin = new URL(environment['APP_ORIGIN'] ?? 'http://127.0.0.1:3001');
  if (origin.href !== `${origin.origin}/` || origin.username || origin.password) {
    throw new Error('APP_ORIGIN must be an origin without credentials, path, query or fragment.');
  }
  const secure = origin.protocol === 'https:';
  if (!secure && !(origin.protocol === 'http:' && isLoopback(origin.hostname)
    && environment['ALLOW_LOOPBACK_HTTP'] === 'true')) {
    throw new Error('Authentication requires HTTPS or explicit ALLOW_LOOPBACK_HTTP=true on loopback.');
  }
  let providerOrigin = 'https://github.com';
  let apiOrigin = 'https://api.github.com';
  const override = environment['CONTROLLED_GITHUB_ORIGIN'];
  if (override) {
    const provider = new URL(override);
    if (environment['ENABLE_CONTROLLED_GITHUB'] !== 'true' || !isLoopback(origin.hostname)
      || !isLoopback(provider.hostname) || provider.protocol !== 'http:'
      || provider.href !== `${provider.origin}/` || provider.username || provider.password) {
      throw new Error('Controlled GitHub requires an explicitly enabled loopback-only test configuration.');
    }
    providerOrigin = provider.origin;
    apiOrigin = provider.origin;
  }
  const sessionSeconds = override ? Number(environment['CONTROLLED_SESSION_SECONDS'] ?? 604800) : 604800;
  if (!Number.isSafeInteger(sessionSeconds) || sessionSeconds < 1 || sessionSeconds > 604800) {
    throw new Error('Controlled session duration must be between 1 and 604800 seconds.');
  }
  return { origin: origin.origin, secure, clientId, clientSecret, encryptionKey: Buffer.from(key, 'hex'),
    providerOrigin, apiOrigin, sessionSeconds };
}
export function readConfig(environment: NodeJS.ProcessEnv, directory: string): RuntimeConfig {
  const serveClient = environment['NODE_ENV'] === 'production';
  const host = environment['HOST'] ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost', '0.0.0.0'].includes(host)) {
    throw new Error('HOST must be a loopback address, or explicitly 0.0.0.0 for a container network.');
  }

  const portValue = environment['PORT'] ?? (serveClient ? '3001' : '3002');
  if (!/^[0-9]+$/.test(portValue)) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const dataDirectory = environment['DATA_DIR'] ?? '.data';
  if (dataDirectory.trim() === '') {
    throw new Error('DATA_DIR must not be empty.');
  }

  return {
    host,
    port,
    dataDirectory: resolve(directory, dataDirectory),
    clientDirectory: resolve(directory, 'dist/client'),
    serveClient,
    auth: readAuth(environment, directory),
  };
}
