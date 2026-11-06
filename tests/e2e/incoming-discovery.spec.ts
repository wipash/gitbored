import { expect, test, type Page } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { applicationOrigin, controlProvider, currentSession, restartApplication, signIn } from './auth-support.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected current owner');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200); return validateBoard(await response.json());
}
async function create(page: Page, title: string) {
  await controlProvider(page.request, { reset: true }); await signIn(page);
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title } });
  const board = validateBoard(await response.json());
  await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  return board;
}
async function chooseSource(page: Page) {
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
}
async function addUrl(page: Page) {
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('https://github.com/alice/project/issues/1');
  await page.getByRole('button', { name: 'Add to Incoming', exact: true }).click();
}
async function saved(page: Page) { await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved'); }

test('bounded mixed discovery retains partial errors, deduplicates a fresh pass, remembers deletion and allows explicit URL re-add across restart', async ({ page }) => {
  const board = await create(page, 'Durable mixed Incoming');
  await controlProvider(page.request, { sourceFailurePage: 3 });
  await chooseSource(page);
  let state = await read(page, board.id);
  await expect(page.getByRole('button', { name: 'Retry alice/project', exact: true })).toBeVisible(); await saved(page);
  state = await read(page, board.id);
  expect(state.incoming.sources[0]).toMatchObject({ nextPage: 3, loadedPage: 2, status: 'error' });
  expect(state.incoming.queue).toHaveLength(4);
  await page.reload(); await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await expect(page.getByRole('button', { name: 'Retry alice/project', exact: true })).toBeVisible();
  await controlProvider(page.request, { sourceFailurePage: 0 });
  await page.getByRole('button', { name: 'Retry alice/project', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5); await saved(page);
  const complete = await read(page, board.id);
  expect(complete.incoming.sources[0]).toMatchObject({ nextPage: null, loadedPage: 3, status: 'complete' });
  expect(new Set(complete.incoming.seen).size).toBe(5);
  const first = complete.incoming.queue[0]; if (!first) throw new Error('Missing candidate');
  await page.locator(`.incoming-candidates [data-reference-id="${first.referenceId}"]`).getByRole('button', { name: /^Add to board:/ }).click();
  await saved(page); await page.getByRole('button', { name: 'Close Incoming' }).click();
  await page.getByRole('button', { name: /^Find/ }).click(); await page.locator('.workspace-find-results button').click();
  await page.keyboard.press('Delete'); await saved(page);
  await expect(page.locator('.tl-shape')).toHaveCount(0);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(async () => (await read(page, board.id)).incoming.sources[0]?.status).toBe('complete'); await saved(page);
  state = await read(page, board.id);
  expect(state.incoming.queue).toEqual(complete.incoming.queue.slice(1));
  expect(state.incoming.seen).toEqual(complete.incoming.seen);
  await addUrl(page); await saved(page);
  const readded = await read(page, board.id);
  expect(readded.incoming.queue).toEqual([...complete.incoming.queue.slice(1), first]);
  expect(Object.values(readded.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);
  await restartApplication(page.request, 'original'); await page.reload();
  expect((await read(page, board.id)).incoming).toEqual(readded.incoming);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
});

for (const theme of ['light', 'dark']) {
  test(`keyboard Add remains reachable and preserves the camera in ${theme} narrow view`, async ({ page }) => {
    const board = await create(page, `Keyboard Incoming ${theme}`);
    await chooseSource(page);
    await expect(page.locator('.incoming-candidates > li')).toHaveCount(5); await saved(page);
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const add = page.getByRole('button', { name: /^Add to board:/ }).first();
    await page.keyboard.press('Tab');
    await add.focus();
    expect(await add.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const bounds = await add.boundingBox(); if (!bounds) throw new Error('Missing keyboard Add bounds');
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    const camera = await page.locator('.tl-shapes').getAttribute('style');
    await page.keyboard.press('Enter');
    await expect(page.locator('#incoming-panel')).toBeVisible();
    await expect(page.locator('#incoming-heading')).toBeFocused();
    await expect(page.locator('.tl-shapes')).toHaveAttribute('style', camera ?? '');
    await saved(page);
    const state = await read(page, board.id);
    expect(state.incoming.queue).toHaveLength(4);
    const shapes = Object.values(state.document.snapshot.store).filter((record) => record.typeName === 'shape');
    expect(shapes).toHaveLength(1);
    await page.getByRole('button', { name: /^Add to board:/ }).first().focus(); await page.keyboard.press('Enter');
    await saved(page);
    const receiving = await read(page, board.id);
    expect(receiving.incoming.queue).toHaveLength(3);
    for (const shape of shapes) expect(receiving.document.snapshot.store[shape.id]).toEqual(shape);
    await page.getByRole('button', { name: 'Close Incoming' }).click();
    await addUrl(page);
    await expect(page.getByRole('status').filter({ hasText: 'Already on this board.' })).toBeAttached();
    expect((await read(page, board.id)).document).toEqual(receiving.document);
  });
}
