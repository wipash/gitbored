import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) continue;
    try { process.kill(-child.pid, 'SIGTERM'); }
    catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
    }
  }
}
for (const args of [['exec', 'tsx', 'watch', 'src/server/main.ts'], ['exec', 'vite']]) {
  const child = spawn('pnpm', args, {
    stdio: 'inherit', detached: true,
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: process.env['PORT'] ?? '3002' },
  });
  children.push(child);
  child.once('error', (cause) => {
    console.error(new Error('Cannot start development process', { cause }));
    stop(1);
  });
  child.once('exit', (code) => stop(code ?? 1));
}
process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));
