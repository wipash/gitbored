import { expect, test, type Page } from '@playwright/test';
import { controlProvider, currentSession, signIn, selectTheme, openSettings, openWorkspaceMenu } from './auth-support.js';
import { validateBoard } from '../../src/shared/boards.js';

test.use({ viewport: { width: 1440, height: 900 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires GitHub fixture.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

test('saved card colours return after temporary status, priority and split-label colouring', async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto('/boards');
  await page.getByLabel('Board name', { exact: true }).fill('Colour views');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.locator('.tl-container')).toBeVisible();
  const id = page.url().split('/').pop();
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
  await expect(page.locator('.workspace-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Close Incoming' }).click();
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').first().click();
  await page.getByTestId('style.color.blue').click();
  const card = page.locator('.workspace-card[data-card-colour="blue"]');
  await expect(card).toHaveCount(1);
  const reference = await card.getAttribute('data-reference-id');
  const original = await card.evaluate((element) => getComputedStyle(element).backgroundImage);
  await expect(page.getByRole('region', { name: 'Card details', exact: true })).toHaveCount(0);
  await openSettings(page);
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Delivery' });
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await openColours(page);
  await selectColourMode(page, 'Status');
  await page.getByLabel('In progress colour', { exact: true }).fill('#abcdef');
  await expect(card).toHaveAttribute('data-colour-by', 'status');
  await expect.poll(async () => card.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe(original);
  await selectColourMode(page, 'Priority');
  await expect(card).toHaveAttribute('data-colour-by', 'priority');
  await expect(page.getByLabel('High colour')).toBeVisible();
  await selectColourMode(page, 'Labels');
  await expect.poll(async () => card.evaluate((element) => getComputedStyle(element).getPropertyValue('--card-stripes'))).toContain('12.5%');
  await selectColourMode(page, 'Status');
  await page.getByLabel('Open colour', { exact: true }).fill('#123456');
  await expect(page.locator('.workspace-card-heading .card-category').filter({ hasText: /^Open$/ }).first()).toHaveCSS('border-inline-start-color', 'rgb(18, 52, 86)');
  await selectColourMode(page, 'Type');
  await expect(page.getByLabel('Feature colour')).toBeVisible();
  await expect(page.getByLabel('Bug colour')).toBeVisible();
  await selectColourMode(page, 'Off');
  await expect.poll(async () => card.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(original);
  await page.getByRole('button', { name: 'Close Card colours' }).click();
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected session');
  const response = await page.request.get(`/api/boards/${id}`, { headers: { 'X-CSRF-Token': session.csrfToken } });
  const saved = validateBoard(await response.json());
  expect(Object.values(saved.document.snapshot.store).filter((record) => record.typeName === 'shape' && record.type === 'item-card' && record.props.color === 'blue')).toHaveLength(1);
  expect(JSON.stringify(saved.document)).not.toContain('#123456');
  await page.reload();
  await expect(page.locator(`.workspace-card[data-reference-id="${reference}"]`)).toHaveAttribute('data-card-colour', 'blue');
  await expect(page.locator('.workspace-card-heading .card-category').filter({ hasText: /^Open$/ }).first()).toHaveCSS('border-inline-start-color', 'rgb(18, 52, 86)');
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await openColours(page);
    await selectColourMode(page, 'Status');
    await page.screenshot({ path: testInfo.outputPath(`card-colours-${theme}.png`) });
    await page.getByRole('button', { name: 'Close Card colours' }).click();
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await openColours(page);
  await selectColourMode(page, 'Labels');
  await page.locator('.category-colour-list input').first().focus();
  await expect(page.locator('.category-colour-list input').first()).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('card-colours-narrow.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await selectColourMode(page, 'Status');
  await page.getByLabel('Open colour', { exact: true }).focus();
  await page.screenshot({ path: testInfo.outputPath('colour-menu-enlarged.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();

});

test('the switcher supports arrow keys and persists, while Colours returns keyboard focus', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('Keyboard colours');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  const modes = page.getByRole('group', { name: 'Colour by', exact: true });
  await modes.getByRole('radio', { name: 'Off', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(modes.getByRole('radio', { name: 'Status', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(modes.getByRole('radio', { name: 'Priority', exact: true })).toBeChecked();
  await page.keyboard.press('Tab');
  const trigger = page.getByRole('button', { name: 'Colours', exact: true });
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close Card colours' })).toBeFocused();
  await expect(page.getByText('No values on these cards yet.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('region', { name: 'Card colours', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(modes.getByRole('radio', { name: 'Priority', exact: true })).toBeChecked();
  await trigger.click();
  await selectColourMode(page, 'Status');
  await expect(page.getByLabel('Cancelled colour')).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('region', { name: 'Card colours', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Cancelled colour')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await page.evaluate(() => {
    // Keep the receiver of each storage call when simulating a colour-preference quota failure.
    // oxlint-disable-next-line typescript/unbound-method
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('gitbored.card-colours.')) throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await selectColourMode(page, 'Assignee');
  await expect(page.getByRole('status').filter({ hasText: 'Colours apply for this visit.' })).toContainText('Allow browser storage');
});

async function openColours(page: Page) {
  if (await page.getByRole('region', { name: 'Card colours', exact: true }).isVisible()) return;
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Colours', exact: true }).click();
}

async function selectColourMode(page: Page, name: string) {
  const radio = page.getByRole('radio', { name, exact: true });
  const paletteWasOpen = await page.getByRole('region', { name: 'Card colours', exact: true }).isVisible();
  if (!await radio.isVisible()) await openWorkspaceMenu(page);
  await radio.check();
  if (paletteWasOpen) await openColours(page);
}

test('assignment colours distinguish people, keep unassigned white, and reset only the active category', async ({ page }) => {
  await controlProvider(page.request, { sourceColourCases: true });
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('Assignment colours');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
  await expect(page.locator('.workspace-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Close Incoming' }).click();
  const card = (number: number) => page.locator('.workspace-card').filter({ has: page.locator('.workspace-card-heading strong').filter({ hasText: new RegExp(`#${number}$`) }) });
  const accent = (number: number) => card(number).evaluate((element) => element.style.getPropertyValue('--card-accent'));
  await openColours(page);
  await selectColourMode(page, 'Priority');
  await expect(page.getByText('Uses the project priority field chosen in Settings. Cards without one show as No priority.')).toBeVisible();
  await expect.poll(() => accent(1)).toBe('#87929e');
  await selectColourMode(page, 'Assignee');
  await expect(card(5).locator('footer')).toContainText('Unassigned');
  await expect.poll(() => accent(5)).toBe('#ffffff');
  await expect.poll(() => accent(2)).not.toBe(await accent(3));
  await expect.poll(() => card(1).evaluate((element) => element.style.getPropertyValue('--card-stripes'))).toContain('50%');
  await page.getByLabel('@alice colour', { exact: true }).fill('#123456');
  await expect.poll(() => accent(1)).toBe('#123456');
  await expect.poll(() => accent(2)).toBe('#123456');
  await page.getByLabel('Unassigned colour').fill('#eeeeee');
  await selectColourMode(page, 'Status');
  await page.getByLabel('Open colour', { exact: true }).fill('#345678');
  await expect.poll(() => accent(1)).toBe('#345678');
  await expect(card(5).locator('.workspace-card-heading')).toContainText('Cancelled');
  await page.getByLabel('Cancelled colour').fill('#234567');
  await expect.poll(() => accent(5)).toBe('#234567');
  await selectColourMode(page, 'Assignee');
  await page.getByRole('button', { name: 'Reset these colours' }).click();
  await expect.poll(() => accent(5)).toBe('#ffffff');
  await expect.poll(() => accent(2)).not.toBe('#123456');
  await selectColourMode(page, 'Status');
  await expect.poll(() => accent(1)).toBe('#345678');
  await page.getByRole('button', { name: 'Close Card colours' }).click();
  await openSettings(page);
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Delivery' });
  await expect.poll(() => accent(1)).not.toBe('#345678');
  // Issue 1 has a project status; issue 5 has none and keeps its GitHub-state colour.
  await expect.poll(() => accent(5)).toBe('#234567');
  await page.getByLabel('status field', { exact: true }).selectOption('');
  await expect.poll(() => accent(1)).toBe('#345678');
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await openColours(page);
  await selectColourMode(page, 'Assignee');
  await page.getByLabel('@alice colour', { exact: true }).fill('#123456');
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Assignee', exact: true })).toBeChecked();
  await expect.poll(() => accent(2)).toBe('#123456');
  await expect.poll(() => accent(5)).toBe('#ffffff');
  await openColours(page);
  await card(1).getByRole('button', { name: 'Card details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Card colours', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Card details', exact: true })).toBeVisible();
});

test('colour modes change with one click while palette editing stays optional', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('One-click colours');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  const modes = page.getByRole('group', { name: 'Colour by', exact: true });
  const palette = page.getByRole('region', { name: 'Card colours', exact: true });
  await expect(modes.getByRole('radio')).toHaveCount(6);
  const trigger = page.getByRole('button', { name: 'Colours', exact: true });
  const initialX = await trigger.evaluate((element) => element.getBoundingClientRect().x);
  for (const name of ['Status', 'Priority', 'Labels', 'Type', 'Assignee', 'Off']) {
    await modes.getByRole('radio', { name, exact: true }).click();
    await expect(modes.getByRole('radio', { name, exact: true })).toBeChecked();
    await expect(palette).toHaveCount(0);
    expect(await trigger.evaluate((element) => element.getBoundingClientRect().x)).toBe(initialX);
  }
  await modes.getByRole('radio', { name: 'Status', exact: true }).click();
  await page.getByRole('button', { name: 'Colours', exact: true }).click();
  await expect(page.getByLabel('Open colour', { exact: true })).toBeVisible();
  await modes.getByRole('radio', { name: 'Assignee', exact: true }).click();
  await expect(palette).toBeVisible();
  await expect(page.getByLabel('Unassigned colour', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Open colour', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 960, height: 800 });
  const switcherTop = await modes.evaluate((element) => element.getBoundingClientRect().top);
  const triggerTop = await trigger.evaluate((element) => element.getBoundingClientRect().top);
  expect(Math.abs(switcherTop - triggerTop)).toBeLessThan(8);
});
