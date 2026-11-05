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
  await page.getByRole('button', { name: 'Choose sources or add a URL', exact: true }).click();
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  const loaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/sources/repositories/alice/${repository}/items` && response.request().method() === 'GET';
  });
  await page.getByRole('button', { name: `Browse alice/${repository} · Private`, exact: true }).click();
  const response = await loaded;
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('repository' in body)) throw new Error('Missing authorized repository');
  return { repository: readRepository(body.repository), page: readSourcePage(body, readSourceItem) };
}

test('trusted repository rename repairs the locator without resetting Incoming identity or failed discovery progress', async ({ page }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const created = await page.request.post('/api/boards', { headers: await headers(page), data: { title: 'Incoming trusted rename recovery' } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  const original = await browse(page, 'project');
  await page.getByRole('button', { name: 'Use repository for Incoming', exact: true }).click();
  await expect(page.locator('.incoming-sources li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Discover first page', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(2);
  await saved(page);
  const first = await readBoard(page, board.id);
  expect(first.incoming.sources).toEqual([{ repositoryNodeId: original.repository.nodeId, owner: 'alice', repository: 'project', nextPage: 2, loadedPage: 1, status: 'partial' }]);
  expect(first.incoming.queue).toEqual(original.page.items.map(({ reference }) => ({ referenceId: reference.id, kind: reference.kind })));
  expect(Object.values(first.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);

  await controlProvider(page.request, { sourceRepositoryRenamed: true });
  await page.getByRole('button', { name: 'Discover next page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry discovery', exact: true })).toBeVisible();
  await saved(page);
  const failed = await readBoard(page, board.id);
  expect(failed.incoming).toEqual({ ...first.incoming, sources: first.incoming.sources.map((source) => ({ ...source, status: 'error' })) });

  const renamed = await browse(page, 'renamed-project');
  expect(renamed.repository).toEqual({ ...original.repository, name: 'renamed-project' });
  expect(renamed.page.items.map(({ reference }) => reference)).toEqual(original.page.items.map(({ reference }) => reference));
  expect(renamed.page.items.map(({ reference }) => reference.id)).toEqual(failed.incoming.queue.map((candidate) => candidate.referenceId));
  await page.getByRole('button', { name: 'Use repository for Incoming', exact: true }).click();
  await saved(page);
  const repaired = await readBoard(page, board.id);
  expect(repaired.incoming).toEqual({ ...failed.incoming, sources: failed.incoming.sources.map((source) => ({ ...source, owner: 'alice', repository: 'renamed-project' })) });
  await expect(page.getByRole('button', { name: 'Retry discovery', exact: true })).toBeVisible();

  const resumed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/sources/repositories/alice/renamed-project/items' && url.searchParams.get('page') === '2';
  });
  await page.getByRole('button', { name: 'Retry discovery', exact: true }).click();
  const response = await resumed;
  expect(response.status()).toBe(200);
  const second = readSourcePage(await response.json(), readSourceItem);
  expect(second.items.map(({ reference }) => reference.kind)).toEqual(['pull-request', 'pull-request']);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(4);
  await saved(page);
  const recovered = await readBoard(page, board.id);
  expect(recovered.incoming.sources).toEqual([{ repositoryNodeId: original.repository.nodeId, owner: 'alice', repository: 'renamed-project', nextPage: 3, loadedPage: 2, status: 'partial' }]);
  expect(recovered.incoming.queue).toEqual([...first.incoming.queue, ...second.items.map(({ reference }) => ({ referenceId: reference.id, kind: reference.kind }))]);
  expect(recovered.incoming.seen).toEqual([...first.incoming.seen, ...second.items.map(({ reference }) => reference.id)]);
  expect(new Set(recovered.incoming.seen).size).toBe(4);
  expect(Object.values(recovered.document.snapshot.store).filter((record) => record.typeName === 'shape')).toEqual([]);
});
