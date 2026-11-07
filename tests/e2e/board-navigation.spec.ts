import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { applicationOrigin, controlProvider, currentSession, openSettings, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in account');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}

async function create(page: Page, title: string) {
  const response = await page.request.post('/api/boards', {
    headers: await headers(page), data: { title },
  });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}

async function draw(page: Page) {
  const canvas = page.locator('.tl-container');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: /^Rectangle/ }).click();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing native canvas');
  const start = { x: bounds.x + 300, y: bounds.y + 180 };
  const end = { x: bounds.x + 420, y: bounds.y + 270 };
  await expectNativePoint(page, start); await expectNativePoint(page, end);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
}

test('deleting a board while a navigation save waits releases navigation for the next board', async ({ page }) => {
  await signIn(page);
  const board = await create(page, 'Delete after pending navigation');
  const next = await create(page, 'Next navigation remains available');
  await page.goto(`/boards/${board.id}`);
  await draw(page);
  const pending: Route[] = [];
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() === 'PUT') pending.push(route);
    else await route.continue();
  });
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pending.length).toBe(1);
  await openSettings(page);
  await page.getByRole('link', { name: 'Boards', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/boards/${board.id}`);
  await page.getByRole('button', { name: 'Delete board', exact: true }).click();
  await page.getByLabel('Type the board name to confirm').fill(board.title);
  await page.getByRole('button', { name: 'Delete board permanently', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeFocused();
  await expect(page).toHaveURL('/boards');
  await page.getByRole('link', { name: next.title, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/boards/${next.id}`);
  await expect(page.getByRole('heading', { name: next.title, exact: true })).toBeFocused();
  expect((await page.request.get(`/api/boards/${board.id}`, { headers: await headers(page) })).status()).toBe(404);
});

test('browser Back supersedes an earlier board link while its save is pending and preserves Forward', async ({ page }) => {
  await signIn(page);
  const first = await create(page, 'Earlier link destination');
  const previous = await create(page, 'Latest browser Back destination');
  const current = await create(page, 'Pending native work');
  await page.reload();
  await page.getByRole('link', { name: first.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
  for (const board of [previous, current]) {
    await page.getByRole('button', { name: 'Boards ▾', exact: true }).click();
    await page.getByRole('link', { name: board.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: board.title, exact: true })).toBeVisible();
  }
  await draw(page);
  const original = validateBoard(await (await page.request.get(`/api/boards/${current.id}`, { headers: await headers(page) })).json());
  const pending: Route[] = [];
  await page.route(`**/api/boards/${current.id}`, async (route) => {
    if (route.request().method() === 'PUT') pending.push(route);
    else await route.continue();
  });
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole('button', { name: 'Boards ▾', exact: true }).click();
  await page.getByRole('link', { name: first.title, exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.goBack();
  await expect(page).toHaveURL(`/boards/${previous.id}`);
  await expect(page.getByRole('heading', { name: current.title, exact: true })).toBeVisible();
  const save = pending.shift();
  if (!save) throw new Error('Missing held native save');
  await save.continue();
  await expect(page.getByRole('heading', { name: previous.title, exact: true })).toBeFocused();
  await expect(page).toHaveURL(`/boards/${previous.id}`);
  const saved = validateBoard(await (await page.request.get(`/api/boards/${current.id}`, { headers: await headers(page) })).json());
  expect(saved.revision).toBe(original.revision + 1);
  await page.goForward();
  await expect(page).toHaveURL(`/boards/${current.id}`);
  await expect(page.getByRole('heading', { name: current.title, exact: true })).toBeFocused();
  await expect(page.locator('.tl-shape')).toHaveCount(1);
});

test('account replacement cancels a pending Back without leaving the address behind the mounted route', async ({ page, context }) => {
  await signIn(page);
  const board = await create(page, 'Alice pending Back');
  await page.reload();
  await page.getByRole('link', { name: board.title, exact: true }).click();
  await draw(page);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing original native canvas');
  const pending: Route[] = [];
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() === 'PUT') pending.push(route);
    else await route.continue();
  });
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pending.length).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL('/boards');
  await expect(page.getByRole('heading', { name: board.title, exact: true })).toBeVisible();

  const other = await context.newPage();
  await other.goto('/boards');
  await openSettings(other);
  await other.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(other.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
  // The real board-list read detects the ended session while the save stays held.
  await page.getByRole('button', { name: 'Boards ▾', exact: true }).click();
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Check account', exact: true })).toBeVisible();
  await other.getByRole('link', { name: 'Sign in with GitHub' }).click();
  await other.getByRole('link', { name: 'Authorize Bob', exact: true }).click();
  const bob = await create(other, 'Bob after canceled Back');
  await page.getByRole('button', { name: 'Check account', exact: true }).click();
  await expect(page.locator('.tl-container')).toHaveCount(0);
  expect(await original.evaluate((element) => element.isConnected)).toBe(false);
  await expect(page.locator('.board-loading')).toContainText('could not be opened');
  await expect(page).toHaveURL(`/boards/${board.id}`);
  await page.getByRole('link', { name: 'Return to Boards', exact: true }).click();
  await expect(page).toHaveURL('/boards');
  await expect(page.getByRole('link', { name: bob.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: board.title, exact: true })).toHaveCount(0);
  await other.close();
});

test('a failed Back save restores the current address and native draft until explicit retry', async ({ page }) => {
  await signIn(page);
  const board = await create(page, 'Failed Back retains native draft');
  await page.reload();
  await page.getByRole('link', { name: board.title, exact: true }).click();
  await draw(page);
  const original = await page.locator('.tl-container').elementHandle();
  if (!original) throw new Error('Missing original native canvas');
  const pending: Route[] = [];
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() === 'PUT') pending.push(route);
    else await route.continue();
  });
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pending.length).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL('/boards');
  const save = pending.shift();
  if (!save) throw new Error('Missing held native save');
  await save.abort('connectionfailed');
  await expect(page).toHaveURL(`/boards/${board.id}`);
  await expect(page.locator('.board-save')).toContainText('saving failed');
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  await page.unroute(`**/api/boards/${board.id}`);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await page.goBack();
  await expect(page).toHaveURL('/boards');
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeFocused();
});
