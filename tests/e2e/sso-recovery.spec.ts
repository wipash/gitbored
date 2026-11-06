import { expect, test, type Locator, type Page } from '@playwright/test';
import { createEmptyBoardDocument, validateBoard } from '../../src/shared/boards.js';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, openSettings, selectTheme, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function seed(page: Page, cards = 2) {
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  const headers = { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
  const items = [];
  for (const number of [1, 5].slice(0, cards)) {
    const response = await page.request.post('/api/sources/resolve', { headers, data: { url: `https://github.com/alice/project/issues/${number}` } });
    expect(response.ok()).toBe(true);
    items.push(readSourceItem(await response.json()));
  }
  const created = await page.request.post('/api/boards', { headers, data: { title: 'SSO recovery keeps my work' } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  const document = createEmptyBoardDocument();
  const base = { typeName: 'shape', parentId: 'page:page', rotation: 0, opacity: 1, isLocked: false, meta: {} };
  const shapes = [
    ...items.map((item, index) => ({ ...base, id: `shape:sso-card-${index}`, type: 'item-card', index: `a${index + 1}`, x: 100 + index * 370, y: 100,
      props: { version: 1, color: 'black', referenceId: item.reference.id, kind: item.reference.kind, w: 320, h: 240 } })),
    { ...base, id: 'shape:editable-note', type: 'text', index: 'a3', x: 500, y: 500,
      props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 300, autoSize: true, scale: 1,
        richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep editing while SSO is blocked' }] }] } } },
  ];
  const saved = await page.request.put(`/api/boards/${board.id}`, { headers, data: { expectedRevision: board.revision, incoming: board.incoming,
    document: { ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, ...Object.fromEntries(shapes.map((shape) => [shape.id, shape])) } } } } });
  expect(saved.ok()).toBe(true);
  return { board, headers, items };
}

async function notePosition(page: Page, boardId: string) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  const response = await page.request.get(`/api/boards/${boardId}`, { headers: { 'X-CSRF-Token': session.csrfToken } });
  expect(response.ok()).toBe(true);
  const note = Object.values(validateBoard(await response.json()).document.snapshot.store).find((record) => record.id === 'shape:editable-note');
  if (note?.typeName !== 'shape') throw new Error('Missing saved native note');
  return { x: note.x, y: note.y };
}

async function expectHitTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  expect(await control.evaluate((element) => {
    return [...element.getClientRects()].some((rect) => {
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && (hit === element || element.contains(hit));
    });
  })).toBe(true);
}

test('one SSO notice preserves editing across same-account reauthorization in another tab', async ({ page }, testInfo) => {
  const { board, headers, items } = await seed(page);
  await controlProvider(page.request, { sourceSsoRequired: true });
  for (const item of items) {
    const denial = await page.request.get(`/api/references/${item.reference.id}?refresh=1`, { headers });
    expect(denial.status()).toBe(403);
    expect(await denial.json()).toMatchObject({ error: 'sso_required', ssoOrganization: 'alice' });
  }
  await page.goto(`/boards/${board.id}`);
  const notice = page.getByRole('complementary', { name: 'GitHub SSO recovery' });
  await expect(notice).toHaveCount(1);
  await expect(page.locator('.workspace-card').filter({ hasText: 'SSO required. Reconnect your organisation.' })).toHaveCount(2);
  await expect(notice.locator('details')).not.toHaveAttribute('open');
  const editor = await page.locator('.tl-container').elementHandle();
  if (!editor) throw new Error('Missing native editor');
  let documentNavigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) documentNavigations++; });

  await page.locator('[data-shape-id="shape:editable-note"]').click();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => notePosition(page, board.id)).toEqual({ x: 501, y: 500 });
  await page.keyboard.press('Control+z');
  await expect.poll(() => notePosition(page, board.id)).toEqual({ x: 500, y: 500 });
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => notePosition(page, board.id)).toEqual({ x: 500, y: 501 });
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');

  await notice.locator('summary').click();
  await page.screenshot({ path: testInfo.outputPath('sso-expanded-desktop.png') });
  const organization = notice.getByRole('link', { name: 'Sign in to alice SSO' });
  await expect(organization).toHaveAttribute('href', 'https://github.com/orgs/alice/sso');
  await expect(organization).toHaveAttribute('target', '_blank');
  await expect(organization).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(notice.getByRole('link', { name: 'GitHub application settings' })).toHaveAttribute('href', 'https://github.com/settings/applications');
  await expect(notice.getByRole('link', { name: 'reauthorize GitBored' })).toHaveAttribute('href', '/api/auth/github');
  await notice.locator('summary').click();

  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await expectHitTarget(notice.locator('summary'));
    await page.screenshot({ path: testInfo.outputPath(`sso-collapsed-${theme}-320-200.png`) });
    await notice.locator('summary').click();
    await page.screenshot({ path: testInfo.outputPath(`sso-expanded-top-${theme}-320-200.png`) });
    await expectHitTarget(organization);
    await expectHitTarget(notice.getByRole('button', { name: 'Check access' }));
    await page.screenshot({ path: testInfo.outputPath(`sso-expanded-${theme}-320-200.png`) });
    await notice.locator('summary').click();
  }
  await notice.locator('summary').click();
  await controlProvider(page.request, { sourceSsoRequired: false });
  const newTab = page.waitForEvent('popup');
  await notice.getByRole('link', { name: 'reauthorize GitBored' }).click();
  const authorization = await newTab;
  await authorization.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await expect(authorization.locator('.desktop-app')).toBeVisible();
  await page.bringToFront();
  // Headless tab activation does not consistently emit window focus; use the documented recovery action.
  await notice.getByRole('button', { name: 'Check access' }).click();
  await expect(notice).toHaveCount(0);
  await authorization.close();
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:sso-card-${index}"]`)).toContainText(item.metadata.title);
  expect(await editor.evaluate((element) => element.isConnected)).toBe(true);
  expect(documentNavigations).toBe(0);
  expect(await notePosition(page, board.id)).toEqual({ x: 500, y: 501 });
});

