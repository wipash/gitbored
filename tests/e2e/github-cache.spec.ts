import { expect, test, type Page } from '@playwright/test';
import { readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, restartApplication } from './auth-support.js';

async function login(page: Page, identity = 'Alice'): Promise<Record<string, string>> {
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: `Authorize ${identity}`, exact: true }).click();
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in session');
  return { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
}

test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Configured source authorization is required.');

test('GitHub metadata, repository pages and project context survive reload and server restart without provider reads', async ({ page }) => {
  const headers = await login(page);
  const pageUrl = '/api/sources/repositories/alice/project/items?page=1';
  const firstPage = await page.request.get(`${pageUrl}&refresh=1`, { headers });
  expect(firstPage.ok()).toBe(true);
  const listed = readSourcePage(await firstPage.json(), readSourceItem);
  const issue = listed.items[0];
  if (!issue) throw new Error('Missing fixture issue');
  const referenceUrl = `/api/references/${issue.reference.id}`;
  const firstContext = await page.request.get(`${referenceUrl}/context?refresh=1`, { headers });
  expect(firstContext.ok()).toBe(true);
  expect(await firstContext.json()).toMatchObject({ status: 'ready', projects: [{ title: 'Delivery' }] });
  await page.reload();
  await restartApplication(page.request, 'original');
  await page.request.post(`${providerOrigin}/__source-stats/reset`);
  expect(await (await page.request.get(pageUrl, { headers })).json()).toEqual(await firstPage.json());
  expect(await (await page.request.get(referenceUrl, { headers })).json()).toEqual(issue);
  expect(await (await page.request.get(`${referenceUrl}/context`, { headers })).json()).toEqual(await firstContext.json());
  expect(await (await page.request.get(`${providerOrigin}/__source-stats`)).json()).toEqual({ requests: [] });

  // Refresh bypasses all three entries and returns changed provider content.
  await controlProvider(page.request, { sourceMode: 'empty' });
  expect(await (await page.request.get(`${pageUrl}&refresh=1`, { headers })).json()).toMatchObject({ items: [] });
  expect((await page.request.get(`${referenceUrl}?refresh=1`, { headers })).ok()).toBe(true);
  expect((await page.request.get(`${referenceUrl}/context?refresh=1`, { headers })).ok()).toBe(true);
  const reads = await (await page.request.get(`${providerOrigin}/__source-stats`)).text();
  expect(reads).toContain('/issues?');
  expect(reads).toContain('/issues/1');
  expect(reads).toContain('/graphql');
});

test('cached private metadata stays account scoped and a detected denial evicts old metadata', async ({ page, browser }) => {
  const headers = await login(page);
  const response = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/alice/project/issues/1' } });
  expect(response.ok()).toBe(true);
  const item = readSourceItem(await response.json());
  const referenceUrl = `/api/references/${item.reference.id}`;
  expect((await page.request.get(`${referenceUrl}/context`, { headers })).ok()).toBe(true);
  const bobContext = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await bobContext.newPage();
    const bobHeaders = await login(bob, 'Bob');
    expect((await bob.request.get(referenceUrl, { headers: bobHeaders })).status()).toBe(404);
    expect((await bob.request.get(`${referenceUrl}/context`, { headers: bobHeaders })).status()).toBe(404);
    expect((await bob.request.get('/api/sources/repositories/alice/project/items?page=1', { headers: bobHeaders })).status()).toBe(404);
  } finally { await bobContext.close(); }
  await controlProvider(page.request, { sourceDenied: true });
  expect((await page.request.get(`${referenceUrl}?refresh=1`, { headers })).status()).toBe(403);
  // A subsequent ordinary read cannot revive the formerly successful cache entry.
  expect((await page.request.get(referenceUrl, { headers })).status()).toBe(403);
  expect((await page.request.get(`${referenceUrl}/context`, { headers })).status()).toBe(403);
  await controlProvider(page.request, { sourceDenied: false });
  expect((await page.request.get(referenceUrl, { headers })).ok()).toBe(true);
});
