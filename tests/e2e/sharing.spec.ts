import { expect, test, type Page } from '@playwright/test';
import { T } from '@tldraw/validate';
import { createUserId, InstancePresenceRecordType, PageRecordType } from '@tldraw/tlschema';
import { createEmptyBoardDocument, validateBoard, type Board } from '../../src/shared/boards.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readSharedBoard, readSharingSettings } from '../../src/shared/sharing.js';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, restartApplication, selectTheme, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated account');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function create(page: Page, title: string) {
  const response = await page.request.post('/api/boards', { headers: await headers(page), data: { title } });
  expect(response.status()).toBe(201);
  return validateBoard(await response.json());
}
async function settings(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}/sharing`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return readSharingSettings(await response.json());
}
async function share(page: Page, id: string, mode: 'private' | 'link' | 'people', logins: string[] = []) {
  const before = await settings(page, id);
  const response = await page.request.put(`/api/boards/${id}/sharing`, {
    headers: await headers(page), data: { mode, logins, expectedVersion: before.version },
  });
  expect(response.status()).toBe(200);
  return readSharingSettings(await response.json());
}
function sharedEndpoint(path: string) { return `/api/shared/${path.slice('/share/'.length)}`; }
async function shared(page: Page, path: string) {
  const response = await page.request.get(sharedEndpoint(path), { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return readSharedBoard(await response.json());
}
async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}
async function save(page: Page, board: Board, document: Board['document'], incoming = board.incoming) {
  return page.request.put(`/api/boards/${board.id}`, { headers: await headers(page),
    data: { expectedRevision: board.revision, document, incoming } });
}
function note(text: string) {
  const document = createEmptyBoardDocument();
  const shape = { id: 'shape:shared-note', typeName: 'shape', type: 'text', parentId: 'page:page', index: 'a1',
    x: 120, y: 140, rotation: 0, opacity: 1, isLocked: false, meta: {},
    props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 320, autoSize: true, scale: 1,
      richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } } };
  return validateNativeDocument({ ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, [shape.id]: shape } } });
}

test('a board has one stable link and sharing grants read access without owner operations', async ({ page, browser }) => {
  await signIn(page);
  const board = await create(page, 'Read only permission boundary');
  const initialResponse = await page.request.get(`/api/boards/${board.id}/sharing`, { headers: await headers(page) });
  expect(initialResponse.status()).toBe(200);
  const initial = readSharingSettings(await initialResponse.json());
  expect(initial.mode).toBe('private');
  expect(initial.path).toMatch(/^\/share\/[A-Za-z0-9_-]{43}$/);
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage();
    const endpoint = `/api/shared/${initial.path.slice('/share/'.length)}`;
    expect((await bob.request.get(endpoint)).status()).toBe(401);
    await signIn(bob, 'Bob');
    const bobHeaders = await headers(bob);
    expect((await bob.request.get(endpoint, { headers: bobHeaders })).status()).toBe(404);
    const published = await page.request.put(`/api/boards/${board.id}/sharing`, {
      headers: await headers(page), data: { mode: 'link', logins: [], expectedVersion: initial.version },
    });
    expect(published.status()).toBe(200);
    const settings = readSharingSettings(await published.json());
    expect(settings.path).toBe(initial.path);
    expect((await bob.request.get(endpoint, { headers: bobHeaders })).status()).toBe(200);
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      const response = await bob.request.fetch(`/api/boards/${board.id}`, { method, headers: bobHeaders,
        ...(method === 'PUT' ? { data: { expectedRevision: 0, document: board.document, incoming: board.incoming } }
          : method === 'PATCH' ? { data: { title: 'Not permitted' } } : {}) });
      expect(response.status()).toBe(404);
    }
    expect((await bob.request.put(`/api/boards/${board.id}/sharing`, {
      headers: bobHeaders, data: { mode: 'link', logins: [], expectedVersion: settings.version },
    })).status()).toBe(404);
    expect((await bob.request.post(`/api/boards/${board.id}/copy`, {
      headers: bobHeaders, data: { title: 'Not permitted', document: board.document, incoming: board.incoming },
    })).status()).toBe(404);
  } finally { await other.close(); }
});

test('specific people use registered identities and stale sharing changes cannot restore removed access', async ({ page, browser }) => {
  await signIn(page);
  const board = await create(page, 'Named viewers');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob');
    const named = await share(page, board.id, 'people', ['BoB']);
    expect(named.people).toEqual([expect.objectContaining({ login: 'bob' })]);
    const bobSession = await currentSession(bob.request);
    if (bobSession.status !== 'signed-in') throw new Error('Expected Bob');
    expect(named.people[0]?.id).toBe(bobSession.user.id);
    expect((await bob.request.get(sharedEndpoint(named.path), { headers: await headers(bob) })).status()).toBe(200);
    const revoked = await share(page, board.id, 'people', []);
    expect(revoked.path).toBe(named.path);
    expect((await bob.request.get(sharedEndpoint(named.path), { headers: await headers(bob) })).status()).toBe(404);
    expect((await page.request.put(`/api/boards/${board.id}/sharing`, { headers: await headers(page),
      data: { mode: 'link', logins: [], expectedVersion: named.version } })).status()).toBe(409);
    expect((await settings(page, board.id)).mode).toBe('people');
    expect((await page.request.put(`/api/boards/${board.id}/sharing`, { headers: await headers(page),
      data: { mode: 'people', logins: ['does-not-have-an-app-account'], expectedVersion: revoked.version } })).status()).toBe(400);
    expect((await settings(page, board.id)).people).toEqual([]);
    expect((await page.request.put(`/api/boards/${board.id}/sharing`, { headers: { Origin: applicationOrigin },
      data: { mode: 'link', logins: [], expectedVersion: revoked.version } })).status()).toBe(403);
  } finally { await other.close(); }
});

test('a signed-out shared link returns to its board after GitHub sign-in', async ({ page, browser }) => {
  await signIn(page);
  const board = await create(page, 'Invitation return destination');
  const published = await share(page, board.id, 'link');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage();
    const html = await bob.goto(published.path);
    expect(html?.headers()['referrer-policy']).toBe('no-referrer');
    await bob.getByRole('link', { name: 'Sign in with GitHub', exact: true }).click();
    await bob.getByRole('link', { name: 'Authorize Bob', exact: true }).click();
    await expect(bob).toHaveURL(`${applicationOrigin}${published.path}`);
    await expect(bob.getByRole('heading', { name: board.title, exact: true })).toBeVisible();
    await expect(bob.locator('.tl-container')).toBeVisible();
    await expect(bob.getByText('Read only', { exact: true })).toBeVisible();
    await expect(bob.getByRole('button', { name: /^Incoming/ })).toHaveCount(0);
  } finally { await other.close(); }
});

test('published issue details include placed cards only and survive owner cache eviction and restart', async ({ page, browser }) => {
  await signIn(page);
  const items = [];
  for (const number of [1, 5]) {
    const response = await page.request.post('/api/sources/resolve', { headers: await headers(page),
      data: { url: `https://github.com/alice/project/issues/${number}` } });
    expect(response.status()).toBe(200);
    const item = readSourceItem(await response.json()); items.push(item);
    expect((await page.request.get(`/api/references/${item.reference.id}/context`, { headers: await headers(page) })).status()).toBe(200);
  }
  const placed = items[0]; const queued = items[1];
  if (!placed || !queued) throw new Error('Expected two source fixtures');
  const board = await create(page, 'Published private issue details');
  const document = createEmptyBoardDocument();
  const card = { id: 'shape:shared-card', typeName: 'shape', type: 'item-card', parentId: 'page:page', index: 'a1',
    x: 120, y: 140, rotation: 0, opacity: 1, isLocked: false, meta: {},
    props: { version: 1, color: 'black', referenceId: placed.reference.id, kind: placed.reference.kind, w: 320, h: 300 } };
  const incoming = { ...board.incoming, queue: [{ referenceId: queued.reference.id, kind: queued.reference.kind }], seen: items.map((item) => item.reference.id) };
  expect((await save(page, board, validateNativeDocument({ ...document, snapshot: { ...document.snapshot,
    store: { ...document.snapshot.store, [card.id]: card } } }), incoming)).status()).toBe(200);
  const published = await share(page, board.id, 'link');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob');
    const snapshot = await shared(bob, published.path);
    expect(snapshot.metadata.items.map(({ item }) => item.reference.id)).toEqual([placed.reference.id]);
    expect(snapshot.metadata.items[0]?.item.metadata).toMatchObject({ title: placed.metadata.title,
      body: placed.metadata.body, labels: placed.metadata.labels, assignees: placed.metadata.assignees });
    expect(snapshot.metadata.items[0]?.context?.projects).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Delivery' })]));
    expect((await bob.request.get(`/api/references/${placed.reference.id}`, { headers: await headers(bob) })).status()).toBe(404);
    await bob.goto(published.path);
    await expect(bob.locator('[data-shape-id="shape:shared-card"]')).toContainText(placed.metadata.title);
    await bob.locator('[data-shape-id="shape:shared-card"]').getByRole('button', { name: 'Card details' }).click();
    await expect(bob.getByRole('region', { name: 'Card details' })).toContainText('cached_body');
    // A provider refresh publishes metadata even though the canvas revision is unchanged.
    await controlProvider(page.request, { sourceCardLayout: true });
    expect((await page.request.get(`/api/references/${placed.reference.id}?refresh=1`, { headers: await headers(page) })).status()).toBe(200);
    await expect(bob.getByRole('region', { name: 'Card details' }).locator('dd').filter({ hasText: 'bug' })).toBeVisible();
    const refreshed = await shared(bob, published.path);
    expect(refreshed.revision).toBe(snapshot.revision);
    expect(refreshed.publicationVersion).toBeGreaterThan(snapshot.publicationVersion);
    // The provider reset clears the ordinary cache through the controlled test harness.
    await controlProvider(page.request, { reset: true, sourceDenied: true });
    await restartApplication(page.request, 'original');
    expect((await shared(bob, published.path)).metadata).toEqual(refreshed.metadata);
    const providerReads: string[] = [];
    bob.on('request', (request) => { const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/references/') || pathname.startsWith('/api/sources/')) providerReads.push(pathname); });
    await bob.goto(published.path);
    await expect(bob.locator('[data-shape-id="shape:shared-card"]')).toContainText(placed.metadata.title);
    await bob.locator('[data-shape-id="shape:shared-card"]').getByRole('button', { name: 'Card details' }).click();
    await expect(bob.getByRole('region', { name: 'Card details' })).toContainText('cached_body');
    expect(providerReads).toEqual([]);
    const current = await read(page, board.id);
    expect((await save(page, current, createEmptyBoardDocument())).status()).toBe(200);
    expect((await shared(bob, published.path)).metadata.items).toEqual([]);
    await expect(bob.locator('[data-shape-id="shape:shared-card"]')).toHaveCount(0);
  } finally { await other.close(); }
});

