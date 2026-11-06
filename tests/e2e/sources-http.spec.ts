import { expect, test } from '@playwright/test';
import { readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, restartApplication, signIn } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Configured source authorization is required.');
test.beforeEach(async ({ request }) => {
  await controlProvider(request, { reset: true });
  expect((await request.post(`${providerOrigin}/__source-stats/reset`)).ok()).toBe(true);
  expect((await request.post(`${providerOrigin}/__source-gate`, { data: { action: 'reset' } })).ok()).toBe(true);
});

test('lossless identities, current-user reference access and authorized URL reads survive restart', async ({ page, browser }) => {
  await signIn(page);
  const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('Expected session');
  const headers = { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
  const first = await page.request.get('/api/sources/repositories/alice/project/items?page=1', { headers });
  expect(first.status()).toBe(200);
  const listed = readSourcePage(await first.json(), readSourceItem);
  expect(listed.items[0]?.reference.repositoryRestId).toBe('9007199254740993');
  expect(listed.items[0]?.reference.issueRestId).toBe('9007199254741002');
  expect(listed.items[1]?.metadata.state).toBe('unknown');
  const referenceId = listed.items[0]?.reference.id; expect(referenceId).toBeTruthy();
  const otherRepo = await page.request.get('/api/sources/repositories/alice/other/items?page=1', { headers });
  const otherItems = readSourcePage(await otherRepo.json(), readSourceItem);
  expect(otherItems.items[0]?.reference.id).not.toBe(referenceId);
  const pull = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/alice/project/pull/2' } });
  expect(pull.status()).toBe(200);
  const enriched = readSourceItem(await pull.json());
  expect(enriched.reference.issueRestId).toBe('9007199254741003');
  expect(enriched.reference.pullRequestRestId).toBe('9007199254741999');
  expect(enriched.metadata.state).toBe('merged');
  expect(enriched.reference.id).toBe(listed.items[1]?.reference.id);
  await controlProvider(page.request, { pullUnavailable: true });
  const unknown = await page.request.get(`/api/references/${enriched.reference.id}?refresh=1`, { headers });
  expect(unknown.status()).toBe(200);
  expect(readSourceItem(await unknown.json()).metadata.state).toBe('unknown');
  expect(readSourceItem(await unknown.json()).reference.pullRequestRestId).toBe('9007199254741999');
  await restartApplication(page.request, 'original');
  const persisted = await page.request.get(`/api/references/${referenceId ?? ''}`, { headers });
  expect(persisted.status()).toBe(200);
  expect(readSourceItem(await persisted.json()).reference.id).toBe(referenceId);
  const bobContext = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await bobContext.newPage(); await signIn(bob, 'Bob');
    const bobSession = await currentSession(bob.request); if (bobSession.status !== 'signed-in') throw new Error('Expected Bob');
    const bobHeaders = { 'x-csrf-token': bobSession.csrfToken };
    expect((await bob.request.get(`/api/references/${referenceId ?? ''}`, { headers: bobHeaders })).status()).toBe(404);
    expect((await bob.request.get('/api/sources/repositories/alice/project/items?page=1', { headers: bobHeaders })).status()).toBe(404);
    const publicResult = await bob.request.post('/api/sources/resolve', { headers: { origin: applicationOrigin, 'x-csrf-token': bobSession.csrfToken }, data: { url: 'https://github.com/public/outside/issues/1' } });
    expect(publicResult.status()).toBe(200);
    expect(readSourceItem(await publicResult.json()).metadata.locator.owner).toBe('public');
    await expect(bob.getByText('alice private issue', { exact: false })).toHaveCount(0);
  } finally { await bobContext.close(); }
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain('private issue');
});

test('invalid URLs, cursors, payloads and pagination links never become arbitrary provider requests', async ({ page, request }) => {
  expect((await request.get('/api/sources/installations')).status()).toBe(401);
  await signIn(page);
  const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('Expected session');
  const headers = { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
  expect((await page.request.post('/api/sources/resolve', { data: { url: 'https://github.com/alice/project/issues/1' } })).status()).toBe(403);
  await request.post(`${providerOrigin}/__source-stats/reset`);
  for (const url of ['http://github.com/alice/project/issues/1', 'https://evil.example/alice/project/issues/1', 'https://github.com@evil.example/a/b/pull/2', 'https://github.com/a/b/issues/1?x=1', 'https://github.com/a/b/issues/1#body', 'https://github.com/a/%2e%2e/issues/1', 'https://github.com/a/b/issues/9007199254740993', 'https://github.com/a/b/../../a/b/issues/1']) {
    expect((await page.request.post('/api/sources/resolve', { headers, data: { url } })).status()).toBe(400);
  }
  for (const pageValue of ['0', '-1', '1.5', '10001', 'NaN', '1&page=2']) expect((await page.request.get(`/api/sources/installations?page=${pageValue}`, { headers })).status()).toBe(400);
  expect(await (await request.get(`${providerOrigin}/__source-stats`)).json()).toEqual({ requests: [] });
  await controlProvider(request, { sourceMode: 'malformed' });
  expect((await page.request.get('/api/sources/installations', { headers })).status()).toBe(502);
  expect((await page.request.get('/api/sources/repositories/alice/project/items', { headers })).status()).toBe(502);
  await controlProvider(request, { sourceMode: 'untrusted-link' });
  expect((await page.request.get('/api/sources/repositories/alice/project/items', { headers })).status()).toBe(502);
  await controlProvider(request, { sourceMode: 'normal' });
  const missing = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/missing/project/issues/1' } });
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('organization approval');
});

