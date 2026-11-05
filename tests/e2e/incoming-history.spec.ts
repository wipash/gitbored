import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boardSaveValidator, validateBoard } from '../../src/shared/boards.js';
import type { Board, BoardSave } from '../../src/shared/boards.js';
import { validateIncoming } from '../../src/shared/incoming.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, signIn } from './auth-support.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in account');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function validatedBoard(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
function shapes(board: Board) {
  return Object.values(board.document.snapshot.store).filter((record) => record.typeName === 'shape');
}
async function queuedBoard(page: Page, title: string) {
  await signIn(page);
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title } });
  expect(response.status()).toBe(201);
  const board = validateBoard(await response.json());
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await expect(page.getByRole('heading', { name: /^Incoming \d+$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Choose sources or add a URL', exact: true }).click();
  await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/alice/project/issues/1');
  const resolved = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/sources/resolve' && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  const result = await resolved;
  expect(result.status()).toBe(200);
  const item = readSourceItem(await result.json());
  await page.getByRole('button', { name: 'Send to Incoming', exact: true }).click();
  const candidate = { referenceId: item.reference.id, kind: item.reference.kind };
  await expect.poll(async () => (await validatedBoard(page, board.id)).incoming.queue).toEqual([candidate]);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const queued = await validatedBoard(page, board.id);
  expect(shapes(queued)).toEqual([]);
  expect(queued.incoming.seen).toEqual([candidate.referenceId]);
  await expect(page.locator('.tl-shape')).toHaveCount(0);
  return { board: queued, candidate };
}
async function add(page: Page) {
  if (!(await page.getByRole('button', { name: 'Add to board', exact: true }).isVisible())) {
    await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  }
  await page.getByRole('button', { name: 'Add to board', exact: true }).click();
  await expect(page.locator('#incoming-panel')).toHaveCount(0);
  await expect(page.locator('.tl-container')).toBeFocused();
}
async function durable(page: Page, id: string, referenceId: string, count: number, queued: boolean, after: number) {
  await expect.poll(async () => {
    const board = await validatedBoard(page, id);
    return { advanced: board.revision > after, references: shapes(board).map((shape) => 'referenceId' in shape.props ? shape.props.referenceId : null), queue: board.incoming.queue };
  }).toEqual({ advanced: true, references: Array.from({ length: count }, () => referenceId), queue: queued ? [{ referenceId, kind: 'issue' }] : [] });
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.locator('.tl-shape')).toHaveCount(count);
  await expect(page.getByRole('button', { name: /^Incoming \d+$/ })).toHaveText(`Incoming ${queued ? 1 : 0}`);
  return await validatedBoard(page, id);
}

test('first-placement history owns Incoming consumption, unlike native duplication and deletion, including a new placement branch', async ({ page }) => {
  const { board, candidate } = await queuedBoard(page, 'Incoming native history');
  let previous = board;
  async function check(count: number, queued: boolean) {
    previous = await durable(page, board.id, candidate.referenceId, count, queued, previous.revision);
    expect(previous.incoming.seen).toEqual([candidate.referenceId]);
    return previous;
  }
  await add(page);
  const placed = await check(1, false);
  const original = shapes(placed)[0];
  expect(original).toMatchObject({ x: 0, y: 0, props: { referenceId: candidate.referenceId, kind: candidate.kind } });
  await page.keyboard.press('Control+z'); await check(0, true);
  await page.keyboard.press('Control+Shift+z'); await check(1, false);
  await page.keyboard.press('Control+d'); await check(2, false);
  await page.keyboard.press('Control+z');
  const unduplicated = await check(1, false);
  expect(shapes(unduplicated)).toEqual([original]);
  await page.keyboard.press('Delete'); await check(0, false);
  await page.keyboard.press('Control+z'); await check(1, false);
  await page.keyboard.press('Control+Shift+z'); await check(0, false);
  await page.keyboard.press('Control+z'); await check(1, false);
  await page.keyboard.press('Control+z'); await check(0, true);
  // Add again branches native history: the new placement, not the abandoned mark, owns consumption.
  await add(page);
  const branched = await check(1, false);
  expect(shapes(branched)[0]?.id).not.toBe(original?.id);
  await page.keyboard.press('Control+z'); await check(0, true);
  await page.keyboard.press('Control+Shift+z'); await check(1, false);
  await page.keyboard.press('Delete'); await check(0, false);
});

test('transport failure retains the atomic local placement, explicit retry saves latest native movement, and stale save conflicts retain local work', async ({ page }) => {
  const { board, candidate } = await queuedBoard(page, 'Incoming retry and conflict');
  const now = Date.now();
  await page.clock.install({ time: now }); await page.clock.pauseAt(now + 1000);
  const writes: BoardSave[] = [];
  let fail = true;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return await route.continue();
    const payload = boardSaveValidator.validate(route.request().postDataJSON());
    writes.push({ ...payload, document: validateNativeDocument(payload.document), incoming: validateIncoming(payload.incoming) });
    if (fail) { fail = false; await route.abort('connectionfailed'); }
    else await route.continue();
  });
  await add(page); await page.clock.runFor(400);
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'unsaved');
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Incoming \d+$/ })).toHaveText('Incoming 0');
  expect(writes).toHaveLength(1);
  const failed = writes[0];
  if (!failed) throw new Error('Missing failed placement payload');
  expect(failed.incoming.queue).toEqual([]);
  expect(failed.expectedRevision).toBe(board.revision);
  expect(await validatedBoard(page, board.id)).toEqual(board);
  await page.locator('.tl-container').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  await page.clock.runFor(1000);
  expect(writes).toHaveLength(1);
  expect(await validatedBoard(page, board.id)).toEqual(board);
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Incoming \d+$/ })).toHaveText('Incoming 0');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await validatedBoard(page, board.id);
  expect(writes).toHaveLength(2);
  expect(saved.revision).toBe(board.revision + 1);
  expect(saved.document).toEqual(writes[1]?.document);
  expect(saved.incoming).toEqual(writes[1]?.incoming);
  expect(saved.incoming.queue).toEqual([]);
  const placement = shapes(saved)[0];
  expect(shapes(saved)).toHaveLength(1);
  expect(placement).toMatchObject({ x: 1, y: 1, props: { referenceId: candidate.referenceId, kind: candidate.kind } });
  // A real second writer wins the CAS; this tab still owns its unsaved movement.
  const external = await page.request.put(`/api/boards/${board.id}`, {
    headers: await headers(page),
    data: { expectedRevision: saved.revision, document: saved.document, incoming: saved.incoming },
  });
  expect(external.status()).toBe(200);
  const server = await validatedBoard(page, board.id);
  expect(server.revision).toBe(saved.revision + 1);
  await page.locator('.tl-container').focus(); await page.keyboard.press('ArrowRight');
  await page.clock.runFor(400);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'conflict');
  expect(writes).toHaveLength(3);
  const local = writes[2];
  if (!local) throw new Error('Missing conflicted local operation');
  expect(local.expectedRevision).toBe(saved.revision);
  expect(local.incoming).toEqual(saved.incoming);
  const localBoard = validateBoard({ ...saved, document: local.document, incoming: local.incoming });
  expect(shapes(localBoard)).toHaveLength(1);
  expect(shapes(localBoard)[0]).toMatchObject({ id: placement?.id, x: 2, y: 1, props: { referenceId: candidate.referenceId } });
  await expect(page.locator('.tl-shape')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Incoming \d+$/ })).toHaveText('Incoming 0');
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
  await page.clock.runFor(1000);
  expect(writes).toHaveLength(3);
  expect(await validatedBoard(page, board.id)).toEqual(server);
});
