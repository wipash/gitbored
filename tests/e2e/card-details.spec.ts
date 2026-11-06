import { expect, test, type Page } from '@playwright/test';
import { controlProvider, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.use({ viewport: { width: 1440, height: 900 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires GitHub fixture.');

async function selectedBounds(page: Page) {
  const panel = await page.getByRole('region', { name: 'Card details', exact: true }).boundingBox();
  const card = await page.locator('.workspace-card').filter({ hasText: 'Issue #1' }).boundingBox();
  if (!panel || !card) throw new Error('Card and details must be visible');
  return { panel, card };
}

async function expectAnchored(page: Page) {
  await expect.poll(async () => {
    const { panel, card } = await selectedBounds(page);
    return Math.min(Math.abs(panel.x - card.x - card.width - 12), Math.abs(card.x - panel.x - panel.width - 12));
  }).toBeLessThan(2);
}

test('details follow the selected card while panning and zooming, switch directly, and dismiss to the canvas', async ({ page }, testInfo) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('Anchored details');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
  await page.getByRole('button', { name: 'Close Incoming' }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).click();
  await expectAnchored(page);
  const initial = await selectedBounds(page);
  await page.mouse.move(650, 700);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(570, 660, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expectAnchored(page);
  await expect.poll(async () => (await selectedBounds(page)).panel.x).toBeLessThan(initial.panel.x - 40);
  const zoomPoint = { x: 1300, y: 650 };
  await expectNativePoint(page, zoomPoint);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0, -140);
    // Wheel delivery is asynchronous; retain the modifier until the zoom is rendered.
    await expect.poll(async () => Math.abs((await selectedBounds(page)).card.width - initial.card.width)).toBeGreaterThan(1);
  } finally { await page.keyboard.up('Control'); }
  await expectAnchored(page);
  await page.screenshot({ path: testInfo.outputPath('anchored-details-desktop.png') });
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #2' }).click();
  await expect(page.locator('.workspace-detail .detail-locator')).toHaveText('alice/project #2');
  await page.getByRole('button', { name: 'Close details', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Card details', exact: true })).toHaveCount(0);
  await expect(page.locator('.tl-container')).toBeFocused();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(async () => {
    const narrow = await page.getByRole('region', { name: 'Card details', exact: true }).boundingBox();
    return narrow && narrow.x >= 0 && narrow.x + narrow.width <= 320;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('anchored-details-narrow.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
});
