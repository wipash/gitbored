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
async function fillQuota(page: Page) {
  return page.evaluate(() => {
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
}
async function copyReceipts(page: Page) {
  const entries = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('gitbored:recovery-copy:1:')));
  return entries.map(([key, value]) => ({ key, value: T.object({ version: T.literal(1), copiedBoardId: T.string, copiedAt: T.number, pairDigest: T.string }).validate(JSON.parse(value)) }));
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
  const incoming: Board['incoming'] = { version: 1, sources: [{ repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, loadedPage: 1, nextPage: null, status: 'complete' }],
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
    await page.getByRole('button', { name: /^Add to board:/ }).click();
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
    await expect(reopened).toHaveTitle(`Recover local work · ${board.title} · GitBored`);
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
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Connected account' })).toBeVisible();
  await page.goto(`/boards/${board.id}`);
  await expect(page.getByRole('button', { name: 'Retry opening' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recover local work' })).toHaveCount(0);
  await expect(page.locator('.tl-container')).toHaveCount(0);
  expect(await stored(page)).toEqual([original]);
  await page.goto('/api/auth/github'); await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await page.goto('/account');
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

test('a real copy acknowledgement never consumes edits made while the private copy is in flight', async ({ page, context }, testInfo) => {
  await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
  let writes = 0;
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes += 1;
    await route.abort('connectionfailed');
  });
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const captured = (await stored(page))[0]; if (!captured) throw new Error('Missing captured copy pair');
  const held: { route: Route; response: APIResponse }[] = [];
  await page.route(`**/api/boards/${board.id}/copy`, async (route) => { held.push({ route, response: await route.fetch() }); });
  await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
  await expect.poll(() => held.length).toBe(1);
  await draw(page, 150);
  // Pointer-up completes native geometry synchronously, but recovery observes
  // the SDK's deferred store listener. Deliver it before freezing the exact pair.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); });
  }));
  expect(held).toHaveLength(1);
  await expect.poll(async () => Object.values((await stored(page))[0]?.value.document.snapshot.store ?? {}).filter((record) => record.typeName === 'shape').length).toBe(2);
  const latest = (await stored(page))[0]; if (!latest) throw new Error('Missing newer copy-time edits');
  const flight = held.shift(); if (!flight) throw new Error('Missing actual copy acknowledgement');
  await flight.route.fulfill({ response: flight.response });
  const link = page.getByRole('link', { name: 'Open saved copy (new tab)', exact: true });
  await expect(link).toBeVisible(); await expect(page).toHaveURL(new RegExp(`${board.id}$`));
  await expect(link).toHaveAttribute('target', '_blank');
  expect(await stored(page)).toEqual([latest]);
  expect(await read(page, board.id)).toEqual(board);
  const href = await link.getAttribute('href'); if (!href) throw new Error('No created copy destination');
  const copyPage = await context.newPage(); await copyPage.goto(href);
  const id = copyPage.url().split('/').pop(); if (!id) throw new Error('Missing copy ID');
  const copy = await read(copyPage, id);
  expect(copy.document).toEqual(captured.value.document); expect(copy.incoming).toEqual(captured.value.incoming);
  expect(writes).toBe(1);
  await page.unroute(`**/api/boards/${board.id}`);
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const saved = await read(page, board.id);
  expect(saved.document).toEqual(latest.value.document); expect(saved.incoming).toEqual(latest.value.incoming);
  expect(saved.revision).toBe(board.revision + 1);
  expect(await read(copyPage, id)).toEqual(copy);
  expect(await stored(page)).toEqual([]);
  await testInfo.attach('copy-in-flight-pairs.json', {
    contentType: 'application/json', body: JSON.stringify({ board, captured, latest, copy, saved }),
  });
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
    // Register the browser frame barrier on this same protocol session before
    // advancing virtual time; Playwright's async evaluate dispatch can otherwise
    // reach the renderer only after the finite frame budget has expired.
    const frames = await client.send('Runtime.evaluate', { expression: `(() => {
      const { promise, resolve } = Promise.withResolvers();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return promise;
    })()` });
    if (!frames.result.objectId) throw new Error('No native frame barrier');
    await client.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 100 });
    await client.send('Runtime.awaitPromise', { promiseObjectId: frames.result.objectId });
    await client.send('Runtime.releaseObject', { objectId: frames.result.objectId });
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
    if (!page.isClosed()) {
      await client.send('Emulation.setVirtualTimePolicy', { policy: 'advance' });
      await client.detach();
    }
  }
});

