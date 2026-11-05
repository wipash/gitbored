import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'gitbored-e2e-'));
try {
  const child = spawn(process.execPath, ['dist/server/server/main.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3100', DATA_DIR: directory },
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
  await rm(directory, { recursive: true, force: true });
}
