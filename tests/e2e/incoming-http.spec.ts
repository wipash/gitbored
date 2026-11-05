import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createEmptyBoardDocument, validateBoard, type Board } from '../../src/shared/boards.js';
import { emptyIncoming, type IncomingCandidate, type IncomingState } from '../../src/shared/incoming.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readRepository, readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, restartApplication, signIn } from './auth-support.js';

test.describe.configure({ mode: 'serial' });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function create(page: Page): Promise<Board> {
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title: 'Incoming HTTP boundary' } });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}
async function read(page: Page, id: string): Promise<Board> {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function source(page: Page, owner = 'alice', repository = 'project'): Promise<IncomingState> {
  const response = await page.request.get(`/api/sources/repositories/${owner}/${repository}/items?page=1`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('repository' in body)) throw new Error('Missing authorized repository');
  const repo = readRepository(body.repository);
  const result = readSourcePage(body, readSourceItem);
  expect(result.items.length).toBeGreaterThan(0);
  return { version: 1, sources: [{ repositoryNodeId: repo.nodeId, owner: repo.owner, repository: repo.name,
    nextPage: result.nextPage, loadedPage: result.page, status: result.nextPage === null ? 'complete' : 'partial' }],
  queue: result.items.map(({ reference }) => ({ referenceId: reference.id, kind: reference.kind })),
  seen: result.items.map(({ reference }) => reference.id) };
}
function placed(candidate: IncomingCandidate, x: number) {
  const document = createEmptyBoardDocument();
  const card = { id: 'shape:http-card', typeName: 'shape', type: 'item-card', parentId: 'page:page', index: 'a1',
    x, y: 80, rotation: 0, opacity: 1, isLocked: false, meta: {},
    props: { version: 1, referenceId: candidate.referenceId, kind: candidate.kind, w: 320, h: 240 } };
  return validateNativeDocument({ ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, [card.id]: card } } });
}
async function save(page: Page, board: Board, incoming: IncomingState, document = board.document) {
  return page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: board.revision, document, incoming } });
}

test('authorized Incoming cursor, queue and seen survive reopen and real restart without creating shapes', async ({ page }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page);
  const incoming = await source(page);
  expect(incoming.queue).toHaveLength(2);
  expect(incoming.sources[0]).toMatchObject({ loadedPage: 1, nextPage: 2, status: 'partial' });
  expect((await save(page, board, incoming)).status()).toBe(200);
  const saved = await read(page, board.id);
  expect(saved.incoming).toEqual(incoming);
  expect(saved.document).toEqual(board.document);
  expect(Object.values(saved.document.snapshot.store).filter((record) => record.typeName === 'shape')).toHaveLength(0);
  await page.goto(`/boards/${board.id}`);
  await page.reload();
  expect((await read(page, board.id)).incoming).toEqual(incoming);
  await restartApplication(page.request, 'original');
  await page.reload();
  const reopened = await read(page, board.id);
  expect(reopened.incoming).toEqual(incoming);
  expect(reopened.document).toEqual(board.document);
  expect(reopened.revision).toBe(1);
});

test('competing revisions commit exactly one native document and Incoming queue pair; stale saves mutate neither', async ({ page }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page);
  const incoming = await source(page);
  expect(incoming.queue).toHaveLength(2);
  const operations = incoming.queue.map((candidate, index) => ({ document: placed(candidate, 100 + index * 200),
    incoming: { ...incoming, queue: incoming.queue.filter((item) => item.referenceId !== candidate.referenceId) } }));
  const responses = await Promise.all(operations.map((operation) => save(page, board, operation.incoming, operation.document)));
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const winner = responses.findIndex((response) => response.status() === 200);
  const operation = operations[winner];
  if (!operation) throw new Error('Missing winning operation');
  const saved = await read(page, board.id);
  expect(saved.revision).toBe(1);
  expect(saved.document).toEqual(operation.document);
  expect(saved.incoming).toEqual(operation.incoming);
  expect((await save(page, board, emptyIncoming(), board.document)).status()).toBe(409);
  expect(await read(page, board.id)).toEqual(saved);
});

test('invalid kinds, duplicate queue or seen, and queue/native overlap are rejected without mutation', async ({ page }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page);
  const incoming = await source(page);
  const candidate = incoming.queue[0];
  if (!candidate) throw new Error('Missing authorized candidate');
  const invalid = [
    { ...incoming, queue: [{ ...candidate, kind: candidate.kind === 'issue' ? 'pull-request' as const : 'issue' as const }] },
    { ...incoming, queue: [...incoming.queue, candidate] },
    { ...incoming, seen: [...incoming.seen, candidate.referenceId] },
  ];
  for (const state of invalid) {
    expect((await save(page, board, state)).status()).toBe(400);
    expect(await read(page, board.id)).toEqual(board);
  }
  expect((await save(page, board, incoming, placed(candidate, 120))).status()).toBe(400);
  expect(await read(page, board.id)).toEqual(board);
  expect((await save(page, board, incoming)).status()).toBe(200);
  expect((await read(page, board.id)).incoming).toEqual(incoming);
});

test('owners save their authorized registry while borrowed references and sources are rejected and Bob sees owner boards as 404', async ({ page, browser }) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const board = await create(page);
  const incoming = await source(page);
  expect((await save(page, board, incoming)).status()).toBe(200);
  const saved = await read(page, board.id);
  const context = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await context.newPage();
    await signIn(bob, 'Bob');
    const bobBoard = await create(bob);
    const bobIncoming = await source(bob, 'bob', 'other');
    expect((await save(bob, bobBoard, bobIncoming)).status()).toBe(200);
    const bobSaved = await read(bob, bobBoard.id);
    for (const borrowed of [
      { ...emptyIncoming(), queue: incoming.queue, seen: incoming.seen },
      { ...emptyIncoming(), sources: incoming.sources },
    ]) {
      expect((await save(bob, bobSaved, borrowed)).status()).toBe(400);
      expect(await read(bob, bobBoard.id)).toEqual(bobSaved);
    }
    expect((await bob.request.get(`/api/boards/${board.id}`, { headers: await headers(bob) })).status()).toBe(404);
    expect((await save(bob, saved, incoming)).status()).toBe(404);
    expect(await read(page, board.id)).toEqual(saved);
    expect((await page.request.get(`/api/boards/${bobBoard.id}`, { headers: await headers(page) })).status()).toBe(404);
  } finally { await context.close(); }
});
