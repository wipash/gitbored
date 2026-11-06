import { expect, test, type Locator, type Page } from '@playwright/test';
import { createEmptyBoardDocument, validateBoard } from '../../src/shared/boards.js';
import { readSourceItem, type SourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, openWorkspaceMenu, selectTheme, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');

async function seedCards(page: Page) {
  await controlProvider(page.request, { reset: true, sourceCardLayout: true });
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected owner');
  const headers = { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
  const items: SourceItem[] = [];
  for (const [kind, number] of [['issues', 1], ['issues', 5], ['pull', 2]] as const) {
    const response = await page.request.post('/api/sources/resolve', { headers, data: { url: `https://github.com/alice/project/${kind}/${number}` } });
    expect(response.ok()).toBe(true);
    const item = readSourceItem(await response.json());
    items.push(item);
    expect((await page.request.get(`/api/references/${item.reference.id}/context`, { headers })).ok()).toBe(true);
  }
  const created = await page.request.post('/api/boards', { headers, data: { title: 'Compact and expanded card titles' } });
  const board = validateBoard(await created.json());
  const document = createEmptyBoardDocument();
  const cards = ['compact', 'expanded'].flatMap((size, row) => items.map((item, column) => ({
    id: `shape:${size}-${column}`, typeName: 'shape', type: 'item-card', parentId: 'page:page', index: `a${row * 3 + column + 1}`,
    x: 30 + column * (size === 'compact' ? 310 : 460), y: size === 'compact' ? 150 : 400, rotation: 0, opacity: 1, isLocked: false, meta: {},
    props: { version: 1, color: 'black', referenceId: item.reference.id, kind: item.reference.kind, w: size === 'compact' ? 280 : 420, h: size === 'compact' ? 200 : 300 },
  })));
  const first = cards[0];
  if (!first) throw new Error('Missing compact fixture');
  cards.push({ ...first, id: 'shape:minimum', index: 'a7', x: 960, props: { ...first.props, w: 220, h: 180 } });
  const saved = await page.request.put(`/api/boards/${board.id}`, { headers, data: { expectedRevision: board.revision,
    incoming: { ...board.incoming, planning: { projectId: 'P_alice', status: 'F_status', weight: 'F_weight', priority: 'F_priority', sprint: 'F_sprint' } },
    document: { ...document, snapshot: { ...document.snapshot, store: { ...document.snapshot.store, ...Object.fromEntries(cards.map((card) => [card.id, card])) } } } } });
  expect(saved.ok()).toBe(true);
  return { board: validateBoard(await (await page.request.get(`/api/boards/${board.id}`, { headers })).json()), items, headers };
}

async function expectWholeTitle(card: Locator, minimumLines: number) {
  const title = card.locator('.workspace-card-title');
  const metrics = await title.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const visibleLines = Array.from(range.getClientRects()).filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom);
    return {
      overflow: style.overflowY,
      lineBudget: Number.parseFloat(style.height) / Number.parseFloat(style.lineHeight),
      partialLines: visibleLines.filter((rect) => rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1).length,
    };
  });
  expect(metrics.overflow).toBe('hidden');
  expect(metrics.lineBudget).toBeGreaterThanOrEqual(minimumLines - .01);
  expect(Math.abs(metrics.lineBudget - Math.round(metrics.lineBudget))).toBeLessThan(.01);
  expect(metrics.partialLines).toBe(0);
}

async function expectCardControls(card: Locator) {
  for (const control of await card.locator('button, a').all()) {
    await expect(control).toBeVisible();
    await expect.poll(async () => control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const cardRect = element.closest('.workspace-card')?.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return !!cardRect && rect.left >= cardRect.left && rect.right <= cardRect.right && rect.top >= cardRect.top && rect.bottom <= cardRect.bottom && (hit === element || element.contains(hit));
    }), { message: `Card action must receive input: ${await control.getAttribute('aria-label')}` }).toBe(true);
  }
}