for (const paused of ['failed', 'conflict']) {
  test(`real quota failure publishes recoverability loss while ${paused} saves stay paused`, async ({ page }, testInfo) => {
    await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
    // Navigation does not await the asynchronous authorized board load. Mount
    // the base-revision editor before the competing writer advances authority.
    await expect(page.locator('.tl-container')).toBeVisible();
    let original = board;
    if (paused === 'conflict') {
      const response = await page.request.put(`/api/boards/${board.id}`, { headers: await headers(page), data: { expectedRevision: board.revision, document: board.document, incoming: board.incoming } });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ revision: board.revision + 1 });
      original = await read(page, board.id);
      expect(original.revision).toBe(board.revision + 1);
      expect(original.document).toEqual(board.document);
      expect(original.incoming).toEqual(board.incoming);
    }
    let writes = 0;
    const localRevisions: number[] = [];
    await page.route(`**/api/boards/${board.id}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      writes += 1;
      localRevisions.push(T.object({ expectedRevision: T.number, document: T.unknown, incoming: T.unknown }).validate(route.request().postDataJSON()).expectedRevision);
      if (paused === 'failed') await route.abort('connectionfailed');
      else await route.continue();
    });
    const rejected = paused === 'conflict' ? page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/boards/${board.id}`)) : null;
    await draw(page);
    if (rejected) expect((await rejected).status()).toBe(409);
    await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', paused === 'failed' ? 'unsaved' : 'conflict');
    const warning = page.getByRole('alert').filter({ hasText: 'Browser recovery storage is unavailable' });
    await expect(warning).toHaveCount(0);
    if (paused === 'failed') await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
    expect(localRevisions).toEqual([board.revision]);
    const older = (await stored(page))[0]; if (!older) throw new Error('No older recoverable pair');
    expect(await read(page, board.id)).toEqual(original);
    const quota = await fillQuota(page);
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
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.screenshot({ path: testInfo.outputPath(`quota-${paused}-${theme}-desktop.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quota-${paused}-dark-320-enlarged.png`), fullPage: true });
    await expect(warning).toBeVisible();
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('ticket11-quota:')) localStorage.removeItem(key); });
    await expect(warning).toBeVisible();
    if (paused === 'failed') {
      await page.unroute(`**/api/boards/${board.id}`);
      await page.getByRole('button', { name: 'Retry save' }).click();
      await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
      await expect(warning).toHaveCount(0);
      expect(Object.values((await read(page, board.id)).document.snapshot.store).filter((record) => record.typeName === 'shape')).toHaveLength(2);
    } else {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await draw(page, 280);
      await expect(warning).toHaveCount(0);
      expect(Object.values((await stored(page))[0]?.value.document.snapshot.store ?? {}).filter((record) => record.typeName === 'shape')).toHaveLength(3);
      await page.waitForTimeout(650);
      expect(writes).toBe(1);
      expect(await read(page, board.id)).toEqual(original);
      await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
      await expect(page).not.toHaveURL(new RegExp(`${board.id}$`));
      const copyId = page.url().split('/').pop(); if (!copyId) throw new Error('No recovered copy ID');
      expect(Object.values((await read(page, copyId)).document.snapshot.store).filter((record) => record.typeName === 'shape')).toHaveLength(3);
      expect(await read(page, board.id)).toEqual(original);
    }
    expect(await stored(page)).toEqual([]);
  });
}