test('live viewers receive saved changes without remounting and cannot edit before access is revoked', async ({ page, browser }, testInfo) => {
  await signIn(page);
  const board = await create(page, 'Live saved board');
  expect((await save(page, board, note('First saved note'))).status()).toBe(200);
  const published = await share(page, board.id, 'link');
  const other = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 1000 } });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob'); await bob.goto(published.path);
    await expect(bob.locator('[data-shape-id="shape:shared-note"]')).toContainText('First saved note');
    const editor = await bob.locator('.tl-container').elementHandle();
    if (!editor) throw new Error('Missing viewer editor');
    const current = await read(page, board.id);
    expect((await save(page, current, note('New saved note'))).status()).toBe(200);
    await expect(bob.locator('[data-shape-id="shape:shared-note"]')).toContainText('New saved note');
    expect(await editor.evaluate((element) => element.isConnected)).toBe(true);
    expect((await save(page, current, note('Stale overwrite'))).status()).toBe(409);
    await expect(bob.locator('[data-shape-id="shape:shared-note"]')).not.toContainText('Stale overwrite');
    const before = await shared(bob, published.path);
    const shape = bob.locator('[data-shape-id="shape:shared-note"]');
    await shape.click(); await bob.keyboard.press('Delete');
    await bob.keyboard.press('ArrowRight'); await bob.keyboard.press('Control+z');
    await expect(shape).toContainText('New saved note');
    expect((await shared(bob, published.path)).document).toEqual(before.document);
    await expect(bob.getByRole('button', { name: /^Rectangle/ })).toHaveCount(0);
    await expect(bob.getByRole('button', { name: /^Draw/ })).toHaveCount(0);
    await bob.screenshot({ path: testInfo.outputPath('shared-live-view.png'), fullPage: true });
    await bob.setViewportSize({ width: 320, height: 900 });
    await bob.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await bob.screenshot({ path: testInfo.outputPath('shared-narrow-enlarged.png'), fullPage: true });
    await share(page, board.id, 'private');
    await expect(bob.locator('.tl-container')).toHaveCount(0);
    await expect(bob.locator('body')).not.toContainText('New saved note');
    expect((await bob.request.get(sharedEndpoint(published.path), { headers: await headers(bob) })).status()).toBe(404);
  } finally { await other.close(); }
});

