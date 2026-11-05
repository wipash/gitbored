import { expect, test } from '@playwright/test';
import type { Page, Route, APIResponse } from '@playwright/test';
import { T } from '@tldraw/validate';
import { validateIncoming } from '../../src/shared/incoming.js';
import { createEmptyBoardDocument, validateBoard, type Board } from '../../src/shared/boards.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readRepository, readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, restartApplication, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1100 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });
async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Missing authenticated session');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function read(page: Page, id: string): Promise<Board> {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function create(page: Page): Promise<Board> {
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title: 'Recovery mixed work' } });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}
async function stored(page: Page) {
  const entries = await page.evaluate(() => {
    const entries: { key: string; value: string }[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('gitbored:recovery:')) continue;
      const value = localStorage.getItem(key);
      if (value) entries.push({ key, value });
    }
    return entries;
  });
  return entries.map(({ key, value }) => {
    const parsed = T.object({ version: T.literal(1), accountId: T.string, boardId: T.string, writerId: T.string, updatedAt: T.number, expectedRevision: T.number, document: T.unknown, incoming: T.unknown }).validate(JSON.parse(value));
    return { key, value: { ...parsed, document: validateNativeDocument(parsed.document), incoming: validateIncoming(parsed.incoming) } };
  });
}
async function nudgeLatest(page: Page, key?: string) {
  const before = (await stored(page)).find((entry) => !key || entry.key === key);
  if (!before) throw new Error('Missing draft before native nudge');
  const shape = Object.values(before.value.document.snapshot.store).find((record) => record.typeName === 'shape' && record.type === 'geo');
  if (shape?.typeName !== 'shape') throw new Error('Missing native rectangle');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  await expect.poll(async () => {
    const next = (await stored(page)).find((entry) => entry.key === before.key);
    return Object.values(next?.value.document.snapshot.store ?? {}).find((record) => record.id === shape.id);
  }).toMatchObject({ x: shape.x + 1, y: shape.y + 1 });
}
async function draw(page: Page, offset = 0) {
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: /^Rectangle/ }).click();
  await page.locator('.tl-container').scrollIntoViewIfNeeded();
  const box = await page.locator('.tl-container').boundingBox();
  if (!box) throw new Error('No canvas');
  const start = { x: box.x + 600 + offset, y: Math.max(box.y + 170, 180) };
  const end = { x: start.x + 110, y: start.y + 85 };
  await expectNativePoint(page, start); await expectNativePoint(page, end);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
}
async function seedMixed(page: Page, board: Board) {
  const response = await page.request.get('/api/sources/repositories/alice/project/items?page=1', { headers: await headers(page) });
  expect(response.status()).toBe(200);
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('repository' in payload)) throw new Error('No repository');
  const repository = readRepository(payload.repository);
  const result = readSourcePage(payload, readSourceItem);
  const first = result.items[0];
  if (!first) throw new Error('No provider reference');
  const empty = createEmptyBoardDocument();
  const base = { typeName: 'shape', rotation: 0, opacity: 1, isLocked: false, meta: {} };
  const records = [
    { ...base, id: 'shape:frame', type: 'frame', parentId: 'page:page', index: 'a1', x: 40, y: 40, props: { w: 450, h: 450, name: 'Recovery frame', color: 'black' } },
    { ...base, id: 'shape:group', type: 'group', parentId: 'shape:frame', index: 'a1', x: 10, y: 10, props: {} },
    { ...base, id: 'shape:card', type: 'item-card', parentId: 'shape:group', index: 'a1', x: 20, y: 30, props: { version: 1, referenceId: first.reference.id, kind: first.reference.kind, w: 320, h: 240 } },
    { ...base, id: 'shape:text', type: 'text', parentId: 'shape:group', index: 'a2', x: 20, y: 300, props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 300, autoSize: true, scale: 1, richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Authored recovery note' }] }] } } },
    { ...base, id: 'shape:arrow', type: 'arrow', parentId: 'shape:frame', index: 'a2', x: 100, y: 330, props: { kind: 'arc', labelColor: 'black', color: 'black', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw', start: { x: 0, y: 0 }, end: { x: 250, y: 40 }, bend: 0, richText: { type: 'doc', content: [{ type: 'paragraph' }] }, labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5 } },
    { id: 'binding:arrow-card', typeName: 'binding', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:card', meta: {}, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } },
  ];
  const document = validateNativeDocument({ ...empty, snapshot: { ...empty.snapshot, store: { ...empty.snapshot.store, ...Object.fromEntries(records.map((record) => [record.id, record])) } } });
  const incoming: Board['incoming'] = { version: 1, sources: [{ repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, loadedPage: 1, nextPage: result.nextPage, status: 'partial' }],
    queue: result.items.slice(1).map(({ reference }) => ({ referenceId: reference.id, kind: reference.kind })), seen: result.items.map(({ reference }) => reference.id) };
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: board.revision, document, incoming } })).status()).toBe(200);
  return read(page, board.id);
}

