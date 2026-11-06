import { expect, test, type Locator } from '@playwright/test';
import { controlProvider, openSettings, signIn } from './auth-support.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires GitHub fixture.');

async function expectUncovered(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect.poll(async () => control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.right <= innerWidth
      && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
}

test('phone menus leave the canvas clear and open reachable panels with account and theme only in Settings', async ({ page }, testInfo) => {
  await controlProvider(page.request, { reset: true });
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('Mobile workspace');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).tap();
  await page.getByRole('button', { name: 'Repositories', exact: true }).tap();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().tap();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).tap();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await expectUncovered(page.getByRole('button', { name: 'Add all matching', exact: true }));
  await page.getByRole('button', { name: 'Add all matching', exact: true }).tap();
  await page.getByRole('button', { name: 'Close Incoming', exact: true }).tap();
  await expect(page.locator('.workspace-card')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  await expect(page.locator('.workspace-account')).toHaveCount(0);
  await expect(page.getByLabel('Theme', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('phone-canvas.png') });

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const textSize of ['100%', '200%']) {
      await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, textSize);
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await expectUncovered(menu);
      await menu.tap();
      await expectUncovered(page.getByRole('button', { name: 'Settings', exact: true }));
      await page.getByRole('button', { name: 'Settings', exact: true }).tap();
      await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
      await expectUncovered(page.getByLabel('Theme', { exact: true }));
      await page.getByLabel('Theme', { exact: true }).selectOption('dark');
      await expectUncovered(page.getByRole('button', { name: 'Sign out', exact: true }));
      await expectUncovered(page.getByRole('button', { name: 'Close Settings', exact: true }));
      await page.screenshot({ path: testInfo.outputPath(`settings-${viewport.width}-${textSize}.png`) });
      await page.getByRole('button', { name: 'Close Settings', exact: true }).tap();
      await expect(menu).toBeFocused();
      for (const [trigger, close] of [['Find', 'Close Find'], ['Repositories', 'Close repositories'], ['Incoming', 'Close Incoming']] as const) {
        await menu.tap();
        await page.getByRole('button', { name: new RegExp(`^${trigger}`) }).tap();
        await expectUncovered(page.getByRole('button', { name: close, exact: true }));
        await page.getByRole('button', { name: close, exact: true }).tap();
        await expect(menu).toBeFocused();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await openSettings(page);
  await page.getByRole('button', { name: 'Close Settings', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
});