test('viewer sockets discard document writes, reject chunked presence, and deny ticket replay', async ({ page, browser }) => {
  await signIn(page);
  const board = await create(page, 'Socket read permission');
  expect((await save(page, board, note('Only the owner may change this'))).status()).toBe(200);
  const published = await share(page, board.id, 'link');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob');
    const endpoint = sharedEndpoint(published.path);
    const before = await shared(bob, published.path);
    const presence = InstancePresenceRecordType.create({ id: InstancePresenceRecordType.createId('untrusted'), userId: createUserId('untrusted'),
      userName: 'Untrusted viewer cursor', currentPageId: PageRecordType.createId('page'), cursor: { x: 10, y: 10, type: 'default', rotation: 0 } });
    const attempts = [
      { chunked: false, payload: JSON.stringify({ type: 'push', clientClock: 1, diff: { 'shape:shared-note': ['remove'] } }) },
      { chunked: true, payload: JSON.stringify({ type: 'push', clientClock: 1, presence: ['put', presence] }) },
    ];
    for (const attempt of attempts) {
      const ticketResponse = await bob.request.post(`${endpoint}/ticket`, { headers: await headers(bob) });
      expect(ticketResponse.status()).toBe(200);
      const { ticket } = T.object({ ticket: T.string }).validate(await ticketResponse.json());
      const url = `${applicationOrigin.replace(/^http/, 'ws')}${endpoint}/connect?ticket=${encodeURIComponent(ticket)}`;
      const result: unknown = await bob.evaluate(({ url, schema, protocolVersion, attempt }) => new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const deadline = setTimeout(() => { socket.close(); reject(new Error('No read-only rejection received')); }, 5000);
      let readonly = false;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'connect', connectRequestId: 'test-readonly', lastServerClock: -1, schema, protocolVersion }));
      socket.onerror = () => { clearTimeout(deadline); reject(new Error('Socket connection failed')); };
      socket.onclose = (event) => { clearTimeout(deadline); resolve({ readonly, code: event.code, reason: event.reason }); };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') return;
        const message: unknown = JSON.parse(event.data);
        function inspect(value: unknown): void {
          if (typeof value !== 'object' || value === null || !('type' in value)) return;
          if (value.type === 'connect') {
            readonly = 'isReadonly' in value && value.isReadonly === true;
            const payload = attempt.payload;
            if (attempt.chunked) {
              const middle = Math.floor(payload.length / 2);
              socket.send(`1_${payload.slice(0, middle)}`); socket.send(`0_${payload.slice(middle)}`);
            } else socket.send(payload);
          } else if (value.type === 'data' && 'data' in value && Array.isArray(value.data)) {
            for (const entry of value.data) inspect(entry);
          } else if (value.type === 'push_result') {
            clearTimeout(deadline); socket.close(); resolve({ readonly, action: 'action' in value ? value.action : null });
          }
        }
        inspect(message);
      };
    // The pinned tldraw 5.6 protocol uses version 8. Exercise the public socket as
    // an untrusted client instead of relying on the editor's read-only controls.
      }), { url, schema: before.document.snapshot.schema, protocolVersion: 8, attempt });
      expect(result).toMatchObject(attempt.chunked ? { readonly: true, code: 4099 } : { readonly: true, action: 'discard' });
      expect((await shared(bob, published.path)).document).toEqual(before.document);
      const replay: unknown = await bob.evaluate((url) => new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const deadline = setTimeout(() => { socket.close(); reject(new Error('Reused ticket remained open')); }, 5000);
      socket.onclose = (event) => { clearTimeout(deadline); resolve({ code: event.code, reason: event.reason }); };
      }), url);
      expect(replay).toMatchObject({ code: 4099 });
    }
  } finally { await other.close(); }
});

