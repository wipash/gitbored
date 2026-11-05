import { expect, test } from '@playwright/test';
import type { APIResponse, Page, Route } from '@playwright/test';
import { createEmptyBoardDocument, validateBoard, type Board } from '../../src/shared/boards.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { applicationOrigin, controlProvider, currentSession, restartApplication, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function create(page: Page, title: string): Promise<Board> {
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title } });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}
async function read(page: Page, id: string): Promise<Board> {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.ok()).toBe(true);
  return validateBoard(await response.json());
}
function mixedDocument() {
  const document = createEmptyBoardDocument();
  const base = { typeName: 'shape', rotation: 0, opacity: 1, isLocked: false, meta: {} };
  const card = { ...base, id: 'shape:card', type: 'item-card', parentId: 'shape:group', index: 'a1', x: 20, y: 30, props: { version: 1, referenceId: 'ref-durable-fixture', kind: 'issue', w: 320, h: 240 } };
  const records = [
    { ...base, id: 'shape:frame', type: 'frame', parentId: 'page:page', index: 'a1', x: 40, y: 40, props: { w: 900, h: 620, name: 'Planning frame', color: 'black' } },
    { ...base, id: 'shape:group', type: 'group', parentId: 'shape:frame', index: 'a1', x: 30, y: 40, props: {} }, card,
    { ...base, id: 'shape:text', type: 'text', parentId: 'shape:group', index: 'a2', x: 370, y: 60, props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 300, autoSize: true, scale: 1, richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Durable native note' }] }] } } },
    { ...base, id: 'shape:arrow', type: 'arrow', parentId: 'shape:frame', index: 'a2', x: 140, y: 320, props: { kind: 'arc', labelColor: 'black', color: 'black', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw', start: { x: 0, y: 0 }, end: { x: 400, y: 60 }, bend: 0, richText: { type: 'doc', content: [{ type: 'paragraph' }] }, labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5 } },
    { id: 'binding:arrow-card', typeName: 'binding', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:card', meta: {}, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } },
  ];
  return validateNativeDocument({ ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, ...Object.fromEntries(records.map((record) => [record.id, record])) } } });
}

test('owners alone control boards and one atomic revision wins a concurrent save', async ({ page, browser }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page, 'Private revision race');
  const bobContext = await browser.newContext({ baseURL: applicationOrigin });
  const bob = await bobContext.newPage();
  await signIn(bob, 'Bob');
  const bobHeaders = await headers(bob);
  const bobBoard = await create(bob, 'Bob isolated owner');
  const bobList: unknown = await (await bob.request.get('/api/boards', { headers: bobHeaders })).json();
  expect(bobList).toEqual({ boards: expect.arrayContaining([expect.objectContaining({ id: bobBoard.id })]) });
  expect(bobList).toEqual({ boards: expect.not.arrayContaining([expect.objectContaining({ id: board.id })]) });
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const response = await bob.request.fetch(`/api/boards/${board.id}`, { method, headers: bobHeaders,
      ...(method === 'PUT' ? { data: { expectedRevision: 0, document: board.document } } : method === 'PATCH' ? { data: { title: 'Stolen' } } : {}) });
    expect(response.status()).toBe(404);
  }
  const ownerHeaders = await headers(page);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: ownerHeaders, data: { expectedRevision: 0, document: { ...board.document, version: 99 } } })).status()).toBe(400);
  const document = mixedDocument();
  const responses = await Promise.all([0, 1].map(() => page.request.put(`/api/boards/${board.id}`, { headers: ownerHeaders, data: { expectedRevision: 0, document } })));
  expect(responses.map((response) => response.status()).sort((a, b) => a - b)).toEqual([200, 409]);
  const saved = await read(page, board.id);
  expect(saved.revision).toBe(1);
  expect(saved.document).toEqual(document);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: ownerHeaders, data: { expectedRevision: 0, document: board.document } })).status()).toBe(409);
  expect((await read(page, board.id)).document).toEqual(document);
  expect((await page.request.delete(`/api/boards/${board.id}`, { headers: ownerHeaders })).status()).toBe(204);
  expect((await page.request.get(`/api/boards/${board.id}`, { headers: ownerHeaders })).status()).toBe(404);
  await bobContext.close();
});

