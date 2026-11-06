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

await test('board metadata returns scoped persisted cards immediately, marks old data stale and never revives denied caches', async () => {
  const origin = 'http://127.0.0.1:3118';
  const providerOrigin = 'http://127.0.0.1:3119';
  const directory = await mkdtemp(join(tmpdir(), 'gitbored-cached-board-'));
  const database = await openStorage(directory);
  const provider = await startControlledGitHub(3119);
  const config = readConfig({ GITHUB_CLIENT_ID: 'controlled-client', GITHUB_CLIENT_SECRET: 'controlled-secret',
    TOKEN_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), APP_ORIGIN: origin, ALLOW_LOOPBACK_HTTP: 'true', DATA_DIR: directory,
    ENABLE_CONTROLLED_GITHUB: 'true', CONTROLLED_GITHUB_ORIGIN: providerOrigin }, process.cwd());
  const app = await createApp(config, database);
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
  try {
    await app.listen({ host: '127.0.0.1', port: 3118 });
    const headers = await login('101');
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
    // Arrange persisted historical data without a production clock/aging endpoint.
    database.prepare('UPDATE github_cache SET fetched_at=?').run(Date.now() - 16 * 60 * 1000);
    const stale = await batch();
    assert.ok(stale.items.every((entry) => entry.stale && entry.contextStale && entry.item.metadata.freshness === 'stale'));
    assert.deepEqual(stale.items.map(({ item }) => item.metadata.body), fresh.items.map(({ item }) => item.metadata.body));
    assert.deepEqual(stale.items.map(({ context }) => context), fresh.items.map(({ context }) => context));
    assert.deepEqual(await (await fetch(`${providerOrigin}/__source-stats`)).json(), { requests: [] });

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
    const rotatedHeaders = await login('101');
    const rotated = await fetch(batchUrl, { headers: rotatedHeaders });
    assert.equal(rotated.status, 200);
    assert.deepEqual(await rotated.json(), { items: [] }, 'Another credential cannot reuse earlier private data.');
    assert.equal((await fetch(issueUrl, { headers: rotatedHeaders })).status, 200);
    await control({ sourceSsoRequired: true });
    assert.equal((await fetch(`${issueUrl}?refresh=1`, { headers: rotatedHeaders })).status, 403);
    const deniedCache = await fetch(batchUrl, { headers: rotatedHeaders });
    assert.equal(deniedCache.status, 200);
    assert.deepEqual(await deniedCache.json(), { items: [] });
  } finally {
    await app.close(); await provider.close(); database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