test('paused live viewing resumes the latest saved board and reconnects after a server restart', async ({ page, browser }) => {
  await signIn(page);
  const board = await create(page, 'Pause and reconnect');
  expect((await save(page, board, note('Before pausing'))).status()).toBe(200);
  const published = await share(page, board.id, 'link');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob'); await bob.goto(published.path);
    const shape = bob.locator('[data-shape-id="shape:shared-note"]');
    await expect(shape).toContainText('Before pausing');
    await bob.getByRole('button', { name: 'Pause live updates', exact: true }).click();
    expect((await save(page, await read(page, board.id), note('While paused'))).status()).toBe(200);
    expect((await shared(bob, published.path)).document).toEqual(note('While paused'));
    await expect(shape).toContainText('Before pausing');
    await bob.getByRole('button', { name: 'Resume live updates', exact: true }).click();
    await expect(shape).toContainText('While paused');
    await restartApplication(page.request, 'original');
    await expect(bob.getByText('Live saved changes', { exact: true })).toBeVisible();
    expect((await save(page, await read(page, board.id), note('After restarting'))).status()).toBe(200);
    await expect(shape).toContainText('After restarting');
    const bobHeaders = await headers(bob);
    expect((await bob.request.post('/api/auth/logout', { headers: bobHeaders })).status()).toBe(204);
    await expect(bob.locator('.tl-container')).toHaveCount(0);
    await expect(bob.locator('body')).not.toContainText('After restarting');
  } finally { await other.close(); }
});