test('an Incoming-only operation commits even when the native document is unchanged', async ({ page }) => {
  await signIn(page); const board = await seedMixed(page, await create(page)); await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
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

for (const surface of ['editor', 'recovery']) {
  test(`held Enter keeps ${surface} copy focus and starts only one request until the real abort`, async ({ page }) => {
    await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
    await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
    await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
    const draft = (await stored(page))[0]; if (!draft) throw new Error('Missing focus-test recovery');
    if (surface === 'recovery') {
      page.on('dialog', (dialog) => { void dialog.accept(); });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Recover local work' })).toBeFocused();
      await expect(page).toHaveTitle(`Recover local work · ${board.title} · GitBored`);
      await page.keyboard.press('Tab');
    } else {
      // Real pointer entry into the focusable status, followed by native Tab.
      // No test-side focus repair is used before or after the request.
      await page.locator('.board-save > p').click();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Retry save' })).toBeFocused();
      await page.keyboard.press('Tab');
    }
    const button = page.getByRole('button', { name: /^(Save as copy|Saving copy…)$/ });
    await expect(button).toBeFocused();
    const held: Route[] = [];
    await page.route(`**/api/boards/${board.id}/copy`, (route) => { held.push(route); });
    await page.keyboard.down('Enter');
    await expect.poll(() => held.length).toBe(1);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('aria-busy', 'true');
    for (let repeat = 0; repeat < 6; repeat += 1) await page.keyboard.down('Enter');
    expect(held).toHaveLength(1);
    await expect(button).toBeFocused();
    await page.keyboard.up('Enter');
    const firstRequest = held[0]; if (!firstRequest) throw new Error('No held copy request');
    await firstRequest.abort('connectionfailed');
    await expect(page.getByRole('alert').filter({ hasText: 'copy could not be saved' })).toBeVisible();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-disabled', 'false');
    expect(await stored(page)).toEqual([draft]);
    expect(await read(page, board.id)).toEqual(board);
    await page.keyboard.press('Enter');
    await expect.poll(() => held.length).toBe(2);
    const secondRequest = held[1]; if (!secondRequest) throw new Error('No fresh copy request');
    await secondRequest.abort('connectionfailed');
    await expect(button).toHaveAttribute('aria-disabled', 'false');
    await expect(button).toBeFocused();
  });
}

test('copied recovery receipts follow only the exact retained writer pair and live changes invalidate its badge', async ({ page, context }, testInfo) => {
  await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const first = (await stored(page))[0]; if (!first) throw new Error('No live source draft');
  const recovery = await context.newPage();
  try {
    await recovery.goto(`/boards/${board.id}`);
    await expect(recovery).toHaveTitle(`Recover local work · ${board.title} · GitBored`);
    await expect(recovery.getByRole('heading', { name: 'Recover local work' })).toBeFocused();
    await recovery.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(recovery).not.toHaveURL(new RegExp(`${board.id}$`));
    const firstId = new URL(recovery.url()).pathname.split('/').pop(); if (!firstId) throw new Error('No first receipt copy');
    const firstCopy = await read(recovery, firstId);
    expect(firstCopy.document).toEqual(first.value.document); expect(firstCopy.incoming).toEqual(first.value.incoming);
    expect(firstCopy.title).toMatch(/ \(copy \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\)$/);
    expect(firstCopy.title.length).toBeLessThanOrEqual(160);
    expect(await stored(recovery)).toEqual([first]);
    await recovery.goto(`/boards/${board.id}`);
    const savedLink = recovery.getByRole('link', { name: 'Open saved private copy', exact: true });
    await expect(savedLink).toHaveAttribute('href', `/boards/${firstId}`);
    await expect(recovery.getByText('This exact local draft was saved as a private copy on', { exact: false })).toBeVisible();
    const receipts = await copyReceipts(recovery);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.value).toMatchObject({ version: 1, copiedBoardId: firstId, copiedAt: firstCopy.createdAt, pairDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const receipt = receipts[0]; if (!receipt) throw new Error('No successful-copy receipt');
    expect(Object.keys(receipt.value).sort()).toEqual(['copiedAt', 'copiedBoardId', 'pairDigest', 'version']);
    expect(JSON.stringify(receipts)).not.toContain(board.title);
    const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('No receipt account');
    expect(JSON.stringify(receipts)).not.toContain(session.csrfToken);
    for (const theme of ['light', 'dark']) {
      await recovery.getByLabel('Theme', { exact: true }).selectOption(theme);
      await recovery.screenshot({ path: testInfo.outputPath(`receipt-${theme}-desktop.png`), fullPage: true });
    }
    await recovery.setViewportSize({ width: 320, height: 1000 });
    await recovery.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await recovery.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await recovery.screenshot({ path: testInfo.outputPath('receipt-dark-320-enlarged.png'), fullPage: true });
    // Only real native editing updates the live writer; the recovery page keeps
    // its captured draft and merely withdraws the obsolete receipt badge.
    await draw(page, 150);
    await expect.poll(async () => Object.values((await stored(page))[0]?.value.document.snapshot.store ?? {}).filter((record) => record.typeName === 'shape').length).toBe(2);
    const newer = (await stored(page))[0]; if (!newer) throw new Error('No changed live source');
    await expect(savedLink).toHaveCount(0);
    await expect(recovery.getByRole('heading', { name: 'Recover local work' })).toBeVisible();
    await expect(recovery.locator('.tl-container')).toHaveCount(0);
    expect(await read(page, board.id)).toEqual(board);
    await recovery.reload();
    await expect(recovery.getByRole('heading', { name: 'Recover local work' })).toBeFocused();
    await expect(savedLink).toHaveCount(0);
    await recovery.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(recovery).not.toHaveURL(new RegExp(`${board.id}$`));
    const secondId = new URL(recovery.url()).pathname.split('/').pop(); if (!secondId) throw new Error('No newer receipt copy');
    const secondCopy = await read(recovery, secondId);
    expect(secondCopy.document).toEqual(newer.value.document); expect(secondCopy.incoming).toEqual(newer.value.incoming);
    expect(secondCopy.title).not.toBe(firstCopy.title);
    expect((await read(page, firstId)).document).toEqual(first.value.document);
    expect(await read(page, board.id)).toEqual(board);
    expect(await stored(recovery)).toEqual([newer]);
    expect(await copyReceipts(recovery)).toHaveLength(2);
    await recovery.goto(`/boards/${board.id}`);
    await expect(savedLink).toHaveAttribute('href', `/boards/${secondId}`);
  } finally { await recovery.close(); }
});

for (const edited of [false, true]) {
  test(`reviewed recovery copy ${edited ? 'does not mark an edited successor as its predecessor' : 'remembers its unchanged predecessor without deleting it'}`, async ({ page }) => {
    await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
    await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
    await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
    const source = (await stored(page))[0]; if (!source) throw new Error('No reviewed predecessor');
    page.on('dialog', (dialog) => { void dialog.accept(); });
    await page.reload();
    await page.getByRole('button', { name: 'Review local draft', exact: true }).click();
    await expect(page.locator('.tl-container')).toBeVisible();
    await expect(page).toHaveTitle(`${board.title} · GitBored`);
    await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
    if (edited) {
      await draw(page, 150);
      // Sample the final real native gesture, not an intermediate deferred
      // pointer-move envelope that the copy checkpoint correctly supersedes.
      await expect.poll(async () => {
        const latest = (await stored(page)).find((entry) => entry.key !== source.key);
        return Object.values(latest?.value.document.snapshot.store ?? {}).find((record) => record.typeName === 'shape' && !(record.id in source.value.document.snapshot.store));
      }).toMatchObject({ type: 'geo', props: { w: 110, h: 85 } });
    }
    const own = (await stored(page)).find((entry) => entry.key !== source.key); if (!own) throw new Error('No reviewed writer');
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`${board.id}$`));
    const id = new URL(page.url()).pathname.split('/').pop(); if (!id) throw new Error('No reviewed private copy');
    const copy = await read(page, id);
    expect(copy.document).toEqual(own.value.document); expect(copy.incoming).toEqual(own.value.incoming);
    expect(await read(page, board.id)).toEqual(board);
    expect(await stored(page)).toEqual([source]);
    expect(await copyReceipts(page)).toHaveLength(edited ? 0 : 1);
    await page.goto(`/boards/${board.id}`);
    const link = page.getByRole('link', { name: 'Open saved private copy', exact: true });
    if (edited) await expect(link).toHaveCount(0);
    else await expect(link).toHaveAttribute('href', `/boards/${id}`);
  });
}

test('real quota loss after a successful recovery copy keeps current-pair navigation and truthful destination acknowledgement', async ({ page }) => {
  await signIn(page); const board = await create(page); await page.goto(`/boards/${board.id}`);
  await page.route(`**/api/boards/${board.id}`, async (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await draw(page); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  const source = (await stored(page))[0]; if (!source) throw new Error('No quota predecessor');
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recover local work' })).toBeVisible();
  const quota = await fillQuota(page);
  expect(quota.filled).toBeGreaterThan(1024 * 1024);
  expect(quota.errors.every((name) => name === 'QuotaExceededError')).toBe(true);
  const acknowledged: Board[] = [];
  await page.route(`**/api/boards/${board.id}/copy`, async (route) => {
    // Read the real server response before forwarding it; successful copy
    // navigation otherwise legitimately releases the page's response body.
    const response = await route.fetch(); expect(response.status()).toBe(201);
    acknowledged.push(validateBoard(await response.json()));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
  await expect.poll(() => acknowledged.length).toBe(1);
  const copy = acknowledged[0]; if (!copy) throw new Error('No real copy acknowledgement');
  await expect(page).toHaveURL(`${applicationOrigin}/boards/${copy.id}?copyReceipt=unavailable`);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByRole('status').filter({ hasText: 'Browser storage could not remember its link on the original recovery draft' })).toBeVisible();
  expect((await read(page, copy.id)).document).toEqual(source.value.document);
  expect((await read(page, copy.id)).incoming).toEqual(source.value.incoming);
  expect(await read(page, board.id)).toEqual(board);
  expect(await stored(page)).toEqual([source]);
  expect(await copyReceipts(page)).toEqual([]);
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('ticket11-quota:')) localStorage.removeItem(key); });
  await page.goto(`/boards/${board.id}`);
  await expect(page.getByRole('heading', { name: 'Recover local work' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open saved private copy', exact: true })).toHaveCount(0);
});