test('two independent contexts preserve the latest conflicting mixed pair as a private copy without changing the winner', async ({ page, browser }, testInfo) => {
  await signIn(page);
  const board = await seedMixed(page, await create(page));
  const otherContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 1100 } });
  try {
    const other = await otherContext.newPage(); await signIn(other);
    await page.goto(`/boards/${board.id}`); await other.goto(`/boards/${board.id}`);
    await draw(other); await expect(other.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
    const winner = await read(other, board.id);
    await draw(page, 140); await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'conflict');
    await nudgeLatest(page);
    await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
    await page.getByRole('button', { name: 'Add to board', exact: true }).click();
    await expect.poll(async () => (await stored(page))[0]?.value.incoming.queue).toEqual([]);
    const drafts = await stored(page); expect(drafts).toHaveLength(1);
    const draft = drafts[0]; if (!draft) throw new Error('No local draft');
    expect(draft.value.incoming).toEqual({ ...board.incoming, queue: [] });
    expect(JSON.stringify(draft.value)).not.toContain('Long complete title');
    expect(JSON.stringify(draft.value)).not.toContain('Label 1 extended');
    expect(Object.values(draft.value.document.snapshot.store).find((record) => record.id === 'binding:arrow-card')).toEqual(Object.values(board.document.snapshot.store).find((record) => record.id === 'binding:arrow-card'));
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.screenshot({ path: testInfo.outputPath(`conflict-${theme}-desktop.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('conflict-dark-320-enlarged.png'), fullPage: true });
    await page.route(`**/api/boards/${board.id}/copy`, async (route) => { await route.abort('connectionfailed'); });
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'copy could not be saved' })).toBeVisible();
    expect((await stored(page))[0]?.value).toEqual(draft.value);
    expect(await read(page, board.id)).toEqual(winner);
    await page.unroute(`**/api/boards/${board.id}/copy`);
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`${board.id}$`));
    const copyId = page.url().split('/').pop(); if (!copyId) throw new Error('No copy ID');
    const copy = await read(page, copyId);
    expect(copy.document).toEqual(draft.value.document); expect(copy.incoming).toEqual(draft.value.incoming);
    expect(copy.revision).toBe(0); expect(await read(page, board.id)).toEqual(winner);
    expect(await stored(page)).toHaveLength(0);
    const bobContext = await browser.newContext({ baseURL: applicationOrigin });
    try {
      const bob = await bobContext.newPage(); await signIn(bob, 'Bob');
      expect((await bob.request.get(`/api/boards/${copyId}`, { headers: await headers(bob) })).status()).toBe(404);
      expect((await bob.request.post(`/api/boards/${board.id}/copy`, { headers: await headers(bob), data: { title: 'Stolen', document: copy.document, incoming: copy.incoming } })).status()).toBe(404);
    } finally { await bobContext.close(); }
  } finally { await otherContext.close(); }
});

test('failed saves persist the newest pair across real server restart and browser reopen; newer server requires explicit choices', async ({ page, context, browser }, testInfo) => {
  await signIn(page); const board = await seedMixed(page, await create(page));
  await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  await nudgeLatest(page);
  const drafts = await stored(page); const draft = drafts[0]; if (!draft) throw new Error('No interrupted recovery');
  const ownerHeaders = await headers(page);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: ownerHeaders, data: { expectedRevision: board.revision, document: board.document, incoming: board.incoming } })).status()).toBe(200);
  const winner = await read(page, board.id);
  const state = await context.storageState();
  await restartApplication(page.request, 'original');
  const reopenedContext = await browser.newContext({ baseURL: applicationOrigin, storageState: state, viewport: { width: 1440, height: 1100 } });
  try {
    const reopened = await reopenedContext.newPage(); await reopened.goto(`/boards/${board.id}`);
    await expect(reopened.getByRole('heading', { name: 'Recover local work' })).toBeFocused();
    await reopened.keyboard.press('Tab');
    await expect(reopened.getByRole('button', { name: 'Save as copy', exact: true })).toBeFocused();
    expect(await reopened.getByRole('button', { name: 'Save as copy', exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await expect(reopened.locator('.tl-container')).toHaveCount(0);
    await expect(reopened.getByRole('button', { name: 'Review local draft' })).toHaveCount(0);
    expect(await read(reopened, board.id)).toEqual(winner);
    for (const theme of ['light', 'dark']) {
      await reopened.getByLabel('Theme', { exact: true }).selectOption(theme);
      await reopened.screenshot({ path: testInfo.outputPath(`recovery-${theme}-desktop.png`), fullPage: true });
      const pairs = await reopened.locator('.board-recovery').evaluate((element) => {
        const colorOf = (node: Element) => {
          const style = getComputedStyle(node);
          let background: Element | null = node;
          while (background && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
          return { text: node.tagName, foreground: style.color, background: background ? getComputedStyle(background).backgroundColor : 'rgb(255, 255, 255)', lineHeight: style.lineHeight, fontSize: style.fontSize };
        };
        return [...element.querySelectorAll('h1, h2, p, button, a')].map(colorOf);
      });
      await testInfo.attach(`recovery-${theme}-rendered-styles`, { body: JSON.stringify(pairs), contentType: 'application/json' });
    }
    await reopened.setViewportSize({ width: 320, height: 1000 });
    await reopened.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await reopened.screenshot({ path: testInfo.outputPath('recovery-dark-320-enlarged.png'), fullPage: true });
    await reopened.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(reopened).not.toHaveURL(new RegExp(`${board.id}$`));
    const copyId = reopened.url().split('/').pop(); if (!copyId) throw new Error('No reopened copy');
    const copy = await read(reopened, copyId);
    expect(copy.document).toEqual(draft.value.document); expect(copy.incoming).toEqual(draft.value.incoming);
    expect(await read(reopened, board.id)).toEqual(winner);
    expect(await stored(reopened)).toEqual([draft]);
  } finally { await reopenedContext.close(); }
});

test('held real acknowledgements cannot mark newer edits saved or clear a sibling tab recovery', async ({ page, context }) => {
  await signIn(page); const board = await create(page);
  await page.goto(`/boards/${board.id}`);
  const other = await context.newPage(); await other.goto(`/boards/${board.id}`);
  await other.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(other); await expect(other.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const otherDraft = (await stored(other))[0]; if (!otherDraft) throw new Error('No sibling draft');
  const held: { route: Route; response: APIResponse }[] = [];
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    held.push({ route, response: await route.fetch() });
  });
  await draw(page); await expect.poll(() => held.length).toBe(1);
  const own = (await stored(page)).find((entry) => entry.key !== otherDraft.key);
  if (!own) throw new Error('No flight draft');
  await nudgeLatest(page, own.key);
  const latest = (await stored(page)).find((entry) => entry.key !== otherDraft.key);
  if (!latest) throw new Error('No newer local pair');
  const first = held.shift(); if (!first) throw new Error('Missing first acknowledgement');
  await first.route.fulfill({ response: first.response });
  await expect.poll(() => held.length).toBe(1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saving');
  expect((await stored(page)).find((entry) => entry.key === latest.key)?.value).toMatchObject({ expectedRevision: 1, document: latest.value.document, incoming: latest.value.incoming });
  const second = held.shift(); if (!second) throw new Error('Missing second acknowledgement');
  await second.route.fulfill({ response: second.response });
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect((await read(page, board.id)).document).toEqual(latest.value.document);
  expect(await stored(page)).toEqual([otherDraft]);
  other.on('dialog', (dialog) => { void dialog.accept(); });
  await other.reload(); await expect(other.getByRole('heading', { name: 'Recover local work' })).toBeVisible();
  const beforeReload = await read(page, board.id);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: beforeReload.revision, document: beforeReload.document, incoming: beforeReload.incoming } })).status()).toBe(200);
  await other.getByRole('button', { name: 'Reload server version' }).click();
  await expect(other.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect(await stored(other)).toEqual([otherDraft]);
  await other.unroute(`**/api/boards/${board.id}`);
  await draw(other, 150);
  await expect(other.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect((await read(other, board.id)).revision).toBe(beforeReload.revision + 2);
  expect(await stored(other)).toEqual([otherDraft]);
  await other.close();
});

test('same-revision recovery waits for explicit retry and account/logout isolation never exposes another owner draft', async ({ page, context }) => {
  await signIn(page); const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('Missing owner');
  const board = await create(page); await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const original = (await stored(page))[0]; if (!original) throw new Error('Missing scoped draft');
  const serialized = JSON.stringify(original.value);
  expect(serialized).not.toContain(session.csrfToken);
  expect(Object.keys(original.value).sort()).toEqual(['accountId', 'boardId', 'document', 'expectedRevision', 'incoming', 'updatedAt', 'version', 'writerId']);
  const account = await context.newPage(); await account.goto('/account');
  await account.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(account.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload(); await expect(page.getByRole('link', { name: 'Sign in with GitHub', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in with GitHub', exact: true }).click();
  await page.getByRole('link', { name: 'Authorize Bob', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connected account' })).toBeVisible();
  await page.goto(`/boards/${board.id}`);
  await expect(page.getByRole('button', { name: 'Retry opening' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recover local work' })).toHaveCount(0);
  await expect(page.locator('.tl-container')).toHaveCount(0);
  expect(await stored(page)).toEqual([original]);
  await page.goto('/api/auth/github'); await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connected account' })).toBeVisible();
  await page.unroute(`**/api/boards/${board.id}`);
  await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: 'Review local draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  expect((await read(page, board.id)).revision).toBe(0);
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect((await read(page, board.id)).document).toEqual(original.value.document);
  expect(await stored(page)).toHaveLength(0);
  await account.close();
});

test('a real copy acknowledgement never consumes edits made while the private copy is in flight', async ({ page, context }) => {
  await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const captured = (await stored(page))[0]; if (!captured) throw new Error('Missing captured copy pair');
  const held: { route: Route; response: APIResponse }[] = [];
  await page.route(`**/api/boards/${board.id}/copy`, async (route) => { held.push({ route, response: await route.fetch() }); });
  await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
  await expect.poll(() => held.length).toBe(1);
  await draw(page, 150);
  await expect.poll(async () => Object.values((await stored(page))[0]?.value.document.snapshot.store ?? {}).filter((record) => record.typeName === 'shape').length).toBe(2);
  const latest = (await stored(page))[0]; if (!latest) throw new Error('Missing newer copy-time edits');
  const flight = held.shift(); if (!flight) throw new Error('Missing actual copy acknowledgement');
  await flight.route.fulfill({ response: flight.response });
  const link = page.getByRole('link', { name: 'Open saved copy', exact: true });
  await expect(link).toBeVisible(); await expect(page).toHaveURL(new RegExp(`${board.id}$`));
  expect(await stored(page)).toEqual([latest]);
  expect(await read(page, board.id)).toEqual(board);
  const href = await link.getAttribute('href'); if (!href) throw new Error('No created copy destination');
  const copyPage = await context.newPage(); await copyPage.goto(href);
  const id = copyPage.url().split('/').pop(); if (!id) throw new Error('Missing copy ID');
  expect((await read(copyPage, id)).document).toEqual(captured.value.document);
  await page.unroute(`**/api/boards/${board.id}`);
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  expect((await read(page, board.id)).document).toEqual(latest.value.document);
  expect((await read(copyPage, id)).document).toEqual(captured.value.document);
  await copyPage.close();
});

test('copy validates native and atomic Incoming payloads and enforces the public origin/session boundary', async ({ page, browser }) => {
  await signIn(page); const board = await seedMixed(page, await create(page));
  const url = `/api/boards/${board.id}/copy`;
  const ownerHeaders = await headers(page);
  const valid = { title: 'Validated private copy', document: board.document, incoming: board.incoming };
  expect((await page.request.post(url, { headers: { ...ownerHeaders, Origin: 'https://untrusted.invalid' }, data: valid })).status()).toBe(403);
  expect((await page.request.post(url, { headers: { ...ownerHeaders, 'X-CSRF-Token': 'wrong-token' }, data: valid })).status()).toBe(403);
  const summariesBefore: unknown = await (await page.request.get('/api/boards', { headers: ownerHeaders })).json();
  const anonymous = await browser.newContext({ baseURL: applicationOrigin });
  try { expect((await anonymous.request.post(url, { headers: { Origin: applicationOrigin }, data: valid })).status()).toBe(401); }
  finally { await anonymous.close(); }
  const bobContext = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await bobContext.newPage(); await signIn(bob, 'Bob');
    const response = await bob.request.get('/api/sources/repositories/bob/other/items?page=1', { headers: await headers(bob) });
    expect(response.status()).toBe(200);
    const foreign = readSourcePage(await response.json(), readSourceItem).items[0];
    if (!foreign) throw new Error('No foreign-account reference');
    expect((await page.request.post(url, { headers: ownerHeaders, data: { ...valid, incoming: { ...board.incoming,
      queue: [...board.incoming.queue, { referenceId: foreign.reference.id, kind: foreign.reference.kind }], seen: [...board.incoming.seen, foreign.reference.id] } } })).status()).toBe(400);
    expect((await bob.request.post(url, { headers: await headers(bob), data: valid })).status()).toBe(404);
  } finally { await bobContext.close(); }
  expect((await page.request.post(url, { headers: { Origin: applicationOrigin }, data: valid })).status()).toBe(403);
  const card = Object.values(board.document.snapshot.store).find((record) => record.typeName === 'shape' && record.type === 'item-card');
  if (card?.typeName !== 'shape' || card.type !== 'item-card') throw new Error('No mixed placed reference');
  const invalid = [
    { ...valid, document: { ...board.document, version: 99 } },
    { ...valid, incoming: { ...board.incoming, queue: [...board.incoming.queue, { referenceId: card.props.referenceId, kind: card.props.kind }] } },
    { ...valid, incoming: { ...board.incoming, seen: [...board.incoming.seen, 'borrowed-reference'] } },
  ];
  for (const data of invalid) expect((await page.request.post(url, { headers: ownerHeaders, data })).status()).toBe(400);
  expect(await (await page.request.get('/api/boards', { headers: ownerHeaders })).json()).toEqual(summariesBefore);
  const copied = await page.request.post(url, { headers: ownerHeaders, data: valid });
  expect(copied.status()).toBe(201);
  const result = validateBoard(await copied.json());
  expect(result.document).toEqual(board.document); expect(result.incoming).toEqual(board.incoming);
  expect(await read(page, board.id)).toEqual(board);
});

test('equal deferred native delivery after a copy checkpoint is not a later user edit', async ({ page }) => {
  await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const before = (await stored(page))[0]; if (!before) throw new Error('No paused native draft');
  const shape = Object.values(before.value.document.snapshot.store).find((record) => record.typeName === 'shape');
  if (shape?.typeName !== 'shape') throw new Error('No native shape');
  const pending: { route: Route; response: APIResponse }[] = [];
  await page.route(`**/api/boards/${board.id}/copy`, async (route) => { pending.push({ route, response: await route.fetch() }); });
  const button = page.getByRole('button', { name: 'Save as copy', exact: true });
  await button.scrollIntoViewIfNeeded();
  const bounds = await button.boundingBox(); if (!bounds) throw new Error('No visible copy button');
  expect(await page.locator('.tl-container').evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const client = await page.context().newCDPSession(page);
  try {
    // Browser scheduling control, not an app/SDK hook: real trusted key/pointer
    // input reaches copy before the deferred store frame, without focus repair.
    await client.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    const x = bounds.x + bounds.width / 2; const y = bounds.y + bounds.height / 2;
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await expect.poll(() => pending.length).toBe(1);
    const checkpoint = (await stored(page))[0]; if (!checkpoint) throw new Error('No checkpoint draft');
    expect(Object.values(checkpoint.value.document.snapshot.store).find((record) => record.id === shape.id)).toMatchObject({ x: shape.x + 1, y: shape.y });
    const frames = page.evaluate(() => {
      const { promise, resolve } = Promise.withResolvers<void>();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return promise;
    });
    await client.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 100 });
    await frames;
    expect((await stored(page))[0]?.value.document).toEqual(checkpoint.value.document);
    const flight = pending.shift(); if (!flight) throw new Error('No actual copy response');
    const copy = validateBoard(await flight.response.json());
    expect(copy.document).toEqual(checkpoint.value.document); expect(copy.incoming).toEqual(checkpoint.value.incoming);
    await flight.route.fulfill({ response: flight.response });
    await client.send('Emulation.setVirtualTimePolicy', { policy: 'advance' });
    await expect(page).toHaveURL(new RegExp(`/boards/${copy.id}$`));
    await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
    expect(await stored(page)).toEqual([]);
    expect(await read(page, board.id)).toEqual(board);
    expect((await read(page, copy.id)).document).toEqual(checkpoint.value.document);
  } finally {
    await client.send('Emulation.setVirtualTimePolicy', { policy: 'advance' });
    await client.detach();
  }
});

for (const paused of ['failed', 'conflict']) {
  test(`real quota failure publishes recoverability loss while ${paused} saves stay paused`, async ({ page }, testInfo) => {
    await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
    if (paused === 'conflict') {
      expect((await page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: board.revision, document: board.document, incoming: board.incoming } })).status()).toBe(200);
    }
    let writes = 0;
    await page.route(`**/api/boards/${board.id}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      writes += 1;
      if (paused === 'failed') await route.abort('connectionfailed');
      else await route.continue();
    });
    await draw(page);
    await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', paused === 'failed' ? 'unsaved' : 'conflict');
    const warning = page.getByRole('alert').filter({ hasText: 'Browser recovery storage is unavailable' });
    await expect(warning).toHaveCount(0);
    if (paused === 'failed') await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
    const older = (await stored(page))[0]; if (!older) throw new Error('No older recoverable pair');
    const original = await read(page, board.id);
    const quota = await page.evaluate(() => {
      let index = 0; let filled = 0; const errors: string[] = [];
      for (let size = 1024 * 1024; size >= 1; size = Math.floor(size / 2)) {
        const value = 'q'.repeat(size);
        for (;;) {
          try { localStorage.setItem(`ticket11-quota:${index}`, value); filled += size; index += 1; }
          catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
            errors.push(error.name); break;
          }
        }
      }
      return { filled, errors };
    });
    expect(quota.filled).toBeGreaterThan(1024 * 1024);
    expect(quota.errors.every((name) => name === 'QuotaExceededError')).toBe(true);
    await draw(page, 150);
    await expect(page.locator('.tl-shape')).toHaveCount(2);
    await expect(warning).toBeVisible();
    expect(await stored(page)).toEqual([older]);
    expect(await read(page, board.id)).toEqual(original);
    // Negative assertion across two native-save debounce windows: warning
    // publication must not replay the paused write.
    await page.waitForTimeout(650);
    expect(writes).toBe(1);
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('ticket11-quota:')) localStorage.removeItem(key); });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.screenshot({ path: testInfo.outputPath(`quota-${paused}-${theme}-desktop.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quota-${paused}-dark-320-enlarged.png`), fullPage: true });
    if (paused === 'failed') {
      await page.unroute(`**/api/boards/${board.id}`);
      await page.getByRole('button', { name: 'Retry save' }).click();
      await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
      expect(Object.values((await read(page, board.id)).document.snapshot.store).filter((record) => record.typeName === 'shape')).toHaveLength(2);
    } else {
      await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
      await expect(page).not.toHaveURL(new RegExp(`${board.id}$`));
      const copyId = page.url().split('/').pop(); if (!copyId) throw new Error('No recovered copy ID');
      expect(Object.values((await read(page, copyId)).document.snapshot.store).filter((record) => record.typeName === 'shape')).toHaveLength(2);
      expect(await read(page, board.id)).toEqual(original);
    }
    expect(await stored(page)).toEqual([]);
  });
}

