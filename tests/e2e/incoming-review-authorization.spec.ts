import { expect, test } from '@playwright/test';
import type { APIResponse, Page, Request, Route } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import type { Board } from '../../src/shared/boards.js';
import { readRepository, readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import type { SourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in account');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
function shapes(board: Board) {
  return Object.values(board.document.snapshot.store).filter((record) => record.typeName === 'shape');
}
async function seed(page: Page, title: string) {
  await signIn(page);
  const authorized = await headers(page);
  const listed = await page.request.get('/api/sources/repositories/alice/project/items?page=1', { headers: authorized });
  expect(listed.status()).toBe(200);
  const payload: unknown = await listed.json();
  if (typeof payload !== 'object' || payload === null || !('repository' in payload)) throw new Error('Missing public repository identity');
  const repository = readRepository(payload.repository);
  const sourcePage = readSourcePage(payload, readSourceItem);
  expect(sourcePage.items).toHaveLength(2);
  const items: SourceItem[] = [];
  for (const item of sourcePage.items) {
    const locator = item.metadata.locator;
    const resolved = await page.request.post('/api/sources/resolve', {
      headers: authorized,
      data: { url: `https://github.com/${locator.owner}/${locator.repository}/${item.reference.kind === 'issue' ? 'issues' : 'pull'}/${locator.number}` },
    });
    expect(resolved.status()).toBe(200);
    items.push(readSourceItem(await resolved.json()));
  }
  const created = await page.request.post('/api/boards', { headers: authorized, data: { title } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  const incoming = {
    version: 1,
    sources: [{ repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, loadedPage: 1, nextPage: title === 'Incoming global discovery boundary' ? sourcePage.nextPage : null, status: title === 'Incoming global discovery boundary' ? 'partial' : 'complete' }],
    queue: items.map((item) => ({ referenceId: item.reference.id, kind: item.reference.kind })),
    seen: items.map((item) => item.reference.id),
  };
  const saved = await page.request.put(`/api/boards/${board.id}`, {
    headers: authorized, data: { expectedRevision: board.revision, document: board.document, incoming },
  });
  expect(saved.status()).toBe(200);
  const queued = await read(page, board.id);
  expect(queued.incoming).toEqual(incoming);
  expect(shapes(queued)).toEqual([]);
  return { board: queued, items };
}
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); });
  }));
}
async function privateValuesAbsent(page: Page, items: SourceItem[]) {
  for (const item of items) {
    await expect(page.locator('.native-workspace')).not.toContainText(item.metadata.title);
    for (const label of item.metadata.labels) await expect(page.locator('.native-workspace')).not.toContainText(label);
  }
  await expect(page.locator('.repository-preview')).toHaveCount(0);
}
function metadataNotPersisted(board: Board, items: SourceItem[]) {
  const durable = JSON.stringify({ document: board.document, incoming: board.incoming });
  for (const item of items) {
    for (const value of [item.metadata.title, ...item.metadata.labels]) expect(durable).not.toContain(value);
  }
}
interface HeldReference { route: Route; response: APIResponse }
async function releaseReference(held: HeldReference) {
  try {
    await held.route.fulfill({ response: held.response });
  } catch (failure) {
    // Correct authority invalidation may have already canceled the browser request.
    // A delivery error is acceptable only with that real request-failure evidence.
    if (!held.route.request().failure()) throw failure;
  } finally { await held.response.dispose(); }
}

