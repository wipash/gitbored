import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { applicationOrigin, controlProvider, currentSession, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });
async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in account');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function create(page: Page, title: string) {
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title } });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}
async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function authorize(page: Page, identity: 'Alice' | 'Bob') {
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: `Authorize ${identity}`, exact: true }).click();
  await page.goto('/boards');
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
}
async function draw(page: Page) {
  const canvas = page.locator('.tl-container');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: /^Rectangle/ }).click();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing native canvas bounds');
  const start = { x: bounds.x + 300, y: bounds.y + 180 };
  const end = { x: bounds.x + 420, y: bounds.y + 270 };
  await expectNativePoint(page, start); await expectNativePoint(page, end);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
}
async function nudge(page: Page, key: string) {
  await page.locator('.tl-container').focus(); await page.keyboard.press(key);
}
function geometry(board: Awaited<ReturnType<typeof read>>) {
  const shape = Object.values(board.document.snapshot.store).find((record) => record.typeName === 'shape');
  if (shape?.typeName !== 'shape') throw new Error('Missing durable native shape');
  return { x: shape.x, y: shape.y };
}

test('retired routes open Boards without legacy navigation in either theme', async ({ page }, testInfo) => {
  await signIn(page);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    for (const route of ['/sources', '/account']) {
      await page.goto(route);
      await expect(page).toHaveURL('/boards');
      await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeFocused();
      await expect(page.getByRole('link', { name: /^(Sources|Account)$/ })).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeInViewport();
      await expect(page.getByLabel('Theme', { exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`boards-${theme}-narrow.png`), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
});

test('same-user session rotation retains native lifetime, acknowledged revision, dirty leave protection and explicit retry', async ({ page, context }) => {
  await signIn(page);
  const board = await create(page, 'Same account draft');
  await page.goto(`/boards/${board.id}`); await draw(page);
  const before = await read(page, board.id);
  expect(before.revision).toBe(1);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing mounted canvas');
  const alice = await currentSession(page.request);
  const other = await context.newPage(); await authorize(other, 'Alice');
  const renewed = await currentSession(page.request);
  if (alice.status !== 'signed-in' || renewed.status !== 'signed-in') throw new Error('Expected authenticated account');
  expect(renewed.user.id).toBe(alice.user.id); expect(renewed.csrfToken).not.toBe(alice.csrfToken);
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'PUT' && request.url().endsWith(`/api/boards/${board.id}`)) writes += 1; });
  const rejected = page.waitForResponse((response) => response.request().method() === 'PUT');
  await nudge(page, 'ArrowRight');
  expect((await rejected).status()).toBe(403);
  await expect(page.locator('.board-save')).toContainText('saving is paused after an account check');
  await expect(page.locator('.application-account')).toHaveText('Account: @alice');
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await nudge(page, 'ArrowDown');
  // Observe beyond two document-save debounce windows: new input must not replay a failed write.
  await page.waitForTimeout(650);
  expect(writes).toBe(1); expect((await read(page, board.id)).revision).toBe(1);
  await page.getByRole('link', { name: 'Boards', exact: true }).click();
  await expect(page.getByText('Save this board or save a copy before switching boards.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/boards/${board.id}$`));
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await read(page, board.id);
  expect(saved.revision).toBe(2);
  expect(geometry(saved)).toEqual({ x: geometry(before).x + 1, y: geometry(before).y + 1 });
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload(); expect((await read(page, board.id)).document).toEqual(saved.document);
  await other.close();
});

test('signed-out and transient reconciliation retain a dirty canvas until same-user renewal and explicit retry', async ({ page, context }, testInfo) => {
  await signIn(page);
  const board = await create(page, 'Retained signed-out draft');
  await page.goto(`/boards/${board.id}`); await draw(page);
  const before = await read(page, board.id);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing mounted canvas');
  const other = await context.newPage(); await other.goto('/boards');
  await other.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(other.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'PUT' && request.url().endsWith(`/api/boards/${board.id}`)) writes += 1; });
  await nudge(page, 'ArrowRight');
  await expect(page.locator('.account-context-status')).toContainText('Your session ended');
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveAttribute('aria-disabled', 'true');
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('signed-out-draft-dark-narrow.png'), fullPage: true });
  await other.getByRole('link', { name: 'Sign in with GitHub', exact: true }).click();
  await other.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await other.goto('/boards');
  await expect(other.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await page.route('**/api/session', async (route) => { await route.abort('connectionfailed'); });
  await page.getByRole('button', { name: 'Check account', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.account-context-status')).toContainText('could not be checked');
  await expect(page.getByRole('button', { name: 'Check account', exact: true })).toBeFocused();
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await page.unroute('**/api/session');
  await page.keyboard.press('Enter');
  await expect(page.locator('.account-context-status')).toContainText('Your account is confirmed');
  await expect(page.locator('.account-context-status')).toBeFocused();
  expect(writes).toBe(1); expect((await read(page, board.id)).revision).toBe(before.revision);
  await page.getByRole('button', { name: 'Retry save', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect(geometry(await read(page, board.id))).toEqual({ x: geometry(before).x + 1, y: geometry(before).y });
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await other.close();
});

test('a confirmed different account unmounts the old dirty canvas before exposing its own boards', async ({ page, context }) => {
  await signIn(page);
  const alice = await create(page, 'Alice confidential board');
  await page.goto(`/boards/${alice.id}`); await draw(page);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing mounted canvas');
  const other = await context.newPage(); await authorize(other, 'Bob');
  const bob = await create(other, 'Bob private board');
  await nudge(page, 'ArrowRight');
  await expect(page.locator('.application-account')).toHaveText('Account: @bob');
  expect(await original.evaluate((element) => element.isConnected)).toBe(false);
  await expect(page.locator('.tl-container')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Alice confidential board', exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/boards/${alice.id}`, { headers: await headers(page) })).status()).toBe(404);
  await page.getByRole('link', { name: 'Return to Boards', exact: true }).click();
  await expect(page.getByRole('link', { name: bob.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: alice.title, exact: true })).toHaveCount(0);
  await other.close();
});

for (const target of ['list', 'load']) {
  test(`an account switch during a pending board ${target} rejects stale context before merging private data`, async ({ page, context }) => {
    await signIn(page);
    const alice = await create(page, `Alice pending ${target}`);
    const endpoint = target === 'list' ? '/api/boards' : `/api/boards/${alice.id}`;
    const held: Route[] = [];
    let released = false;
    await page.route(`**${endpoint}`, async (route) => {
      if (!released && route.request().method() === 'GET') held.push(route);
      else await route.continue();
    });
    await page.goto(target === 'list' ? '/boards' : `/boards/${alice.id}`);
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await expect(page.locator('.application-account')).toHaveText('Account: @alice');
    const other = await context.newPage(); await authorize(other, 'Bob');
    const bob = await create(other, `Bob pending ${target}`);
    const stale = page.waitForResponse((response) => new URL(response.url()).pathname === endpoint);
    // StrictMode may cancel its first mount's read; hold/release every real GET, not a canceled first request alone.
    released = true;
    await Promise.all(held.map((route) => route.continue()));
    const rejected = await stale;
    expect([401, 409]).toContain(rejected.status());
    expect(await rejected.json()).toHaveProperty('error');
    await expect(page.locator('.application-account')).toHaveText('Account: @bob');
    if (target === 'list') await expect(page.getByRole('link', { name: bob.title, exact: true })).toBeVisible();
    else { await expect(page.locator('.board-loading')).toContainText('could not be opened'); await expect(page.locator('.tl-container')).toHaveCount(0); }
    await expect(page.getByRole('link', { name: alice.title, exact: true })).toHaveCount(0);
    await other.close();
  });
}

test('an edit queued during a failed native save cannot replay until explicit retry', async ({ page }, testInfo) => {
  await signIn(page);
  const board = await create(page, 'Queued failed save');
  await page.goto(`/boards/${board.id}`); await draw(page);
  const before = await read(page, board.id);
  const now = Date.now();
  await page.clock.install({ time: now }); await page.clock.pauseAt(now + 1000);
  let first: Route | undefined;
  let writes = 0;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return await route.continue();
    writes += 1;
    if (writes === 1) first = route; else await route.continue();
  });
  await nudge(page, 'ArrowRight'); await page.clock.runFor(350);
  await expect.poll(() => Boolean(first)).toBe(true);
  await nudge(page, 'ArrowDown');
  // Deliver the native store change while PUT is held, before its 300ms save debounce.
  await page.clock.runFor(16);
  if (!first) throw new Error('Missing pending first save');
  await first.abort('connectionfailed');
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
  await page.clock.runFor(1000);
  expect(writes).toBe(1);
  expect((await read(page, board.id)).revision).toBe(before.revision);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'unsaved');
  await page.screenshot({ path: testInfo.outputPath('queued-failure-awaiting-explicit-retry.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await read(page, board.id);
  expect(writes).toBe(2); expect(saved.revision).toBe(before.revision + 1);
  expect(geometry(saved)).toEqual({ x: geometry(before).x + 1, y: geometry(before).y + 1 });
});

test('dirty Sign out and real Stay retain a truthfully blocked native draft until explicit same-user recovery', async ({ page, context }, testInfo) => {
  await signIn(page);
  const board = await create(page, 'Signed-out retained draft');
  await page.goto(`/boards/${board.id}`); await draw(page);
  const before = await read(page, board.id);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing mounted canvas');
  const now = Date.now();
  await page.clock.install({ time: now }); await page.clock.pauseAt(now + 1000);
  let pending: Route | undefined;
  let writes = 0;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return await route.continue();
    writes += 1;
    if (writes === 1) pending = route; else await route.continue();
  });
  await nudge(page, 'ArrowRight'); await page.clock.runFor(350);
  await expect.poll(() => Boolean(pending)).toBe(true);
  const leaving = page.waitForEvent('dialog');
  const signedOut = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'));
  const click = page.getByRole('button', { name: 'Sign out', exact: true }).click({ noWaitAfter: true });
  const warning = await leaving; expect(warning.type()).toBe('beforeunload'); await warning.dismiss(); await click;
  expect((await signedOut).ok()).toBe(true);
  expect((await currentSession(page.request)).status).toBe('signed-out');
  await expect(page).toHaveURL(new RegExp(`/boards/${board.id}$`));
  await expect(page.getByRole('region', { name: 'Account check', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Check account', exact: true })).toBeEnabled();
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  if (!pending) throw new Error('Missing dirty pending save');
  await pending.abort('connectionfailed'); await page.clock.runFor(1000);
  expect(writes).toBe(1);
  await testInfo.attach('retained-logout-state.json', { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => ({
    identity: document.querySelector('.application-account')?.textContent,
    status: document.querySelector('.account-context-status')?.textContent,
    signOutLabel: document.querySelector('.application-nav button')?.textContent,
    editorMounted: Boolean(document.querySelector('.tl-container')),
  }))) });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.screenshot({ path: testInfo.outputPath(`logout-stay-${theme}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of [page.getByRole('button', { name: 'Check account', exact: true }), page.getByRole('link', { name: 'Renew sign-in in a new tab', exact: true })]) {
      const box = await control.boundingBox(); expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`logout-stay-${theme}-narrow.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
  const other = await context.newPage(); await authorize(other, 'Alice');
  await page.getByRole('button', { name: 'Check account', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Account check', exact: true })).toHaveCount(0);
  await page.clock.runFor(1000); expect(writes).toBe(1);
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  expect((await read(page, board.id)).revision).toBe(before.revision);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await read(page, board.id);
  expect(saved.revision).toBe(before.revision + 1);
  expect(geometry(saved)).toEqual({ x: geometry(before).x + 1, y: geometry(before).y });
  await other.close();
});
