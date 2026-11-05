import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startControlledGitHub } from './controlled-github.js';

const directory = await mkdtemp(join(tmpdir(), 'gitbored-e2e-'));
const provider = await startControlledGitHub();
const configured = process.env['E2E_AUTH_MODE'] !== 'unconfigured';
try {
  const child = spawn(process.execPath, ['dist/server/server/main.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3100', DATA_DIR: directory,
      APP_ORIGIN: 'http://127.0.0.1:3100', ALLOW_LOOPBACK_HTTP: 'true',
      GITHUB_CLIENT_ID: configured ? 'controlled-client' : '', GITHUB_CLIENT_SECRET: configured ? 'controlled-secret' : '',
      TOKEN_ENCRYPTION_KEY: configured ? '1234567890abcdef'.repeat(4) : '', ENABLE_CONTROLLED_GITHUB: 'true',
      CONTROLLED_GITHUB_ORIGIN: 'http://127.0.0.1:3101', CONTROLLED_SESSION_SECONDS: process.env['CONTROLLED_SESSION_SECONDS'] ?? '10' },
  });
  const interrupt = (): void => { child.kill('SIGINT'); };
  const terminate = (): void => { child.kill('SIGTERM'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', (cause) => reject(new Error('Cannot start production test server', { cause })));
      child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1)));
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
} finally {
  await provider.close();
  await rm(directory, { recursive: true, force: true });
}