test('an initially reauthorization-required GitHub session withholds Incoming reads without disabling application-session placement or native saves', async ({ page, context }) => {
  const { board, items } = await seed(page, 'Incoming initial GitHub authorization ended');
  const first = items[0];
  if (!first) throw new Error('Missing queued reference');
  await controlProvider(page.request, { revoke: true });
  const referenceRequests: string[] = [];
  const sessionRequests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/references/')) referenceRequests.push(request.url());
    if (path === '/api/session') sessionRequests.push(request.url());
  });
  const sessionResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/session');
  await page.goto(`/boards/${board.id}`);
  const initialSession = await sessionResponse;
  expect(initialSession.status()).toBe(200);
  expect(await initialSession.json()).toMatchObject({ status: 'signed-in', authorization: 'reauthorize' });
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: 'Incoming 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incoming 2', exact: true })).toBeVisible();
  await frames(page);
  // Assert once at a bounded UI/frame boundary: the rejected candidate loops here.
  // Test teardown cancels that loop rather than waiting for it to become quiescent.
  expect(referenceRequests).toEqual([]);
  // Retain the observed startup boundary: source-mode StrictMode may cancel an
  // initial session probe. No later Incoming action may start reconciliation.
  const checkedSessions = sessionRequests.length;
  await privateValuesAbsent(page, items);
  const incoming = page.locator('.incoming-panel');
  await expect(incoming.getByRole('link', { name: /reconnect GitHub/i })).toBeVisible();
  await expect(incoming.locator('.incoming-candidates > li')).toHaveCount(2);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await incoming.getByRole('heading', { name: 'Incoming 2', exact: true }).focus();
    await page.screenshot({ path: `test-results/incoming-reauthorize-${theme}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await incoming.getByRole('link', { name: 'Reconnect GitHub', exact: true }).focus();
    await page.keyboard.press('Tab');
    const check = incoming.getByRole('button', { name: 'Check GitHub access', exact: true });
    await expect(check).toBeFocused();
    expect(await check.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const bounds = await check.boundingBox();
    if (!bounds) throw new Error('Missing GitHub recovery control');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/incoming-reauthorize-${theme}-320-enlarged.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  }
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing native editor');
  const added = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/boards/${board.id}`);
  await incoming.locator(`[data-reference-id="${first.reference.id}"]`).getByRole('button', { name: /^Add to board:/ }).click();
  expect((await added).status()).toBe(200);
  await expect(incoming).toBeVisible();
  await page.getByRole('button', { name: 'Close Incoming', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const placed = await read(page, board.id);
  expect(placed.revision).toBe(board.revision + 1);
  expect(placed.incoming).toEqual({ ...board.incoming, queue: board.incoming.queue.slice(1) });
  expect(shapes(placed)).toHaveLength(1);
  const placement = shapes(placed)[0];
  if (!placement) throw new Error('Missing durable placement');
  expect(placement).toMatchObject({ props: { referenceId: first.reference.id, kind: first.reference.kind } });
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').first().click();
  const moved = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/boards/${board.id}`);
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight');
  expect((await moved).status()).toBe(200);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const edited = await read(page, board.id);
  expect(edited.revision).toBe(placed.revision + 1);
  expect(edited.incoming).toEqual(placed.incoming);
  expect(shapes(edited)).toHaveLength(1);
  expect(shapes(edited)[0]).toMatchObject({ id: placement.id, x: placement.x + 1, y: placement.y, props: placement.props });
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Incoming 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incoming 1', exact: true })).toBeVisible();
  await frames(page);
  expect(referenceRequests).toEqual([]);
  expect(sessionRequests).toHaveLength(checkedSessions);
  await privateValuesAbsent(page, items);
  metadataNotPersisted(edited, items);

  await controlProvider(page.request, { revoke: false });
  const authorization = context.waitForEvent('page');
  await incoming.getByRole('link', { name: 'Reconnect GitHub', exact: true }).click();
  const reconnect = await authorization;
  try {
    await reconnect.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
    await reconnect.goto('/boards');
    await expect(reconnect.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
    await page.bringToFront();
    const check = incoming.getByRole('button', { name: 'Check GitHub access', exact: true });
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Incoming 1', exact: true })).toBeFocused();
    await expect(incoming.getByRole('link', { name: 'Reconnect GitHub', exact: true })).toHaveCount(0);
    for (const item of items) await expect(page.locator('.native-workspace')).toContainText(item.metadata.title);
    await frames(page);
    expect(referenceRequests.filter((url) => !url.endsWith('/context'))).toHaveLength(items.length);
    expect(sessionRequests).toHaveLength(checkedSessions + 1);
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    expect(await read(page, board.id)).toEqual(edited);
  } finally { await reconnect.close(); }
});

test('a retained repository connector session loss invalidates accepted hydration replies before they can restore private Incoming metadata', async ({ page, context }) => {
  const { board, items } = await seed(page, 'Incoming global access-loss metadata boundary');
  const accepted: HeldReference[] = [];
  const terminal = new Set<Request>();
  const finished = (request: Request) => { terminal.add(request); };
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  let holdReferences = true;
  await page.route('**/api/references/*', async (route) => {
    if (!holdReferences) return await route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const item = readSourceItem(await response.json());
    const expected = items.find((candidate) => candidate.reference.id === item.reference.id);
    if (!expected) throw new Error('Unexpected authorized hydration reference');
    expect(item.metadata.title).toBe(expected.metadata.title);
    expect(item.metadata.labels).toEqual(expected.metadata.labels);
    accepted.push({ route, response });
  });
  const checks: Route[] = [];
  let holdSession = true;
  const holdReconciliation = async (route: Route) => {
    if (holdSession) checks.push(route);
    else await route.continue();
  };
  const other = await context.newPage();
  try {
    await page.goto(`/boards/${board.id}`);
    await expect(page.locator('.tl-container')).toBeVisible();
    await expect.poll(() => [...new Set(accepted.map(({ route }) => decodeURIComponent(new URL(route.request().url()).pathname.slice('/api/references/'.length))))].sort()).toEqual(items.map((item) => item.reference.id).sort());
    const original = await page.locator('.tl-container').elementHandle();
    if (!original) throw new Error('Missing retained native editor');
    await page.getByRole('button', { name: 'Incoming 2', exact: true }).click();
    await page.getByRole('button', { name: 'Repositories', exact: true }).click();
    const browser = page.getByRole('region', { name: 'Board repository connection', exact: true });
    await expect(browser.getByLabel('Search repositories')).toBeVisible();
    await privateValuesAbsent(page, items);
    await other.goto('/boards');
    await other.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(other.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
    expect(await currentSession(other.request)).toMatchObject({ status: 'signed-out' });
    // The retained browser, not an autosave or credential shortcut, reports this loss.
    // Freeze any resulting root reconciliation until the late-response assertion ends.
    await page.route('**/api/session', holdReconciliation);
    const rejected = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/sources/resolve');
    await browser.getByLabel('Search repositories', { exact: true }).fill('https://github.com/alice/project/issues/1');
    const lost = await rejected;
    expect(lost.status()).toBe(401);
    await lost.finished();
    await frames(page);
    await privateValuesAbsent(page, items);
    const late = accepted.splice(0);
    expect(new Set(late.map(({ route }) => route.request().url())).size).toBe(items.length);
    holdReferences = false;
    await Promise.all(late.map(releaseReference));
    await expect.poll(() => late.every(({ route }) => terminal.has(route.request()))).toBe(true);
    await frames(page);
    // Both already-authorized real 200s have now finished or failed in the browser.
    // This assertion precedes recovery/save checks so metadata resurrection is primary.
    await privateValuesAbsent(page, items);
    await expect(page.locator('.tl-container')).toBeVisible();
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.getByRole('button', { name: 'Incoming 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Incoming/ }).click();
    await expect(page.locator('.incoming-panel')).toContainText('Check your account');
    await expect(page.locator('.repository-connector')).toHaveCount(0);
    await expect.poll(() => checks.length).toBeGreaterThan(0);
    holdSession = false;
    await Promise.all(checks.splice(0).map((route) => route.continue()));
    await expect(page.locator('.account-context-status')).toContainText('Your session ended');
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    await privateValuesAbsent(page, items);
    // Renew through the ordinary provider UI solely to read the durable owner board.
    // No placement or autosave has been used to trigger the metadata-loss boundary.
    await signIn(other);
    const unchanged = await read(other, board.id);
    expect(unchanged).toEqual(board);
    metadataNotPersisted(unchanged, items);
  } finally {
    holdSession = false;
    holdReferences = false;
    await page.unroute('**/api/session', holdReconciliation);
    await Promise.all(checks.splice(0).map((route) => route.continue()));
    await Promise.all(accepted.splice(0).map(releaseReference));
    await other.close();
  }
});

test('global source-context loss rejects a previously authorized discovery page without advancing the queue or cursor', async ({ page, context }) => {
  const { board, items } = await seed(page, 'Incoming global discovery boundary');
  const accepted: HeldReference[] = [];
  const terminal = new Set<Request>();
  const finished = (request: Request) => { terminal.add(request); };
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  await page.route(/\/api\/sources\/repositories\/alice\/project\/items\?page=2$/, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const value = readSourcePage(await response.json(), readSourceItem);
    expect(value.items.map((item) => item.reference.kind)).toEqual(['pull-request', 'pull-request']);
    accepted.push({ route, response });
  });
  const checks: Route[] = [];
  let holdSession = true;
  const holdReconciliation = async (route: Route) => {
    if (holdSession) checks.push(route);
    else await route.continue();
  };
  const other = await context.newPage();
  try {
    await page.goto(`/boards/${board.id}`);
    await page.getByRole('button', { name: 'Incoming 2', exact: true }).click();
    for (const item of items) await expect(page.locator('.incoming-candidates')).toContainText(item.metadata.title);
    const original = await page.locator('.tl-container').elementHandle();
    if (!original) throw new Error('Missing native editor');
    // Discovery starts automatically on opening the board.
    await expect.poll(() => accepted.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
    const loading = await read(page, board.id);
    expect(loading.incoming.sources[0]).toMatchObject({ status: 'loading', loadedPage: 1, nextPage: 2 });
    await page.getByRole('button', { name: 'Repositories', exact: true }).click();
    await expect(page.getByLabel('Search repositories')).toBeVisible();
    await other.goto('/boards');
    await other.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(other.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
    await page.route('**/api/session', holdReconciliation);
    const rejected = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/sources/resolve');
    await page.getByLabel('Search repositories').fill('');
  await page.getByLabel('Search repositories').fill('https://github.com/alice/project/issues/1');
    expect((await rejected).status()).toBe(401);
    await expect.poll(() => checks.length).toBeGreaterThan(0);
    const late = accepted.splice(0);
    await Promise.all(late.map(releaseReference));
    await expect.poll(() => late.every(({ route }) => terminal.has(route.request()))).toBe(true);
    await frames(page);
    await expect(page.getByRole('button', { name: 'Incoming 2', exact: true })).toBeVisible();
    await privateValuesAbsent(page, items);
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.locator('.tl-shape')).toHaveCount(0);
    await signIn(other);
    const retained = await read(other, board.id);
    expect(retained).toEqual(loading);
  } finally {
    holdSession = false;
    await page.unroute('**/api/session', holdReconciliation);
    await Promise.all(checks.splice(0).map((route) => route.continue()));
    await Promise.all(accepted.splice(0).map(releaseReference));
    await other.close();
  }
});
