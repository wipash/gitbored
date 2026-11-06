import { expect, test } from '@playwright/test';
import type { APIResponse, Page, Route } from '@playwright/test';
import { boardSaveValidator, validateBoard } from '../../src/shared/boards.js';
import type { Board, BoardSave } from '../../src/shared/boards.js';
import { validateIncoming } from '../../src/shared/incoming.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readRepository, readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import type { SourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, signIn, openSettings } from './auth-support.js';

test.describe.configure({ mode: 'serial' });
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
  expect(board.incoming).toEqual({ version: 1, sources: [], queue: [], seen: [] });
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
  return { board: await read(page, board.id), items };
}
async function open(page: Page, board: Board, items: SourceItem[]) {
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  for (const item of items) await expect(page.locator(`.incoming-candidates [data-reference-id="${item.reference.id}"]`)).toContainText(item.metadata.title);
}
async function add(page: Page, referenceId: string) {
  if (!(await page.locator('.incoming-panel').isVisible())) await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  const title = await page.locator(`.incoming-candidates [data-reference-id="${referenceId}"] .incoming-title`).innerText();
  await page.locator(`.incoming-candidates [data-reference-id="${referenceId}"]`).getByRole('button', { name: /^Add to board:/ }).click();
  await expect(page.locator('.incoming-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Close Incoming', exact: true }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  const results = page.locator('.workspace-find .workspace-find-results button');
  if (await results.count() === 1) await results.click();
  else await results.filter({ hasText: title }).click();
  await expect(page.locator('.tl-container')).toBeFocused();
}
async function authorize(page: Page, identity: 'Alice' | 'Bob') {
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: `Authorize ${identity}`, exact: true }).click();
  await page.goto('/boards');
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
}
async function privateValuesAbsent(page: Page, items: SourceItem[]) {
  for (const item of items) {
    await expect(page.locator('.native-workspace')).not.toContainText(item.metadata.title);
    for (const label of item.metadata.labels) await expect(page.locator('.native-workspace')).not.toContainText(label);
  }
  await expect(page.locator('.repository-preview')).toHaveCount(0);
}
async function metadataNotPersisted(page: Page, board: Board, items: SourceItem[]) {
  const durable = JSON.stringify({ document: board.document, incoming: board.incoming });
  const storage = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  for (const item of items) {
    for (const value of [item.metadata.title, ...item.metadata.labels]) {
      expect(durable).not.toContain(value);
      expect(storage).not.toContain(value);
    }
  }
  expect(durable).not.toMatch(/"metadata"|"labels"|"assignees"|"freshness"/);
}

test('current-session queue and placed hydration stay ephemeral, and resource denial clears fetched values without consuming Incoming or moving geometry', async ({ page }) => {
  const { board, items } = await seed(page, 'Incoming resource authorization');
  const first = items[0]; const second = items[1];
  if (!first || !second) throw new Error('Missing authorized source items');
  const lookups: { id: string; csrf: string | undefined }[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/references\/[^/]+$/.test(path)) lookups.push({ id: path.slice('/api/references/'.length), csrf: request.headers()['x-csrf-token'] });
  });
  await open(page, board, items);
  const csrf = (await headers(page))['X-CSRF-Token'];
  expect(new Set(lookups.map((lookup) => lookup.id))).toEqual(new Set(items.map((item) => item.reference.id)));
  expect(lookups.every((lookup) => lookup.csrf === csrf)).toBe(true);
  const hydratedReads = lookups.length;
  await add(page, first.reference.id);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect(lookups).toHaveLength(hydratedReads);
  const placed = await read(page, board.id);
  expect(shapes(placed)).toHaveLength(1);
  expect(placed.incoming.queue).toEqual([{ referenceId: second.reference.id, kind: second.reference.kind }]);
  await metadataNotPersisted(page, placed, items);
  lookups.length = 0;
  await page.reload();
  await expect(page.locator('.workspace-card-title')).toHaveText(first.metadata.title);
  await page.getByRole('button', { name: 'Incoming 1', exact: true }).click();
  await expect(page.locator('.incoming-candidates')).toContainText(second.metadata.title);
  expect(new Set(lookups.map((lookup) => lookup.id))).toEqual(new Set(items.map((item) => item.reference.id)));
  expect(lookups.every((lookup) => lookup.csrf === csrf)).toBe(true);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing native editor');
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  const url = page.getByLabel('Search repositories', { exact: true });
  await url.fill('https://github.com/alice/project/issues/1');
  await expect(page.locator('.repository-preview')).toContainText(first.metadata.title);
  await controlProvider(page.request, { sourceDenied: true, sourceDenialStatus: 404 });
  const denied = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sources/resolve');
  await page.getByLabel('Search repositories').fill('');
  await page.getByLabel('Search repositories').fill('https://github.com/alice/project/issues/1');
  expect((await denied).status()).toBe(404);
  await privateValuesAbsent(page, items);
  await page.getByRole('button', { name: 'Incoming 1', exact: true }).click();
  await expect(page.locator('.incoming-candidates')).toContainText(/unavailable/i);
  await expect(page.locator('.workspace-card-title')).toContainText(/unavailable/i);
  await expect(page.getByRole('button', { name: 'Incoming 1', exact: true })).toBeVisible();
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  expect(await read(page, board.id)).toEqual(placed);
  await metadataNotPersisted(page, placed, items);
  await controlProvider(page.request, { sourceDenied: false });
  await page.getByRole('button', { name: 'Retry unavailable details', exact: true }).click();
  await expect(page.locator('.workspace-card-title')).toHaveText(first.metadata.title);
  await expect(page.locator('.incoming-candidates')).toContainText(second.metadata.title);
  expect(await read(page, board.id)).toEqual(placed);
});

