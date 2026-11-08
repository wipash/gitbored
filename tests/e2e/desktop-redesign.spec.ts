import { expect, test, type Page } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { resizeCard } from './board-gestures.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn, openSettings, selectTheme, openWorkspaceMenu } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 900 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires GitHub fixture.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });
async function create(page: Page, title: string) {
  await signIn(page);
  await page.goto('/boards');
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
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
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
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').first().click();
  await resizeCard(page, page.locator('.workspace-card').first(), 140, 100);
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

test('session restoration does not render the signed-out landing screen', async ({ page }) => {
  const id = await create(page, 'Startup restoration');
  for (const path of ['/', `/boards/${id}`]) {
    let release = () => {};
    let requested = false;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/session', async (route) => { requested = true; await held; await route.continue(); });
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Connect with GitHub' })).toHaveCount(0);
    } finally { release(); }
    await expect(page.locator('.tl-container')).toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('sign-in and empty Boards share a compact workspace with account and theme inside Settings', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
  const signInPanel = await page.locator('.auth-panel').boundingBox();
  if (!signInPanel) throw new Error('Missing sign-in panel');
  expect.soft(signInPanel.width, 'Sign-in uses a compact workspace panel').toBeLessThanOrEqual(480);
  for (const route of ['sign-in', 'boards']) {
    if (route === 'boards') {
      await signIn(page);
      await page.goto('/boards');
      await expect(page.getByLabel('Board name', { exact: true })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      await selectTheme(page, theme);
      const shell = await page.locator('.auth-shell').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,
          background: getComputedStyle(element).backgroundImage, viewport: innerWidth,
          viewportHeight: innerHeight, scrollHeight: document.documentElement.scrollHeight };
      });
      expect.soft(shell.top, `${route} background reaches top`).toBe(0);
      expect.soft(shell.left, `${route} background reaches left edge`).toBe(0);
      expect.soft(shell.width).toBe(shell.viewport);
      expect.soft(shell.height).toBeGreaterThanOrEqual(shell.viewportHeight);
      expect.soft(shell.background).toContain('radial-gradient');
      expect.soft(shell.scrollHeight, `${route} fits desktop viewport`).toBe(shell.viewportHeight);
      await page.screenshot({ path: testInfo.outputPath(`${route}-${theme}-desktop.png`), fullPage: true });
    }
  }
  await expect(page.locator('.workspace-account')).toHaveCount(0);
  await expect(page.getByLabel('Theme', { exact: true })).toHaveCount(0);
  await openSettings(page);
  const settings = page.getByRole('region', { name: 'Settings', exact: true });
  await expect(settings.getByLabel('Theme', { exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('Settings keeps account and theme controls reachable without covering Incoming with a bottom bar', async ({ page }) => {
  await create(page, 'Account controls');
  await connect(page);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  for (const width of [1440, 1280, 640, 320]) {
    await page.setViewportSize({ width, height: width === 640 ? 400 : 800 });
    for (const fontSize of width === 640 ? ['100%'] : ['100%', '200%']) {
      await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
      await expect(page.locator('.workspace-account')).toHaveCount(0);
      await expect.poll(async () => await page.locator('.incoming-body').evaluate((body) => body.clientHeight)).toBeGreaterThan(0);
      for (const label of ['Add selected', 'Add all matching']) {
        const hit = await page.getByRole('button', { name: label, exact: true }).evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        });
        expect.soft(hit, `${width}px ${fontSize} ${label} is uncovered`).toBe(true);
      }
      await openSettings(page);
      for (const control of [page.getByLabel('Theme', { exact: true }), page.getByRole('button', { name: 'Sign out', exact: true })]) {
        await control.focus();
        await expect(control).toBeFocused();
        expect(await control.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        })).toBe(true);
      }
      await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
      await openWorkspaceMenu(page);
      await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
});

test('account recovery messages leave account actions and theme reachable', async ({ page }) => {
  const id = await create(page, 'Account recovery controls');
  await connect(page);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await saved(page);
  await page.route('**/api/session', (route) => route.abort('failed'));
  await page.route(`**/api/boards/${id}`, (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }) : route.continue());
  await page.locator('.incoming-candidates input[type=checkbox]').first().check();
  await page.getByRole('button', { name: 'Add selected', exact: true }).click();
  await openSettings(page);
  await expect(page.locator('.account-context-status')).toContainText('Your account could not be checked');
  await expect(page.locator('.board-save')).toContainText('saving is paused');
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await openSettings(page);
    await expect(page.locator('.workspace-account')).toHaveCount(0);
    for (const control of [page.getByRole('link', { name: 'Boards', exact: true }), page.getByLabel('Theme'), page.getByRole('button', { name: 'Check account', exact: true })]) {
      await control.scrollIntoViewIfNeeded();
      expect(await control.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
    }
  }
});

test('Add selected stays reachable at the bottom of Incoming without scrolling the selection away', async ({ page }) => {
  await create(page, 'Incoming footer');
  await page.setViewportSize({ width: 1280, height: 700 });
  await connect(page);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.locator('.incoming-candidates input[type=checkbox]').first().check();
  await page.locator('.incoming-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
  const hit = await page.getByRole('button', { name: 'Add selected', exact: true }).evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  });
  expect(hit).toBe(true);
  await page.getByRole('button', { name: 'Add selected', exact: true }).click();
  await expect(page.locator('.workspace-card')).toHaveCount(1);
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(4);
  await expect(page.locator('#incoming-panel')).toBeVisible();
});

test('one Settings panel keeps board and view controls keyboard reachable in both themes', async ({ page }, info) => {
  const id = await create(page, 'Combined settings');
  const canvas = await page.locator('.tl-container').elementHandle();
  if (!canvas) throw new Error('Missing canvas');
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Board settings', exact: true })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((narrow) => { document.documentElement.style.fontSize = narrow ? '200%' : '100%'; }, width === 320);
      await openWorkspaceMenu(page);
      const trigger = page.getByRole('button', { name: 'Settings', exact: true });
      expect(await trigger.evaluate((element) => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
      await trigger.focus(); await page.keyboard.press('Enter');
      const panel = page.getByRole('region', { name: 'Settings', exact: true });
      for (const control of [panel.getByLabel('Board name', { exact: true }), panel.getByLabel('Hide closed'), panel.getByLabel('Connections', { exact: true })]) {
        await control.focus();
        await expect(control).toBeFocused();
        await expect(control).toBeInViewport();
        expect(await control.evaluate((element) => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await panel.getByLabel('Board name', { exact: true }).fill('Combined settings renamed');
      await panel.getByRole('button', { name: 'Rename board', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Combined settings renamed', exact: true })).toBeVisible();
      await panel.getByLabel('Board name', { exact: true }).focus();
      await page.screenshot({ path: info.outputPath(`settings-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(width <= 700 ? page.getByRole('button', { name: 'Menu', exact: true }) : trigger).toBeFocused();
      expect(await canvas.evaluate((element) => element.isConnected)).toBe(true);
    }
  }
  expect((await board(page, id)).title).toBe('Combined settings renamed');
});