test('owner sharing controls work by keyboard and remain reachable with enlarged narrow content', async ({ page, browser }, testInfo) => {
  await signIn(page);
  const board = await create(page, 'Share settings and responsive controls');
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await other.newPage(); await signIn(bob, 'Bob');
    await page.goto(`/boards/${board.id}`);
    const trigger = page.getByRole('button', { name: 'Share', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Share board' });
    await expect(panel.getByRole('button', { name: 'Close sharing' })).toBeFocused();
    await expect(panel).toContainText('including details from private repositories');
    await panel.getByLabel('Sharing access').selectOption('people');
    await panel.getByLabel('GitHub usernames').fill('bob');
    await panel.getByRole('button', { name: 'Save sharing', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('status')).toContainText('Sharing saved');
    const link = await panel.getByLabel('Share link', { exact: true }).inputValue();
    await bob.goto(link);
    await expect(bob.getByRole('heading', { name: board.title, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('sharing-light.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await selectTheme(page, 'dark');
    await trigger.click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const control of [panel.getByLabel('Sharing access'), panel.getByLabel('GitHub usernames'), panel.getByRole('button', { name: 'Save sharing', exact: true }), panel.getByLabel('Share link', { exact: true }), panel.getByRole('button', { name: 'Copy link', exact: true })]) {
      await control.scrollIntoViewIfNeeded();
      const bounds = await control.boundingBox();
      expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y >= 0 && bounds.y + bounds.height <= 900).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath('sharing-dark-narrow-enlarged.png'), fullPage: true });
    await panel.getByLabel('Sharing access').selectOption('private');
    await panel.getByRole('button', { name: 'Save sharing', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Sharing is off');
    expect(await panel.getByLabel('Share link', { exact: true }).inputValue()).toBe(link);
    await expect(bob.locator('.tl-container')).toHaveCount(0);
  } finally { await other.close(); }
});
