import { resolve } from 'node:path';

export interface RuntimeConfig {
  host: string;
  port: number;
  dataDirectory: string;
  clientDirectory: string;
  serveClient: boolean;
}

export function readConfig(environment: NodeJS.ProcessEnv, directory: string): RuntimeConfig {
  const serveClient = environment['NODE_ENV'] === 'production';
  const host = environment['HOST'] ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new Error('HOST must be a loopback address for the local runtime.');
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
  };
}
