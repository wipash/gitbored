import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createApp } from '../src/server/app.js';
import { readConfig } from '../src/server/config.js';
import { openStorage } from '../src/server/storage.js';

await test('public runtime configuration reflects licence changes without exposing server credentials or executing key content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gitbored-config-'));
  const database = await openStorage(directory);
  try {
    for (const key of [undefined, 'synthetic-public-key', '"; window.injected = true; // </script>']) {
      const config = readConfig({ DATA_DIR: directory, GITHUB_CLIENT_ID: 'private-client',
        GITHUB_CLIENT_SECRET: 'private-client-secret', TOKEN_ENCRYPTION_KEY: 'b'.repeat(64),
        APP_ORIGIN: 'http://127.0.0.1:3001', ALLOW_LOOPBACK_HTTP: 'true', TLDRAW_KEY: key }, directory);
      const app = await createApp(config, database);
      try {
        const origin = await app.listen({ host: '127.0.0.1', port: 0 });
        const response = await fetch(`${origin}/api/client-config.js`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') ?? '', /application\/javascript/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const script = await response.text();
        const window: Record<string, unknown> = {};
        runInNewContext(script, { window });
        assert.equal(JSON.stringify(window), JSON.stringify({ gitboredConfig: { tldrawKey: key ?? null } }));
        for (const secret of ['private-client', 'private-client-secret', 'b'.repeat(64)]) assert.ok(!script.includes(secret));
      } finally { await app.close(); }
    }
  } finally { database.close(); await rm(directory, { recursive: true, force: true }); }
});
