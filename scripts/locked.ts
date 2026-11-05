import { spawn } from 'node:child_process';
import { join } from 'node:path';

const mode = process.argv[2];
if (mode !== 'build' && mode !== 'e2e') throw new Error('Expected build or e2e');
if (!process.getuid) throw new Error('The build lock requires a POSIX host');
// Deliberately independent of checkout and TMPDIR: every worktree shares one lock.
const lock = join('/tmp', `gitbored-build-${process.getuid()}.lock`);
const child = spawn('flock', ['--exclusive', '--close', lock, 'pnpm', 'exec', 'tsx', 'scripts/build-and-test.ts', mode], {
  stdio: 'inherit', detached: true,
});
function stop(signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try { process.kill(-child.pid, signal); }
  catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
child.once('error', (cause) => { throw new Error('Cannot acquire the build lock', { cause }); });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
