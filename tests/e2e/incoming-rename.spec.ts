import { expect, test, type Page } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { readRepository, readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, signIn } from './auth-support.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function readBoard(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function saved(page: Page) {
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
}
async function browse(page: Page, repository: string) {
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  const resolved = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sources/repositories/resolve');
  await page.getByLabel('Search repositories').fill(`alice/${repository}`);
  const response = await resolved;
  expect(response.status()).toBe(200);
  const value = readRepository(await response.json());
  await page.getByRole('button', { name: new RegExp(`alice/${repository}`) }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  return value;
}

test('trusted repository rename repairs the locator without resetting Incoming identity or failed discovery progress', async ({ page }) => {
  await controlProvider(page.request, { reset: true, sourceFailurePage: 2 });
  await signIn(page);
  const created = await page.request.post('/api/boards', { headers: await headers(page), data: { title: 'Incoming trusted rename recovery' } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  await page.goto(`/boards/${board.id}`);
  const original = await browse(page, 'project');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Retry alice/project', exact: true })).toBeVisible();
  await saved(page);
  const failed = await readBoard(page, board.id);
  expect(failed.incoming.sources).toEqual([{ repositoryNodeId: original.nodeId, owner: 'alice', repository: 'project', nextPage: 2, loadedPage: 1, status: 'error', filter: { state: 'all', kind: 'all', label: '' } }]);
  expect(Object.values(failed.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);

  await controlProvider(page.request, { sourceRepositoryRenamed: true, sourceFailurePage: 0 });
  const renamed = await browse(page, 'renamed-project');
  expect(renamed).toEqual({ ...original, name: 'renamed-project' });
  const listed = await page.request.get('/api/sources/repositories/alice/renamed-project/items?page=1', { headers: await headers(page) });
  const first = readSourcePage(await listed.json(), readSourceItem);
  expect(first.items.map(({ reference }) => reference.id)).toEqual(failed.incoming.queue.map((candidate) => candidate.referenceId));
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await saved(page);
  const repaired = await readBoard(page, board.id);
  expect(repaired.incoming).toEqual({ ...failed.incoming, sources: failed.incoming.sources.map((source) => ({ ...source, repository: 'renamed-project' })) });
  await expect(page.getByRole('button', { name: 'Retry alice/renamed-project', exact: true })).toBeVisible();
  const resumed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/sources/repositories/alice/renamed-project/items' && url.searchParams.get('page') === '2';
  });
  await page.getByRole('button', { name: 'Retry alice/renamed-project', exact: true }).click();
  const response = await resumed;
  expect(response.status()).toBe(200);
  expect(readSourcePage(await response.json(), readSourceItem).items.map(({ reference }) => reference.kind)).toEqual(['pull-request', 'pull-request']);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await saved(page);
  const recovered = await readBoard(page, board.id);
  expect(recovered.incoming.sources).toEqual([{ ...failed.incoming.sources[0], repository: 'renamed-project', nextPage: null, loadedPage: 3, status: 'complete' }]);
  expect(recovered.incoming.queue.slice(0, 2)).toEqual(failed.incoming.queue);
  expect(recovered.incoming.seen.slice(0, 2)).toEqual(failed.incoming.seen);
  expect(new Set(recovered.incoming.seen).size).toBe(5);
  expect(Object.values(recovered.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);
});
