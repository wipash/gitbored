import { expect, test, type Page } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 900 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires GitHub fixture.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });
async function create(page: Page, title: string) {
  await signIn(page);
  await page.getByRole('link', { name: 'Boards', exact: true }).click();
  await page.getByLabel('Board name', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.locator('.tl-container')).toBeVisible();
  return page.url().split('/').pop() ?? '';
}
async function board(page: Page, id: string) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected session');
  const response = await page.request.get(`/api/boards/${id}`, { headers: { 'X-CSRF-Token': session.csrfToken } });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function connect(page: Page, state = 'all') {
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption(state);
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
}
async function saved(page: Page) { await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved'); }

test('full-page workspace imports every page, places one undoable batch without moving the camera, and restores the saved board', async ({ page }) => {
  const id = await create(page, 'Desktop batch');
  expect(await page.locator('.board-canvas').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  await connect(page);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await expect(page.getByRole('button', { name: /Discover/ })).toHaveCount(0);
  const camera = await page.locator('.tl-shapes').getAttribute('style');
  await page.getByLabel('Incoming kind').selectOption('pull-request');
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(3);
  await page.getByLabel('Incoming kind').selectOption('all');
  await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
  await expect(page.locator('.workspace-card')).toHaveCount(5);
  await expect(page.locator('#incoming-panel')).toBeVisible();
  await expect(page.locator('.tl-shapes')).toHaveAttribute('style', camera ?? '');
  await saved(page);
  const placed = await board(page, id);
  expect(placed.incoming.queue).toEqual([]);
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await expect(page.locator('.workspace-card')).toHaveCount(0);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.getByRole('button', { name: /^Redo/ }).first().click();
  await expect(page.locator('.workspace-card')).toHaveCount(5);
  await saved(page);
  expect((await board(page, id)).document).toEqual(placed.document);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/boards/${id}$`));
  await expect(page.locator('.workspace-card')).toHaveCount(5);
});

test('project mappings preserve zero and remain outside canvas history; related modes do not change geometry', async ({ page, browser }) => {
  const id = await create(page, 'Project fields and links');
  await connect(page);
  await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
  await saved(page);
  const initial = await board(page, id);
  await page.getByRole('button', { name: 'Close Incoming' }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Delivery' });
  await expect(page.locator('.workspace-card').filter({ has: page.locator('.workspace-card-heading', { hasText: 'Issue #1' }) }).locator('.card-project-fields')).toContainText('In progress');
  await expect(page.locator('.workspace-card').filter({ has: page.locator('.workspace-card-heading', { hasText: 'Issue #1' }) }).locator('.card-project-fields').locator('dd').nth(1)).toHaveText('0');
  await page.getByLabel('Connections', { exact: true }).selectOption('all');
  await expect(page.locator('.related-links path')).toHaveCount(3);
  await page.getByLabel('Connections', { exact: true }).selectOption('off');
  await expect(page.locator('.related-links path')).toHaveCount(0);
  await page.getByLabel('Hide closed').check();
  await expect(page.locator('.workspace-card:visible')).toHaveCount(2);
  await page.getByLabel('Hide closed').uncheck();
  await expect(page.locator('.workspace-card:visible')).toHaveCount(5);
  await saved(page);
  const mapped = await board(page, id);
  expect(mapped.document).toEqual(initial.document);
  expect(mapped.incoming.planning).toMatchObject({ projectId: 'P_alice', weight: 'F_weight' });
  expect(JSON.stringify(mapped.document)).not.toMatch(/Delivery|Sprint 12|In progress/);
  await page.getByRole('button', { name: 'Close View', exact: true }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').first().click();
  await page.getByLabel('Card size').selectOption('expanded');
  await expect.poll(async () => Object.values((await board(page, id)).document.snapshot.store).filter((record) => record.typeName === 'shape' && record.type === 'item-card' && record.props.w === 420 && record.props.h === 300).length).toBe(1);
  const resized = await board(page, id);
  expect(Object.values(resized.document.snapshot.store).filter((record) => record.typeName === 'shape' && record.type === 'item-card' && record.props.w === 420 && record.props.h === 300)).toHaveLength(1);
  await page.reload();
  expect((await board(page, id)).document).toEqual(resized.document);
  const referenceId = initial.incoming.seen[0];
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    await signIn(await other.newPage(), 'Bob');
    const bob = await currentSession(other.request);
    if (bob.status !== 'signed-in') throw new Error('Expected Bob');
    expect((await other.request.get(`/api/references/${referenceId}/context`, { headers: { 'X-CSRF-Token': bob.csrfToken } })).status()).toBe(404);
  } finally { await other.close(); }
});

test('automatic discovery pauses on errors and cannot pretend a partial import is all matching', async ({ page }) => {
  await create(page, 'Partial source');
  await controlProvider(page.request, { sourceFailurePage: 2 });
  await connect(page);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add all matching', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry alice/project' })).toBeVisible();
  await controlProvider(page.request, { sourceFailurePage: 0 });
  await page.getByRole('button', { name: 'Retry alice/project' }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Add all matching', exact: true })).toBeEnabled();
  const stats = await page.request.get(`${providerOrigin}/__source-stats`);
  expect(stats.ok()).toBe(true);
});
