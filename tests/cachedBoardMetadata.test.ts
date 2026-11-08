import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/server/app.js';
import { readConfig } from '../src/server/config.js';
import { openStorage } from '../src/server/storage.js';
import { validateBoard } from '../src/shared/boards.js';
import { readCachedBoardMetadata } from '../src/shared/cachedMetadata.js';
import { isSessionResponse } from '../src/shared/session.js';
import { readSourceItem } from '../src/shared/sources.js';
import { startControlledGitHub } from '../scripts/controlled-github.js';

await test('board metadata returns scoped persisted cards immediately, marks old data stale and never revives denied caches', async (t) => {
  const origin = 'http://127.0.0.1:3118';
  const providerOrigin = 'http://127.0.0.1:3119';
  const directory = await mkdtemp(join(tmpdir(), 'gitbored-cached-board-'));
  let database = await openStorage(directory);
  const provider = await startControlledGitHub(3119);
  const config = readConfig({ GITHUB_CLIENT_ID: 'controlled-client', GITHUB_CLIENT_SECRET: 'controlled-secret',
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), APP_ORIGIN: origin, ALLOW_LOOPBACK_HTTP: 'true', DATA_DIR: directory,
    ENABLE_CONTROLLED_GITHUB: 'true', CONTROLLED_GITHUB_ORIGIN: providerOrigin }, process.cwd());
  let app = await createApp(config, database);
  async function login(identity: '101' | '202') {
    const start = await fetch(`${origin}/api/auth/github`, { redirect: 'manual' });
    const authorization = new URL(start.headers.get('location') ?? '');
    const binding = start.headers.getSetCookie()[0]?.split(';')[0];
    assert.ok(binding);
    authorization.searchParams.set('identity', identity);
    const consent = await fetch(authorization, { redirect: 'manual' });
    const callback = await fetch(consent.headers.get('location') ?? '', { redirect: 'manual', headers: { cookie: binding } });
    const cookie = callback.headers.getSetCookie().find((value) => value.startsWith('gitbored-session='))?.split(';')[0];
    assert.ok(cookie);
    const session: unknown = await (await fetch(`${origin}/api/session`, { headers: { cookie } })).json();
    assert.ok(isSessionResponse(session) && session.status === 'signed-in');
    return { cookie, 'x-csrf-token': session.csrfToken, origin, 'content-type': 'application/json' };
  }
  async function control(settings: Record<string, unknown>) {
    const response = await fetch(`${providerOrigin}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    assert.equal(response.status, 200);
  }
  async function sourceGate(action: 'arm' | 'release', target: 'issue-detail' | 'old-token-401') {
    const response = await fetch(`${providerOrigin}/__source-gate`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, target }) });
    assert.equal(response.status, 200);
  }
  async function waitForSource(target: 'issue-detail' | 'old-token-401') {
    await t.waitFor(async () => {
      const value: unknown = await (await fetch(`${providerOrigin}/__source-gate?target=${target}`)).json();
      return typeof value === 'object' && value !== null && 'entered' in value && value.entered === true;
    }, { interval: 10, timeout: 1000 });
  }
  try {
    await app.listen({ host: '127.0.0.1', port: 3118 });
    const headers = await login('101');
    const pageUrl = `${origin}/api/sources/repositories/alice/project/items?page=1`;
    const pageResponse = await fetch(pageUrl, { headers });
    assert.equal(pageResponse.status, 200);
    const repositoryPage: unknown = await pageResponse.json();
    async function resolve(path: string) {
      const response = await fetch(`${origin}/api/sources/resolve`, { method: 'POST', headers, body: JSON.stringify({ url: `https://github.com/alice/project/${path}` }) });
      assert.equal(response.status, 200);
      return readSourceItem(await response.json());
    }
    const issue = await resolve('issues/1');
    const pull = await resolve('pull/2');
    const unrelated = await resolve('issues/5');
    assert.match(issue.metadata.body ?? '', /^## Issue description/);
    assert.match(issue.metadata.body ?? '', /<script>window.fixtureBodyExecuted = true<\/script>/);
    assert.match(pull.metadata.body ?? '', /^## Pull request details/);
    const issueUrl = `${origin}/api/references/${issue.reference.id}`;
    assert.equal((await fetch(`${issueUrl}/context`, { headers })).status, 200);
    const created = await fetch(`${origin}/api/boards`, { method: 'POST', headers, body: JSON.stringify({ title: 'Cached board details' }) });
    assert.equal(created.status, 201);
    const board = validateBoard(await created.json());
    const shape = { id: 'shape:cached-card', typeName: 'shape', type: 'item-card', parentId: 'page:page', index: 'a1',
      x: 10, y: 20, rotation: 0, opacity: 1, isLocked: false, meta: {},
      props: { version: 1, referenceId: issue.reference.id, kind: 'issue', w: 280, h: 200, color: 'black' } };
    const saved = await fetch(`${origin}/api/boards/${board.id}`, { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 0,
      document: { ...board.document, snapshot: { ...board.document.snapshot, store: { ...board.document.snapshot.store, [shape.id]: shape } } },
      incoming: { version: 1, sources: [], seen: [issue.reference.id, pull.reference.id, unrelated.reference.id], queue: [{ referenceId: pull.reference.id, kind: 'pull-request' }] },
    }) });
    assert.equal(saved.status, 200);
    const batchUrl = `${origin}/api/boards/${board.id}/metadata`;
    async function batch() {
      const response = await fetch(batchUrl, { headers });
      assert.equal(response.status, 200);
      return readCachedBoardMetadata(await response.json());
    }
    await fetch(`${providerOrigin}/__source-stats/reset`, { method: 'POST' });
    const fresh = await batch();
    assert.deepEqual(fresh.items.map(({ item }) => item.reference.id).sort(), [issue.reference.id, pull.reference.id].sort());
    assert.ok(fresh.items.every((entry) => !entry.stale && entry.item.metadata.freshness === 'current'));
    const freshIssue = fresh.items.find(({ item }) => item.reference.id === issue.reference.id);
    assert.equal(freshIssue?.contextStale, false);
    assert.equal(freshIssue?.context?.projects[0]?.title, 'Delivery');
    assert.equal(fresh.items.find(({ item }) => item.reference.id === pull.reference.id)?.contextStale, true);
    await t.test('automatic token renewal reuses cards, repository pages and project context', async () => {
      // Arrange expiry at the persistence boundary; requests still run the real OAuth refresh flow.
      database.prepare('UPDATE users SET access_expires=? WHERE github_id=?').run(0, '101');
      assert.deepEqual(await batch(), fresh);
      assert.deepEqual(await (await fetch(`${providerOrigin}/__stats`)).json(), { refreshCount: 1, exchangeCount: 1, expiredAccessCount: 0 });
      assert.deepEqual(await (await fetch(issueUrl, { headers })).json(), issue);
      assert.deepEqual(await (await fetch(`${issueUrl}/context`, { headers })).json(), freshIssue?.context);
      assert.deepEqual(await (await fetch(pageUrl, { headers })).json(), repositoryPage);
      assert.deepEqual(await (await fetch(`${providerOrigin}/__source-stats`)).json(), { requests: [] });
    });
    await t.test('a delayed rejection of an old token does not evict the current user cache', async () => {
      await sourceGate('arm', 'old-token-401');
      const pending = fetch(`${origin}/api/sources/repositories/alice/project/items?page=2`, { headers, signal: AbortSignal.timeout(5000) });
      try {
        await waitForSource('old-token-401');
        database.prepare('UPDATE users SET access_expires=? WHERE github_id=?').run(0, '101');
        assert.deepEqual(await batch(), fresh);
      } finally {
        await sourceGate('release', 'old-token-401');
        assert.equal((await pending).status, 401);
      }
      assert.deepEqual(await batch(), fresh, 'Only a rejection of current authorization evicts the cache.');
      await fetch(`${providerOrigin}/__source-stats/reset`, { method: 'POST' });
    });
    // Arrange persisted historical data without a production clock/aging endpoint.
    database.prepare('UPDATE github_cache SET fetched_at=?').run(Date.now() - 16 * 60 * 1000);
    const stale = await batch();
    assert.ok(stale.items.every((entry) => entry.stale && entry.contextStale && entry.item.metadata.freshness === 'stale'));
    assert.deepEqual(stale.items.map(({ item }) => item.metadata.body), fresh.items.map(({ item }) => item.metadata.body));
    assert.deepEqual(stale.items.map(({ context }) => context), fresh.items.map(({ context }) => context));
    assert.deepEqual(await (await fetch(`${providerOrigin}/__source-stats`)).json(), { requests: [] });

    await t.test('upgrading an existing cache preserves stale content and supports new writes across restarts', async () => {
      await app.close();
      // Recreate the previous release's schema around real, publicly fetched fixture content.
      database.exec(`BEGIN IMMEDIATE;
        ALTER TABLE github_cache RENAME TO previous_github_cache;
        CREATE TABLE github_cache (
          user_id TEXT NOT NULL REFERENCES users(id), credential_hash TEXT NOT NULL,
          cache_key TEXT NOT NULL, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL,
          PRIMARY KEY(user_id, cache_key)
        );
        INSERT INTO github_cache SELECT user_id, 'previous-credential', cache_key, payload, fetched_at FROM previous_github_cache;
        DROP TABLE previous_github_cache;
        COMMIT;`);
      for (let restart = 0; restart < 2; restart += 1) {
        database.close();
        database = await openStorage(directory);
        app = await createApp(config, database);
        await app.listen({ host: '127.0.0.1', port: 3118 });
        assert.deepEqual(await batch(), stale, 'Migration and subsequent startup preserve content and freshness.');
        // Exercise an insert, without changing the board snapshot being compared.
        const added = await resolve('issues/7');
        assert.equal(added.metadata.locator.number, 7);
        await app.close();
      }
      app = await createApp(config, database);
      await app.listen({ host: '127.0.0.1', port: 3118 });
    });

    await control({ sourceDetailFailure: true });
    assert.equal((await fetch(`${issueUrl}?refresh=1`, { headers })).status, 502);
    assert.equal((await batch()).items.find(({ item }) => item.reference.id === issue.reference.id)?.stale, true);
    await control({ sourceDetailFailure: false });
    // An old entry without a body remains readable but must request enrichment.
    const { body: _body, ...legacyMetadata } = issue.metadata;
    database.prepare('UPDATE github_cache SET payload=?, fetched_at=? WHERE cache_key=?')
      .run(JSON.stringify({ ...issue, metadata: legacyMetadata }), Date.now(), `reference:${issue.reference.id}`);
    assert.equal((await batch()).items.find(({ item }) => item.reference.id === issue.reference.id)?.stale, true);
    const enriched = await fetch(issueUrl, { headers });
    assert.equal(enriched.status, 200);
    assert.equal(readSourceItem(await enriched.json()).metadata.body, issue.metadata.body);

    const bobHeaders = await login('202');
    assert.equal((await fetch(batchUrl, { headers: bobHeaders })).status, 404);
    assert.equal((await fetch(batchUrl)).status, 401);
    const beforeSignIn = await batch();
    const rotatedHeaders = await login('101');
    const rotated = await fetch(batchUrl, { headers: rotatedHeaders });
    assert.equal(rotated.status, 200);
    assert.deepEqual(await rotated.json(), beforeSignIn, 'The same user reuses cached data after signing in with a new credential.');
    assert.equal((await fetch(issueUrl, { headers: rotatedHeaders })).status, 200);
    await control({ sourceSsoRequired: true });
    assert.equal((await fetch(`${issueUrl}?refresh=1`, { headers: rotatedHeaders })).status, 403);
    const deniedCache = await fetch(batchUrl, { headers: rotatedHeaders });
    assert.equal(deniedCache.status, 200);
    assert.deepEqual(await deniedCache.json(), { items: [] });

    await t.test('authorization loss prevents an earlier response from repopulating the cache', async () => {
      await control({ sourceSsoRequired: false });
      await sourceGate('arm', 'issue-detail');
      const pending = fetch(`${issueUrl}?refresh=1`, { headers: rotatedHeaders, signal: AbortSignal.timeout(5000) });
      try {
        await waitForSource('issue-detail');
        await control({ revoke: true });
        const session: unknown = await (await fetch(`${origin}/api/session`, { headers: rotatedHeaders })).json();
        assert.ok(isSessionResponse(session) && session.status === 'signed-in' && session.authorization === 'reauthorize');
      } finally {
        await sourceGate('release', 'issue-detail');
        await pending;
      }
      const reconnectedHeaders = await login('101');
      const cache = await fetch(batchUrl, { headers: reconnectedHeaders });
      assert.equal(cache.status, 200);
      assert.deepEqual(await cache.json(), { items: [] }, 'A late response cannot restore data cleared by authorization loss.');
    });
  } finally {
    await app.close(); await provider.close(); database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