test('same-user rotation and temporary sign-out retain dirty Incoming placements in one editor, withhold private reads, and save only after explicit recovery', async ({ page, context }) => {
  const { board, items } = await seed(page, 'Incoming retained account draft');
  await open(page, board, items);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing native editor');
  const now = Date.now();
  await page.clock.install({ time: now }); await page.clock.pauseAt(now + 1000);
  const writes: BoardSave[] = [];
  const pending: Route[] = [];
  let holdWrite = true;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return await route.continue();
    const payload = boardSaveValidator.validate(route.request().postDataJSON());
    writes.push({ ...payload, document: validateNativeDocument(payload.document), incoming: validateIncoming(payload.incoming) });
    if (holdWrite) { pending.push(route); } else await route.continue();
  });
  const other = await context.newPage();
  let before = board;
  for (const [index, mode] of ['rotation', 'signed-out'].entries()) {
    const item = items[index];
    if (!item) throw new Error('Missing queued placement');
    const previousSession = await currentSession(page.request);
    const previousWrites = writes.length;
    holdWrite = true; pending.length = 0;
    await add(page, item.reference.id); await page.clock.runFor(400);
    await expect.poll(() => pending.length).toBe(1);
    if (mode === 'rotation') {
      await authorize(other, 'Alice');
      const renewed = await currentSession(page.request);
      if (previousSession.status !== 'signed-in' || renewed.status !== 'signed-in') throw new Error('Expected same-user rotation');
      expect(renewed.user.id).toBe(previousSession.user.id);
      expect(renewed.csrfToken).not.toBe(previousSession.csrfToken);
    } else {
      await openSettings(other);
      await other.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(other.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
    }
    const checks: Route[] = [];
    await page.route('**/api/session', async (route) => { checks.push(route); });
    const placementRequest = pending.shift();
    if (!placementRequest) throw new Error('Missing held placement request');
    const rejected = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/boards/${board.id}`);
    await placementRequest.continue();
    expect([401, 403]).toContain((await rejected).status());
    await expect.poll(() => checks.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
    await expect(page.locator('.incoming-panel')).toContainText('Check your account');
    await expect(page.locator('.repository-connector')).toHaveCount(0);
    await privateValuesAbsent(page, items);
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    await page.getByRole('button', { name: 'Close Incoming', exact: true }).click();
    await page.locator('.tl-container').focus(); await page.keyboard.press('ArrowRight');
    await page.clock.runFor(1000);
    expect(writes).toHaveLength(previousWrites + 1);
    await page.unroute('**/api/session');
    await Promise.all(checks.map((route) => route.continue()));
    if (mode === 'signed-out') {
      await openSettings(page);
      await expect(page.locator('.account-context-status')).toContainText('Your session ended');
      await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveAttribute('aria-disabled', 'true');
      await privateValuesAbsent(page, items);
      await authorize(other, 'Alice');
      await openSettings(page);
      await page.getByRole('button', { name: 'Check account', exact: true }).click();
    }
    await openSettings(page);
    await expect(page.locator('.account-context-status')).toContainText('Your account is confirmed');
    await expect(page.locator('.board-save')).toContainText('saving is paused after an account check');
    await page.clock.runFor(1000);
    expect(writes).toHaveLength(previousWrites + 1);
    expect(await read(page, board.id)).toEqual(before);
    await expect(page.locator('.tl-shape')).toHaveCount(index + 1);
    await expect(page.getByRole('button', { name: /^Incoming \d+$/ })).toHaveText(`Incoming ${1 - index}`);
    holdWrite = false;
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
    const saved = await read(page, board.id);
    expect(saved.revision).toBe(before.revision + 1);
    expect(saved.incoming.queue).toEqual(board.incoming.queue.slice(index + 1));
    expect(saved.incoming.seen).toEqual(board.incoming.seen);
    expect(shapes(saved)).toHaveLength(index + 1);
    const placed = Object.values(writes[previousWrites]?.document.snapshot.store ?? {}).find((record) => record.typeName === 'shape' && record.type === 'item-card' && record.props.referenceId === item.reference.id);
    if (placed?.typeName !== 'shape') throw new Error('Missing attempted placement');
    expect(shapes(saved).find((shape) => 'referenceId' in shape.props && shape.props.referenceId === item.reference.id)).toMatchObject({ x: placed.x + 1, y: placed.y });
    expect(saved.document).toEqual(writes.at(-1)?.document);
    expect(saved.incoming).toEqual(writes.at(-1)?.incoming);
    expect(writes).toHaveLength(previousWrites + 2);
    expect(await original.evaluate((element) => element.isConnected)).toBe(true);
    await metadataNotPersisted(page, saved, items);
    before = saved;
  }
  await other.close();
});

test('confirmed Bob unmounts Alice Incoming before another private lookup and ignores already accepted late metadata; Alice board and references are 404 to Bob', async ({ page, context }) => {
  const { board, items } = await seed(page, 'Alice confidential Incoming');
  const accepted: { route: Route; response: APIResponse }[] = [];
  let holdMetadata = true;
  let switched = false;
  const subsequentLookups: string[] = [];
  await page.route('**/api/references/*', async (route) => {
    if (switched) subsequentLookups.push(route.request().url());
    if (holdMetadata) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      accepted.push({ route, response });
    } else await route.continue();
  });
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.tl-container')).toBeVisible();
  await expect.poll(() => new Set(accepted.map(({ route }) => route.request().url())).size).toBe(2);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing Alice native editor');
  const first = items[0];
  if (!first) throw new Error('Missing Alice queue');
  const now = Date.now();
  await page.clock.install({ time: now }); await page.clock.pauseAt(now + 1000);
  let pending: Route | undefined;
  let writes = 0;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() === 'PUT') { writes += 1; pending = route; }
    else {
      // Bob may probe the old board URL (and receive 404), but only after Alice's
      // editor is gone. No old-reference metadata lookup may follow the switch.
      if (switched) expect(await original.evaluate((element) => element.isConnected)).toBe(false);
      await route.continue();
    }
  });
  await add(page, first.reference.id); await page.clock.runFor(400);
  await expect.poll(() => Boolean(pending)).toBe(true);
  const other = await context.newPage(); await authorize(other, 'Bob');
  switched = true; holdMetadata = false;
  if (!pending) throw new Error('Missing Alice dirty placement');
  await pending.continue();
  await expect(page.locator('.tl-container, .incoming-panel')).toHaveCount(0);
  expect(await original.evaluate((element) => element.isConnected)).toBe(false);
  await openSettings(page);
  await expect(page.locator('.application-account')).toHaveText('Account: @bob');
  await expect(page.getByRole('heading', { name: board.title, exact: true })).toHaveCount(0);
  // These are real Alice-authorized HTTP responses, not fabricated metadata. Late delivery
  // must not recreate the account-scoped editor after its requests have been canceled.
  for (const held of accepted) await held.route.fulfill({ response: held.response });
  await page.clock.runFor(1000);
  expect(writes).toBe(1);
  expect(subsequentLookups).toEqual([]);
  await expect(page.locator('body')).not.toContainText(board.title);
  for (const item of items) await expect(page.locator('body')).not.toContainText(item.metadata.title);
  const bobHeaders = await headers(other);
  const deniedBoard = await other.request.get(`/api/boards/${board.id}`, { headers: bobHeaders });
  expect(deniedBoard.status()).toBe(404);
  expect(await deniedBoard.text()).not.toContain(board.title);
  for (const item of items) {
    const denied = await other.request.get(`/api/references/${item.reference.id}`, { headers: bobHeaders });
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(item.metadata.title);
  }
  await other.close();
});
