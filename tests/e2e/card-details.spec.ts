import { expect, test, type Page } from '@playwright/test';
import { controlProvider, signIn, selectTheme, openWorkspaceMenu } from './auth-support.js';
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

async function openBoardWithCards(page: Page) {
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
}

test('details open explicitly, show escaped body, follow zoom and pan, and return focus', async ({ page }, testInfo) => {
  await openBoardWithCards(page);
  const firstCard = page.locator('.workspace-card').filter({ hasText: 'Issue #1' });
  const secondCard = page.locator('.workspace-card').filter({ has: page.locator('.workspace-card-heading').filter({ hasText: '#2' }) });
  const details = page.getByRole('region', { name: 'Card details', exact: true });
  await expect(details).toHaveCount(0);
  await firstCard.locator('.workspace-card-title').click();
  await expect(details).toHaveCount(0);
  await firstCard.getByRole('button', { name: 'Card details', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(details.locator('.card-detail-body')).toContainText('Investigate the board loading behaviour.');
  await expect(details.locator('.card-detail-body')).toContainText('<script>window.fixtureBodyExecuted = true</script>');
  await expect(details.locator('.card-detail-body script, .card-detail-body img')).toHaveCount(0);
  expect(await page.evaluate(() => 'fixtureBodyExecuted' in window)).toBe(false);
  await expectAnchored(page);
  const initial = await selectedBounds(page);
  await page.locator('.tl-container').focus();
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
  await expect.poll(async () => (await selectedBounds(page)).panel.width).toBeGreaterThan(initial.panel.width);
  await page.screenshot({ path: testInfo.outputPath('anchored-details-desktop.png') });
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #2' }).click();
  await expect(details).toHaveCount(0);
  await secondCard.getByRole('button', { name: 'Card details', exact: true }).click();
  await expect(page.locator('.workspace-detail .detail-locator')).toHaveText('alice/project #2');
  await page.getByRole('button', { name: 'Close details', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Card details', exact: true })).toHaveCount(0);
  await expect(secondCard.getByRole('button', { name: 'Card details', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).click();
  await firstCard.getByRole('button', { name: 'Card details', exact: true }).click();
  await selectTheme(page, 'dark');
  await page.screenshot({ path: testInfo.outputPath('anchored-details-dark.png') });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(async () => {
    const narrow = await page.getByRole('region', { name: 'Card details', exact: true }).boundingBox();
    return narrow && narrow.x >= 0 && narrow.x + narrow.width <= 320;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('anchored-details-narrow.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await details.getByRole('combobox', { name: 'Card size', exact: true }).selectOption('expanded');
  await details.getByRole('combobox', { name: 'Card size', exact: true }).selectOption('compact');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).click();
  await expect(details).toHaveCount(0);
  await firstCard.getByRole('button', { name: 'Card details', exact: true }).click();
  await expect(details).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
});


test('mobile details follow zoom in both directions and pan with an expanded card', async ({ page }, testInfo) => {
  await openBoardWithCards(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').filter({ hasText: 'project #1' }).click();
  const card = page.locator('.workspace-card').filter({ hasText: 'Issue #1' });
  await card.getByRole('button', { name: 'Card details', exact: true }).click();
  const details = page.getByRole('region', { name: 'Card details', exact: true });
  await details.getByRole('combobox', { name: 'Card size', exact: true }).selectOption('expanded');
  const initial = await selectedBounds(page);
  const panelScale = () => details.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  const initialScale = await panelScale();
  const zoomPoint = { x: 6, y: 500 };
  await page.locator('.tl-container').focus();
  await expectNativePoint(page, zoomPoint);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0, 280);
    await expect.poll(async () => (await selectedBounds(page)).card.width).toBeLessThan(initial.card.width - 10);
  } finally { await page.keyboard.up('Control'); }
  await expect.poll(panelScale).toBeLessThan(initialScale - .01);
  await expect.poll(async () => (await selectedBounds(page)).panel.width).toBeLessThan(initial.panel.width - 10);
  const zoomedOut = await selectedBounds(page);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.keyboard.down('Space');
  await page.mouse.down();
  try {
    await page.mouse.move(zoomPoint.x, zoomPoint.y - 150, { steps: 5 });
    // Check the anchor during the drag: release starts native inertial panning,
    // which may carry the card offscreen while the readable panel stays clamped.
    await expect.poll(async () => (await selectedBounds(page)).card.y).toBeLessThan(zoomedOut.card.y - 100);
    await expect.poll(async () => (await selectedBounds(page)).panel.y).toBeLessThan(zoomedOut.panel.y - 30);
    await expect.poll(async () => { const bounds = await selectedBounds(page); return Math.abs(bounds.panel.y - bounds.card.y); }).toBeLessThan(2);
  } finally {
    await page.mouse.up();
    await page.keyboard.up('Space');
  }
  await expect.poll(async () => {
    const { panel } = await selectedBounds(page);
    return panel.x >= 0 && panel.x + panel.width <= 390 && panel.y >= 60 && panel.y + panel.height <= 740;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-details-zoomed-out.png') });
  const outScale = await panelScale();
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0, -280);
    await expect.poll(async () => (await selectedBounds(page)).card.width).toBeGreaterThan(zoomedOut.card.width + 10);
  } finally { await page.keyboard.up('Control'); }
  await expect.poll(panelScale).toBeGreaterThan(outScale + .01);
  await expect.poll(async () => (await selectedBounds(page)).panel.width).toBeGreaterThan(zoomedOut.panel.width + 10);
  await page.screenshot({ path: testInfo.outputPath('mobile-details-zoomed-in.png') });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(async () => {
    const box = await details.boundingBox();
    return box !== null && box.x >= 0 && box.x + box.width <= 320 && box.y >= 60 && box.y + box.height <= 730;
  }).toBe(true);
  await details.getByRole('combobox', { name: 'Card size', exact: true }).selectOption('compact');
  await page.screenshot({ path: testInfo.outputPath('mobile-details-enlarged-text.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(details).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Card details', exact: true })).toBeFocused();
});
