import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/server/app.js';
import { readConfig } from '../src/server/config.js';
import { openStorage } from '../src/server/storage.js';

await test('HTTP server failures log once with safe context and keep private data out of diagnostics', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gitbored-server-logging-'));
  const database = await openStorage(directory);
  const secret = 'PRIVATE_LOGGING_FIXTURE';
  const session = `${secret}_session`;
  const csrf = `${secret}_csrf`;
  const owner = `${secret}_owner`;
  const board = `${secret}_board`;
  const config = readConfig({ GITHUB_CLIENT_ID: 'controlled-client', GITHUB_CLIENT_SECRET: secret,
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), ALLOW_LOOPBACK_HTTP: 'true', DATA_DIR: directory }, process.cwd());
  database.prepare('INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)').run(owner, '101', secret);
  database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
    .run(createHash('sha256').update(session).digest('hex'), owner, csrf, Date.now() + 60_000);
  // A damaged persisted document makes the real owned-board route throw a SyntaxError
  // whose message includes private document text. No test-only application route is needed.
  database.prepare('INSERT INTO boards (id, owner_id, title, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(board, owner, secret, secret, Date.now(), Date.now());
  const app = await createApp(config, database);
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const headers = { cookie: `gitbored-session=${session}`, 'x-csrf-token': csrf,
      authorization: `Bearer ${secret}`, 'x-request-id': secret };
    const failed = await fetch(`${origin}/api/boards/${board}?private=${secret}`, { headers });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'Internal server error' });
    assert.equal(logged.length, 1, 'One diagnostic per failed HTTP request.');
    const requestId = failed.headers.get('x-request-id');
    assert.match(requestId ?? '', /^[a-f0-9-]{36}$/);
    assert.deepEqual(JSON.parse(String(logged[0]?.[0])), {
      event: 'server_request_failed', level: 'error', requestId, method: 'GET',
      route: '/api/boards/:id', statusCode: 500, errorType: 'SyntaxError',
    });

    const denied = await fetch(`${origin}/api/boards/${board}`);
    assert.equal(denied.status, 401);
    const missing = await fetch(`${origin}/missing/${secret}`);
    assert.equal(missing.status, 404);
    const malformed = await fetch(`${origin}/api/boards`, { method: 'POST',
      headers: { ...headers, origin: config.auth?.origin ?? '', 'content-type': 'application/json' }, body: secret });
    assert.equal(malformed.status, 400);
    assert.equal(logged.length, 1, 'Expected client errors are not server-error diagnostics.');

    database.close();
    const unavailable = await fetch(`${origin}/api/health?private=${secret}`, { headers });
    assert.equal(unavailable.status, 500);
    assert.equal(logged.length, 2);
    assert.deepEqual(JSON.parse(String(logged[1]?.[0])), {
      event: 'server_request_failed', level: 'error', requestId: unavailable.headers.get('x-request-id'),
      method: 'GET', route: '/api/health', statusCode: 500, errorType: 'Error', code: 'ERR_INVALID_STATE',
    });
    assert.notEqual(requestId, unavailable.headers.get('x-request-id'));
    assert.equal(JSON.stringify(logged).includes(secret), false, 'Never log private paths, queries, headers, or exception messages.');
  } finally {
    await app.close();
    if (database.isOpen) database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