test('repository catalogue SSO recovery reloads its results in place', async ({ page }) => {
  const { board } = await seed(page, 0);
  await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: '/user/installations/9007199254740993/repositories' });
  await page.goto(`/boards/${board.id}`);
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  const notice = page.getByRole('complementary', { name: 'GitHub SSO recovery' });
  await expect(notice).toHaveCount(1);
  await expect(page.locator('.repository-connector')).toContainText('GitHub SSO is required.');
  const editor = await page.locator('.tl-container').elementHandle();
  if (!editor) throw new Error('Missing native editor');
  await notice.locator('summary').click();
  await controlProvider(page.request, { sourceSsoRequired: false });
  await notice.getByRole('button', { name: 'Check access' }).click();
  await expect(page.locator('.repository-results').getByRole('button', { name: /alice\/project/ })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(await editor.evaluate((element) => element.isConnected)).toBe(true);
  await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: '/repos/alice/project' });
  await page.getByRole('searchbox', { name: 'Search repositories' }).fill('alice/project');
  await expect(notice).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search repositories' }).fill('');
  await expect(notice).toHaveCount(0);
});

test('project-context-only SSO recovers and ordinary access denial remains unavailable', async ({ page }) => {
  const { board, headers, items } = await seed(page, 1);
  const item = items[0];
  if (!item) throw new Error('Missing seeded issue');
  await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: '/graphql' });
  await page.goto(`/boards/${board.id}`);
  const card = page.locator('[data-shape-id="shape:sso-card-0"]');
  await expect(card).toContainText(item.metadata.title);
  const notice = page.getByRole('complementary', { name: 'GitHub SSO recovery' });
  await expect(notice).toHaveCount(1);
  await notice.locator('summary').click();
  await expect(notice.getByRole('link', { name: 'Sign in to alice SSO' })).toBeVisible();
  await controlProvider(page.request, { sourceSsoRequired: false });
  await notice.getByRole('button', { name: 'Check access' }).click();
  await expect(notice).toHaveCount(0);
  await openSettings(page);
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Delivery' });
  await expect(page.getByLabel('Project', { exact: true }).locator('option:checked')).toHaveText('Delivery');
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await controlProvider(page.request, { sourceDenied: true });
  expect((await page.request.get(`/api/references/${item.reference.id}?refresh=1`, { headers })).status()).toBe(403);
  await page.reload();
  await expect(card).toContainText('Unavailable');
  await expect(notice).toHaveCount(0);
});


test('a direct repository SSO denial redacts matching cards while native edits still save', async ({ page }) => {
  const { board, items } = await seed(page);
  await page.goto(`/boards/${board.id}`);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:sso-card-${index}"]`)).toContainText(item.metadata.title);
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await expect(page.locator('.repository-results').getByRole('button', { name: /alice\/project/ })).toBeVisible();
  await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: '/repos/alice/project' });
  await page.getByRole('searchbox', { name: 'Search repositories' }).fill('alice/project');
  const notice = page.getByRole('complementary', { name: 'GitHub SSO recovery' });
  await expect(notice).toHaveCount(1);
  await expect(page.locator('.workspace-card').filter({ hasText: 'SSO required. Reconnect your organisation.' })).toHaveCount(2);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:sso-card-${index}"]`)).not.toContainText(item.metadata.title);
  expect((await currentSession(page.request)).status).toBe('signed-in');
  await page.getByRole('button', { name: 'Close repositories', exact: true }).click();
  await page.locator('[data-shape-id="shape:editable-note"]').click();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => notePosition(page, board.id)).toEqual({ x: 501, y: 500 });
  await notice.locator('summary').click();
  await controlProvider(page.request, { sourceSsoRequired: false });
  await notice.getByRole('button', { name: 'Check access' }).click();
  await expect(notice).toHaveCount(0);
  for (const [index, item] of items.entries()) await expect(page.locator(`[data-shape-id="shape:sso-card-${index}"]`)).toContainText(item.metadata.title);
});

test('removing the last SSO-blocked card removes its obsolete recovery notice', async ({ page }) => {
  const { board, headers, items } = await seed(page, 1);
  const item = items[0];
  if (!item) throw new Error('Missing seeded issue');
  await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: '/repos/alice/project/issues/1' });
  expect((await page.request.get(`/api/references/${item.reference.id}?refresh=1`, { headers })).status()).toBe(403);
  await page.goto(`/boards/${board.id}`);
  const notice = page.getByRole('complementary', { name: 'GitHub SSO recovery' });
  await expect(notice).toHaveCount(1);
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.workspace-card')).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
});
