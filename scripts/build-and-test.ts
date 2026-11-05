import { rm } from 'node:fs/promises';
import { run } from './run.ts';

// Private entry: invoked only while locked.ts owns the machine-wide lock.
await rm('dist', { recursive: true, force: true });
await run('pnpm', ['exec', 'vite', 'build']);
await run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json']);
if (process.argv[2] === 'e2e') await run('pnpm', ['exec', 'playwright', 'test']);