test('authenticated board controls and mixed native geometry survive reload and actual server restart', async ({ page }, testInfo) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Boards', exact: true }).click();
  await page.getByLabel('Board name', { exact: false }).fill('Native persistence');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Native persistence', exact: true })).toBeFocused();
  const id = page.url().split('/').pop();
  if (!id) throw new Error('Missing created board ID');
  const ownerHeaders = await headers(page);
  const seed = mixedDocument();
  expect((await page.request.put(`/api/boards/${id}`, { headers: ownerHeaders, data: { expectedRevision: 0, document: seed } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-shape-id="shape:text"]').getByText('Durable native note', { exact: true })).toBeVisible();
  // Add a real freehand drawing through the mounted SDK, not an internal editor hook.
  const canvas = page.locator('.tl-container');
  await page.getByRole('button', { name: /^Draw/ }).click();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas bounds');
  for (const point of [{ x: bounds.x + 500, y: bounds.y + 450 }, { x: bounds.x + 550, y: bounds.y + 470 }, { x: bounds.x + 620, y: bounds.y + 440 }]) await expectNativePoint(page, point);
  await page.mouse.move(bounds.x + 500, bounds.y + 450);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 550, bounds.y + 470, { steps: 8 });
  await page.mouse.move(bounds.x + 620, bounds.y + 440, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Object.values((await read(page, id)).document.snapshot.store).some((record) => record.typeName === 'shape' && record.type === 'draw')).toBe(true);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const persisted = await read(page, id);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.locator('.native-workspace')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: testInfo.outputPath(`board-${theme}.png`), fullPage: true });
  }
  await page.reload();
  await expect(page.locator('[data-shape-id="shape:text"]').getByText('Durable native note', { exact: true })).toBeVisible();
  expect((await read(page, id)).document).toEqual(persisted.document);
  await restartApplication(page.request, 'original');
  await page.reload();
  await expect(page.locator('[data-shape-id="shape:text"]').getByText('Durable native note', { exact: true })).toBeVisible();
  expect((await read(page, id)).document).toEqual(persisted.document);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const styles = await page.getByRole('button', { name: 'Styles', exact: true }).boundingBox();
  expect(styles).not.toBeNull();
  expect(styles && styles.x >= 0 && styles.x + styles.width <= 320).toBe(true);
  await page.getByText('Board settings', { exact: true }).click();
  await page.getByLabel('Board name (1–160 characters)', { exact: true }).fill('Renamed board');
  await page.getByRole('button', { name: 'Rename board', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Renamed board', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename board', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('board-narrow-enlarged.png'), fullPage: true });
  await page.getByRole('button', { name: 'Delete board', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Delete.*Renamed board/ })).toBeVisible();
  await expect(page.getByLabel('Type the board name to confirm')).toBeFocused();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const dialogBounds = await page.getByRole('dialog').boundingBox();
  if (!dialogBounds) throw new Error('Missing confirmation dialog');
  for (const control of [page.getByLabel('Type the board name to confirm'), page.getByRole('button', { name: 'Cancel', exact: true }), page.getByRole('button', { name: 'Delete board permanently' })]) {
    const bounds = await control.boundingBox();
    expect(bounds && bounds.x >= dialogBounds.x && bounds.x + bounds.width <= dialogBounds.x + dialogBounds.width).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('board-narrow-enlarged-dialog.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete board', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('Type the board name to confirm').fill('Renamed board');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/boards$/);
  expect((await page.request.get(`/api/boards/${id}`, { headers: await headers(page) })).status()).toBe(404);
});

test('failed and delayed saves retain newer local work, then a conflict preserves the mounted document', async ({ page }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page, 'Save states');
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.tl-container')).toBeVisible();
  let failed = false;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() === 'PUT' && !failed) { failed = true; await route.abort('connectionfailed'); } else await route.continue();
  });
  const canvas = page.locator('.tl-container');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Missing canvas bounds');
  await page.getByRole('button', { name: /^Rectangle/ }).click();
  await page.mouse.move(box.x + 300, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 420, box.y + 290); await page.mouse.up();
  await expect(page.locator('.board-save')).toContainText('saving failed');
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  expect((await read(page, board.id)).revision).toBe(0);
  await page.getByRole('button', { name: 'Retry save' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.locator('.board-save [role="status"]')).toBeFocused();
  await page.unroute(`**/api/boards/${board.id}`);
  const acknowledgements: { route: Route; response: APIResponse }[] = [];
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return await route.continue();
    // The real server has committed; hold only delivery of its public HTTP acknowledgement.
    acknowledgements.push({ route, response: await route.fetch() });
  });
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => acknowledgements.length).toBe(1);
  await page.keyboard.press('ArrowDown');
  const first = acknowledgements.shift();
  if (!first) throw new Error('Missing first save response');
  await first.route.fulfill({ response: first.response });
  await expect.poll(() => acknowledgements.length).toBe(1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saving');
  const second = acknowledgements.shift();
  if (!second) throw new Error('Missing second save response');
  await second.route.fulfill({ response: second.response });
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect((await read(page, board.id)).revision).toBe(3);
  await page.unroute(`**/api/boards/${board.id}`);
  const saved = await read(page, board.id);
  const ownerHeaders = await headers(page);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: ownerHeaders, data: { expectedRevision: saved.revision, document: saved.document } })).ok()).toBe(true);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'conflict');
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  expect((await read(page, board.id)).document).toEqual(saved.document);
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: 'Reload server version' }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
});

for (const { theme, width } of [{ theme: 'light', width: 1440 }, { theme: 'dark', width: 320 }]) {
  test(`keyboard Retry loading deliberately returns focus during the real ${theme} ${width}px list request`, async ({ page }) => {
    await controlProvider(page.request, { reset: true }); await signIn(page);
    const board = await create(page, `Focus recovery ${theme}`);
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.setViewportSize({ width, height: 1000 });
    let fail = true;
    let hold = true;
    const pending: Route[] = [];
    await page.route('**/api/boards', async (route) => {
      if (route.request().method() !== 'GET') return await route.continue();
      if (fail) await route.abort('connectionfailed');
      else if (hold) pending.push(route);
      else await route.continue();
    });
    await page.goto('/boards');
    if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const retry = page.getByRole('button', { name: 'Retry loading', exact: true });
    await expect(retry).toBeVisible(); fail = false;
    await retry.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeFocused();
    await expect.poll(() => pending.length).toBeGreaterThan(0);
    hold = false; await Promise.all(pending.map((route) => route.continue()));
    await expect(page.getByRole('link', { name: board.title, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