test('compact titles keep whole lines and full details without growing hydrated cards', async ({ page }, testInfo) => {
  const { board, items, headers } = await seedCards(page);
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.workspace-card')).toHaveCount(7);
  await expect(page.locator('.card-project-fields').first()).toContainText('In progress');
  for (const size of ['compact', 'expanded']) {
    for (const [index, item] of items.entries()) {
      const card = page.locator(`[data-shape-id="shape:${size}-${index}"] .workspace-card`);
      await expect(card.locator('.workspace-card-title')).toHaveText(item.metadata.title);
      await expect(card.locator('.card-project-fields dd')).toHaveCount(4);
      await expectWholeTitle(card, 3);
      const bounds = await card.boundingBox();
      expect(bounds?.width).toBe(size === 'compact' ? 280 : 420);
      expect(bounds?.height).toBe(size === 'compact' ? 200 : 300);
      await expectCardControls(card);
      const trigger = card.getByRole('button', { name: 'Card details', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const details = page.getByRole('region', { name: 'Card details', exact: true });
      await expect(details.locator('h3')).toHaveText(item.metadata.title);
      await details.getByRole('button', { name: 'Close details', exact: true }).click();
      await expect(trigger).toBeFocused();
    }
  }
  const minimum = page.locator('[data-shape-id="shape:minimum"] .workspace-card');
  await expectWholeTitle(minimum, 2);
  await expectCardControls(minimum);
  const first = page.locator('[data-shape-id="shape:compact-0"] .workspace-card');
  const bugLabel = first.locator('.workspace-card-labels bdi').first();
  await expect(bugLabel).toHaveText('bug');
  expect(await bugLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await first.getByRole('button', { name: '1 related items', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Card details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.context().route('https://github.com/alice/project/issues/1', async (route) => { await route.fulfill({ status: 200, body: 'GitHub issue fixture' }); });
  const popupPromise = page.waitForEvent('popup');
  await first.getByRole('link', { name: 'Open in GitHub', exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toBe('https://github.com/alice/project/issues/1');
  await popup.close();
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await page.screenshot({ path: testInfo.outputPath(`cards-desktop-${theme}.png`) });
  }
  const persistedResponse = await page.request.get(`/api/boards/${board.id}`, { headers });
  expect(persistedResponse.ok()).toBe(true);
  const persisted = validateBoard(await persistedResponse.json());
  const originalShapes = Object.entries(board.document.snapshot.store).filter(([id]) => id.startsWith('shape:'));
  const savedShapes = Object.entries(persisted.document.snapshot.store).filter(([id]) => id.startsWith('shape:'));
  expect(savedShapes).toEqual(originalShapes);
});

test('compact card controls and complete titles remain available on narrow canvases', async ({ page }, testInfo) => {
  const { board, items } = await seedCards(page);
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.workspace-card')).toHaveCount(7);
  for (const [width, theme, textSize] of [[390, 'light', '100%'], [320, 'dark', '200%']] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((fontSize) => { document.documentElement.style.fontSize = fontSize; }, textSize);
    await selectTheme(page, theme);
    await openWorkspaceMenu(page);
    await page.getByRole('button', { name: /^Find/ }).click();
    await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).first().click();
    const card = page.locator('[data-shape-id="shape:compact-0"] .workspace-card');
    await expectWholeTitle(card, textSize === '200%' ? 2 : 3);
    expect(await card.locator('.workspace-card-title').evaluate((element) => getComputedStyle(element).fontSize)).toBe(textSize === '200%' ? '28px' : '14px');
    await page.screenshot({ path: testInfo.outputPath(`cards-${width}-${theme}-before-hit.png`) });
    await testInfo.attach(`card-controls-${width}`, { contentType: 'application/json', body: JSON.stringify(await card.locator('button, a').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const card = element.closest('.workspace-card')?.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { name: element.getAttribute('aria-label'), rect: rect.toJSON(), card: card?.toJSON(), hit: hit?.outerHTML.slice(0, 250) };
    }))) });
    await expectCardControls(card);
    await page.screenshot({ path: testInfo.outputPath(`cards-${width}-${theme}.png`) });
    await card.getByRole('button', { name: 'Card details', exact: true }).click();
    const details = page.getByRole('region', { name: 'Card details', exact: true });
    await expect(details.locator('h3')).toHaveText(items[0]?.metadata.title ?? 'Missing fixture');
    await details.getByRole('button', { name: 'Close details', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});
