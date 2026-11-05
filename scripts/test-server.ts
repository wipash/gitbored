import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startControlledGitHub } from './controlled-github.js';

const directory = await mkdtemp(join(tmpdir(), 'gitbored-e2e-'));
const configured = process.env['E2E_AUTH_MODE'] !== 'unconfigured';
const keys = { original: '1234567890abcdef'.repeat(4), replacement: 'abcdef1234567890'.repeat(4) };
let child: ChildProcess | undefined;
let restarting = false;
let stopping = false;
let finish: (() => void) | undefined;
const stopped = new Promise<void>((resolve) => { finish = resolve; });

async function startApplication(encryptionKey: string): Promise<ChildProcess> {
  const application = spawn(process.execPath, ['dist/server/server/main.js'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3100', DATA_DIR: directory,
      APP_ORIGIN: 'http://127.0.0.1:3100', ALLOW_LOOPBACK_HTTP: 'true',
      GITHUB_CLIENT_ID: configured ? 'controlled-client' : '', GITHUB_CLIENT_SECRET: configured ? 'controlled-secret' : '',
      TOKEN_ENCRYPTION_KEY: configured ? encryptionKey : '', ENABLE_CONTROLLED_GITHUB: 'true',
      CONTROLLED_GITHUB_ORIGIN: 'http://127.0.0.1:3101', CONTROLLED_SESSION_SECONDS: process.env['CONTROLLED_SESSION_SECONDS'] ?? '10' },
  });
  return await new Promise<ChildProcess>((resolve, reject) => {
    let ready = false;
    application.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(data);
      if (data.toString().includes('GitBored local runtime listening at')) {
        ready = true;
        resolve(application);
      }
    });
    application.once('error', (cause) => reject(new Error('Cannot start production test server', { cause })));
    application.once('exit', (code, signal) => {
      if (!ready) reject(new Error('Production test server exited before readiness.'));
      if (!restarting && !stopping) {
        process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
        finish?.();
      }
    });
  });
}

async function stopApplication(): Promise<void> {
  const application = child;
  if (!application || application.exitCode !== null || application.signalCode !== null) return;
  const exited = once(application, 'exit');
  application.kill('SIGTERM');
  await exited;
}

const provider = await startControlledGitHub(3101, (app) => {
  // Test-process lifecycle only: no application route, database mutation or authentication bypass.
  app.post('/__runner/restart', async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || !('key' in body)
      || (body.key !== 'original' && body.key !== 'replacement')) return reply.code(400).send({ error: 'Choose a test key.' });
    if (restarting || stopping) return reply.code(409).send({ error: 'Runner is already transitioning.' });
    restarting = true;
    try {
      await stopApplication();
      child = await startApplication(keys[body.key]);
      return { ready: true };
    } catch {
      process.exitCode = 1;
      finish?.();
      return reply.code(503).send({ error: 'Unable to restart production test server.' });
    } finally {
      restarting = false;
    }
  });
});
function terminate(): void {
  stopping = true;
  finish?.();
}
process.once('SIGINT', terminate);
process.once('SIGTERM', terminate);
try {
  child = await startApplication(keys.original);
  await stopped;
} finally {
  stopping = true;
  process.removeListener('SIGINT', terminate);
  process.removeListener('SIGTERM', terminate);
  await provider.close();
  await stopApplication();
  await rm(directory, { recursive: true, force: true });
}
