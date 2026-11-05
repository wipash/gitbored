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
  await page.getByRole('button', { name: 'Choose sources or add a URL', exact: true }).click();
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  await page.getByRole('button', { name: 'Use repository for Incoming', exact: true }).click();
  await expect(page.locator('.incoming-sources li')).toHaveCount(1);
}
async function saved(page: Page) { await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved'); }

test('bounded mixed discovery retains partial errors, deduplicates a fresh pass, remembers deletion and allows explicit URL re-add across restart', async ({ page }) => {
  const board = await create(page, 'Durable mixed Incoming');
  await chooseSource(page); await saved(page);
  expect((await read(page, board.id)).incoming.sources[0]).toMatchObject({ nextPage: 1, loadedPage: 0, status: 'idle' });
  await page.getByRole('button', { name: 'Discover first page', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(2); await saved(page);
  let state = await read(page, board.id);
  expect(Object.values(state.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);
  expect(state.incoming.sources[0]).toMatchObject({ nextPage: 2, loadedPage: 1, status: 'partial' });
  expect(state.incoming.queue.map((item) => item.kind)).toEqual(['issue', 'pull-request']);
  await page.getByRole('button', { name: 'Discover next page', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(4); await saved(page);
  await controlProvider(page.request, { sourceFailurePage: 3 });
  await page.getByRole('button', { name: 'Discover next page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry discovery', exact: true })).toBeVisible(); await saved(page);
  state = await read(page, board.id);
  expect(state.incoming.sources[0]).toMatchObject({ nextPage: 3, loadedPage: 2, status: 'error' });
  expect(state.incoming.queue).toHaveLength(4);
  await page.reload(); await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await expect(page.getByRole('button', { name: 'Retry discovery', exact: true })).toBeVisible();
  await controlProvider(page.request, { sourceFailurePage: 0 });
  await page.getByRole('button', { name: 'Retry discovery', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5); await saved(page);
  const complete = await read(page, board.id);
  expect(complete.incoming.sources[0]).toMatchObject({ nextPage: null, loadedPage: 3, status: 'complete' });
  expect(new Set(complete.incoming.seen).size).toBe(5);
  const first = complete.incoming.queue[0]; if (!first) throw new Error('Missing candidate');
  await page.locator(`.incoming-candidates [data-reference-id="${first.referenceId}"]`).getByRole('button', { name: 'Add to board', exact: true }).click();
  await saved(page); await page.keyboard.press('Delete'); await saved(page);
  await expect(page.locator('.tl-shape')).toHaveCount(0);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await page.getByRole('button', { name: 'Reconcile source again', exact: true }).click();
  await page.getByRole('button', { name: 'Discover first page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discover next page', exact: true })).toBeVisible(); await saved(page);
  state = await read(page, board.id);
  expect(state.incoming.queue).toEqual(complete.incoming.queue.slice(1));
  expect(state.incoming.seen).toEqual(complete.incoming.seen);
  await page.getByRole('button', { name: 'Choose sources or add a URL', exact: true }).click();
  await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/alice/project/issues/1');
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  await page.getByRole('button', { name: 'Send to Incoming', exact: true }).click(); await saved(page);
  const readded = await read(page, board.id);
  expect(readded.incoming.queue).toEqual([...complete.incoming.queue.slice(1), first]);
  expect(Object.values(readded.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);
  await restartApplication(page.request, 'original'); await page.reload();
  expect((await read(page, board.id)).incoming).toEqual(readded.incoming);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
});

for (const theme of ['light', 'dark']) {
  test(`keyboard Add remains contained, visible and focused in ${theme} desktop and 320px enlarged text`, async ({ page }) => {
    const board = await create(page, `Keyboard Incoming ${theme}`);
    await chooseSource(page);
    await page.getByRole('button', { name: 'Discover first page', exact: true }).click();
    await expect(page.locator('.incoming-candidates > li')).toHaveCount(2); await saved(page);
    await page.getByRole('button', { name: 'Close Incoming', exact: true }).click();
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
    await page.screenshot({ path: `test-results/incoming-${theme}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const add = page.getByRole('button', { name: 'Add to board', exact: true }).first();
    await add.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await expect(add).toBeFocused();
    expect(await add.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const bounds = await add.boundingBox(); if (!bounds) throw new Error('Missing keyboard Add bounds');
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/incoming-${theme}-320-enlarged.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(page.locator('#incoming-panel')).toHaveCount(0);
    await expect(page.locator('.tl-container')).toBeFocused(); await saved(page);
    const state = await read(page, board.id);
    expect(state.incoming.queue).toHaveLength(1);
    const shapes = Object.values(state.document.snapshot.store).filter((record) => record.typeName === 'shape');
    expect(shapes).toHaveLength(1);
    const shape = shapes[0]; if (!shape) throw new Error('Missing revealed placement');
    await expect(page.locator(`[data-shape-id="${shape.id}"]`)).toBeVisible();
    await page.keyboard.press('ArrowRight'); await saved(page);
    await expect.poll(async () => (await read(page, board.id)).document.snapshot.store[shape.id]).toMatchObject({ x: 1, y: 0 });
  });
}