test('an Incoming-only operation commits even when the native document is unchanged', async ({ page }) => {
  await signIn(page); const board = await seedMixed(page, await create(page)); await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
  await page.getByRole('button', { name: 'Remove source', exact: true }).click();
  await expect.poll(async () => (await read(page, board.id)).revision).toBe(board.revision + 1);
  const saved = await read(page, board.id);
  expect(saved.document).toEqual(board.document);
  expect(saved.incoming).toEqual({ ...board.incoming, sources: [] });
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
});

test('provider read authorization loss does not block application-session native saves or private conflict copies', async ({ page }) => {
  await signIn(page); const board = await seedMixed(page, await create(page));
  await controlProvider(page.request, { revoke: true });
  await page.goto(`/boards/${board.id}`);
  const session = await currentSession(page.request);
  expect(session.status === 'signed-in' && session.authorization).toBe('reauthorize');
  await draw(page);
  await expect.poll(async () => (await read(page, board.id)).revision).toBe(board.revision + 1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await read(page, board.id);
  expect((await page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: saved.revision, document: saved.document, incoming: saved.incoming } })).status()).toBe(200);
  const winner = await read(page, board.id);
  await draw(page, 150);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'conflict');
  const draft = (await stored(page))[0]; if (!draft) throw new Error('No provider-blocked local draft');
  expect(JSON.stringify(draft.value)).not.toContain('Long complete title');
  await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`${board.id}$`));
  const copyId = page.url().split('/').pop(); if (!copyId) throw new Error('No private copy');
  const copy = await read(page, copyId);
  expect(copy.document).toEqual(draft.value.document); expect(copy.incoming).toEqual(draft.value.incoming);
  expect(await read(page, board.id)).toEqual(winner);
  const after = await currentSession(page.request);
  expect(after.status === 'signed-in' && after.authorization).toBe('reauthorize');
});
