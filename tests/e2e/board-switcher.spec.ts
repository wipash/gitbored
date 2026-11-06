import { expect, test, type Locator } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { applicationOrigin, controlProvider, currentSession, selectTheme, signIn } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.use({ viewport: { width: 1440, height: 900 } });

async function hitTarget(control: Locator) {
  await expect(control).toBeVisible();
  expect(await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && (element === hit || element.contains(hit));
  })).toBe(true);
}

test('board switcher stays below its trigger with a fixed header and keyboard-reachable scrolling list', async ({ page }, testInfo) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in owner');
  const headers = { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
  const existingResponse = await page.request.get('/api/boards', { headers });
  expect(existingResponse.ok()).toBe(true);
  const existing: unknown = await existingResponse.json();
  if (typeof existing !== 'object' || existing === null || !('boards' in existing) || !Array.isArray(existing.boards)) throw new Error('Expected board list');
  // The suite shares its database; provider reset does not delete earlier boards.
  const expectedCount = existing.boards.length + 13;
  for (let index = 0; index < 12; index += 1) {
    const response = await page.request.post('/api/boards', { headers, data: { title: `Switcher board ${index + 1} with enough text to test wrapping` } });
    expect(response.status()).toBe(201);
  }
  const response = await page.request.post('/api/boards', { headers, data: { title: 'Current board' } });
  expect(response.status()).toBe(201);
  const board = validateBoard(await response.json());
  await page.goto(`/boards/${board.id}`);
  await expect(page.getByRole('heading', { name: 'Current board', exact: true })).toBeFocused();
  await expect(page.locator('#board-heading')).toHaveCSS('outline-style', 'none');

  for (const layout of [{ width: 1440, height: 900, text: '100%', theme: 'light' }, { width: 390, height: 844, text: '100%', theme: 'dark' }, { width: 320, height: 800, text: '200%', theme: 'light' }]) {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await selectTheme(page, layout.theme);
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, layout.text);
    const trigger = page.getByRole('button', { name: 'Boards ▾', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const switcher = page.locator('.board-switcher');
    const close = switcher.getByRole('button', { name: 'Close boards', exact: true });
    await expect(close).toBeFocused();
    await expect(close).not.toHaveCSS('outline-style', 'none');
    await hitTarget(close);
    const heading = await page.locator('.board-heading').boundingBox();
    const box = await switcher.boundingBox();
    if (!heading || !box) throw new Error('Missing switcher geometry');
    expect(box.y - heading.y - heading.height).toBeGreaterThanOrEqual(7);
    expect(box.y - heading.y - heading.height).toBeLessThanOrEqual(10);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
    await page.screenshot({ path: testInfo.outputPath(`switcher-${layout.width}-top.png`) });
    await page.keyboard.press('Tab');
    await expect(switcher.getByLabel('Board name', { exact: true })).toBeFocused();
    await hitTarget(switcher.getByLabel('Board name', { exact: true }));
    await page.keyboard.press('Tab');
    await expect(switcher.getByRole('button', { name: 'Create board', exact: true })).toBeFocused();
    await hitTarget(switcher.getByRole('button', { name: 'Create board', exact: true }));
    const links = switcher.getByRole('link');
    await expect(links).toHaveCount(expectedCount);
    for (let index = 0; index < expectedCount; index += 1) {
      await page.keyboard.press('Tab');
      await expect(links.nth(index)).toBeFocused();
      await hitTarget(links.nth(index));
    }
    expect(await switcher.locator('.board-switcher-body').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
    await hitTarget(close);
    await page.screenshot({ path: testInfo.outputPath(`switcher-${layout.width}-scrolled.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(layout.width);
    await page.keyboard.press('Escape');
    await expect(switcher).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
