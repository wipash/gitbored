import { expect, test, type Page } from '@playwright/test';
import { createEmptyBoardDocument, validateBoard } from '../../src/shared/boards.js';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => {
  await controlProvider(request, { reset: true });
  expect((await request.post(`${providerOrigin}/__source-gate`, { data: { action: 'reset' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  expect((await request.post(`${providerOrigin}/__source-gate`, { data: { action: 'reset' } })).ok()).toBe(true);
});

async function cachedBoard(page: Page) {
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  const headers = { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
  const items = [];
  for (const number of [1, 5]) {
    const response = await page.request.post('/api/sources/resolve', { headers, data: { url: `https://github.com/alice/project/issues/${number}` } });
    expect(response.ok()).toBe(true);
    const item = readSourceItem(await response.json());
    items.push(item);
    expect((await page.request.get(`/api/references/${item.reference.id}/context`, { headers })).ok()).toBe(true);
  }
  const created = await page.request.post('/api/boards', { headers, data: { title: 'Cached board snapshot' } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  const document = createEmptyBoardDocument();
  const cards = items.map((item, index) => ({ id: `shape:cached-${index}`, typeName: 'shape', type: 'item-card', parentId: 'page:page', index: `a${index + 1}`, x: 100 + index * 370, y: 100,
    rotation: 0, opacity: 1, isLocked: false, meta: {}, props: { version: 1, color: 'black', referenceId: item.reference.id, kind: item.reference.kind, w: 320, h: 240 } }));
  expect((await page.request.put(`/api/boards/${board.id}`, { headers, data: { expectedRevision: board.revision, incoming: board.incoming,
    document: { ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, ...Object.fromEntries(cards.map((card) => [card.id, card])) } } } } })).ok()).toBe(true);
  return { board, items };
}

test('cached cards survive a new sign-in, load together and remain readable through refresh and transient failure', async ({ page }, testInfo) => {
  const { board, items } = await cachedBoard(page);
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await expect(page.locator('.desktop-app')).toBeVisible();
  await page.goto('/boards');
  expect((await page.request.post(`${providerOrigin}/__source-stats/reset`)).ok()).toBe(true);
  const browserReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/references/') || path === `/api/boards/${board.id}/metadata`) browserReads.push(path);
  });
  // Hold the real batch response unchanged: the canvas must not mount with empty card metadata.
  let releaseBatch = () => {};
  const batchHold = new Promise<void>((resolve) => { releaseBatch = resolve; });
  let batchArrived = () => {};
  const batchReady = new Promise<void>((resolve) => { batchArrived = resolve; });
  await page.route(`**/api/boards/${board.id}/metadata`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    batchArrived();
    await batchHold;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.goto(`/boards/${board.id}`);
  await batchReady;
  await expect(page.locator('.tl-container')).toHaveCount(0);
  expect(browserReads).toEqual([`/api/boards/${board.id}/metadata`]);
  releaseBatch();
  await expect(page.locator('.workspace-card')).toHaveCount(2);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:cached-${index}"]`)).toContainText(item.metadata.title);
  expect(browserReads).toEqual([`/api/boards/${board.id}/metadata`]);
  const editor = await page.locator('.tl-container').elementHandle();
  if (!editor) throw new Error('Missing native editor');
  // Repository discovery may run independently; cached card content needs no item or context reads.
  const providerStats = await page.request.get(`${providerOrigin}/__source-stats`);
  expect(providerStats.ok()).toBe(true);
  const providerReads = await providerStats.text();
  expect(providerReads).not.toContain('/repos/');
  expect(providerReads).not.toContain('/graphql');
  expect((await page.request.post(`${providerOrigin}/__source-gate`, { data: { action: 'arm', target: 'issue-detail' } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(async () => {
    const value: unknown = await (await page.request.get(`${providerOrigin}/__source-gate?target=issue-detail`)).json();
    return typeof value === 'object' && value !== null && 'entered' in value && value.entered === true;
  }).toBe(true);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:cached-${index}"]`)).toContainText(item.metadata.title);
  await expect(page.getByRole('status', { name: 'Refreshing card' }).first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Refreshing card' }).first().locator('.app-icon')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: testInfo.outputPath('cached-card-refresh.png') });
  expect((await page.request.post(`${providerOrigin}/__source-gate`, { data: { action: 'release', target: 'issue-detail' } })).ok()).toBe(true);
  await expect(page.getByRole('status', { name: 'Refreshing card' })).toHaveCount(0);

  await controlProvider(page.request, { sourceDetailFailure: true });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.workspace-card').filter({ hasText: 'Stale' })).toHaveCount(2);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:cached-${index}"]`)).toContainText(item.metadata.title);
  await expect(page.getByRole('status', { name: 'Refreshing card' })).toHaveCount(0);
  expect(await editor.evaluate((element) => element.isConnected)).toBe(true);

  await controlProvider(page.request, { sourceDetailFailure: false, sourceDenied: true });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.workspace-card').filter({ hasText: 'Unavailable' })).toHaveCount(2);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:cached-${index}"]`)).not.toContainText(item.metadata.title);
  await expect(page.getByRole('status', { name: 'Refreshing card' })).toHaveCount(0);
});

test('another account cannot bootstrap a private board metadata cache', async ({ page, browser }) => {
  const { board, items } = await cachedBoard(page);
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage();
    await signIn(bob, 'Bob');
    const session = await currentSession(bob.request);
    if (session.status !== 'signed-in') throw new Error('Expected second account');
    const response = await bob.request.get(`/api/boards/${board.id}/metadata`, { headers: { 'X-CSRF-Token': session.csrfToken } });
    expect(response.status()).toBe(404);
    for (const item of items) expect(await response.text()).not.toContain(item.metadata.title);
    const deniedBoard = bob.waitForResponse((result) => new URL(result.url()).pathname === `/api/boards/${board.id}`);
    await bob.goto(`/boards/${board.id}`);
    expect((await deniedBoard).status()).toBe(404);
    await expect(bob.locator('.workspace-card')).toHaveCount(0);
    for (const item of items) await expect(bob.locator('body')).not.toContainText(item.metadata.title);
  } finally { await other.close(); }
});
