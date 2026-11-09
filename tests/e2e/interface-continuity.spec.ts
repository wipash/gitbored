import { expect, test, type Locator, type Page } from '@playwright/test';
import { applicationOrigin, controlProvider, currentSession, openSettings, openWorkspaceMenu, selectTheme, signIn } from './auth-support.js';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function boardWithMenus(page: Page) {
  await signIn(page);
  await page.getByLabel('Board name', { exact: true }).fill('Menu continuity and a long board name');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.locator('.tl-container')).toBeVisible();
  await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  await page.getByLabel('Search repositories').fill('alice/project');
  await page.getByRole('button', { name: /alice\/project/ }).first().click();
  await page.getByLabel('State', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await expect(page.locator('.incoming-candidates > li')).toHaveCount(5);
  await page.locator('.incoming-candidates > li').first().getByRole('button', { name: /^Add to board:/ }).click();
  await page.getByRole('button', { name: 'Close Incoming', exact: true }).click();
  await expect(page.locator('.workspace-card')).toHaveCount(1);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected owner');
  for (const title of ['A second planning board with a long name', 'Small board']) {
    expect((await page.request.post('/api/boards', { headers: { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken }, data: { title } })).status()).toBe(201);
  }
}

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect.soft.poll(async () => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && (hit === element || element.contains(hit));
  }), { message: 'Control must remain inside the viewport and receive pointer input' }).toBe(true);
}


function contrast(foreground: string, background: string) {
  const luminance = (colour: string) => {
    const channels = colour.match(/[\d.]+/g)?.slice(0, 3).map((channel) => {
      const value = Number(channel) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    if (!channels || channels.length !== 3) throw new Error(`Unsupported rendered colour: ${colour}`);
    return (channels[0] ?? 0) * .2126 + (channels[1] ?? 0) * .7152 + (channels[2] ?? 0) * .0722;
  };
  const first = luminance(foreground); const second = luminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

async function renderedColours(control: Locator, pseudo = '') {
  return await control.evaluate((element, pseudo) => {
    let background = getComputedStyle(element, pseudo || null).backgroundColor;
    let ancestor: Element | null = element.parentElement;
    while (background === 'rgba(0, 0, 0, 0)' && ancestor) {
      background = getComputedStyle(ancestor).backgroundColor;
      ancestor = ancestor.parentElement;
    }
    return { foreground: getComputedStyle(element).color, background };
  }, pseudo);
}

for (const viewport of [{ width: 1440, height: 1000, text: '100%' }, { width: 320, height: 900, text: '200%' }]) {
  test(`application and native menus stay usable at ${viewport.width}px and ${viewport.text} text`, async ({ page }, testInfo) => {
    await boardWithMenus(page);
    await page.setViewportSize(viewport);
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, viewport.text);
    for (const theme of ['light', 'dark']) {
      await selectTheme(page, theme);
      const screenshot = async (name: string) => { await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${theme}-${name}.png`) }); };
      await openWorkspaceMenu(page);
      const colourTrigger = page.getByRole('button', { name: /^Colour by:/ });
      await reachable(colourTrigger);
      await screenshot('menu');
      await colourTrigger.click();
      const mode = page.getByRole('combobox', { name: 'Colour by', exact: true });
      await reachable(mode);
      const colours = await renderedColours(mode);
      expect(contrast(colours.foreground, colours.background)).toBeGreaterThanOrEqual(4.5);
      await mode.selectOption('assignee');
      await reachable(page.getByLabel('Unassigned colour'));
      await screenshot('colours');
      await page.getByRole('button', { name: 'Close Card colours' }).click();
      await openWorkspaceMenu(page);
      await reachable(page.getByRole('button', { name: 'Settings', exact: true }));
      await openSettings(page);
      await reachable(page.getByLabel('Theme', { exact: true }));
      const fieldColours = await renderedColours(page.getByLabel('Theme', { exact: true }));
      expect(contrast(fieldColours.foreground, fieldColours.background)).toBeGreaterThanOrEqual(4.5);
      const panelColours = await renderedColours(page.getByRole('region', { name: 'Settings', exact: true }));
      await screenshot('settings-top');
      await reachable(page.getByLabel('Project', { exact: true }));
      await screenshot('settings-bottom');
      await reachable(page.getByRole('button', { name: 'Close Settings', exact: true }));
      await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
      for (const [trigger, close, content] of [
        ['Find', 'Close Find', '.workspace-find-results button'],
        ['Incoming', 'Close Incoming', '.incoming-candidates > li button'],
        ['Repositories', 'Close repositories', '.repository-results button'],
      ] as const) {
        await openWorkspaceMenu(page);
        await page.getByRole('button', { name: new RegExp(`^${trigger}`) }).click();
        await reachable(page.locator(content).first());
        await screenshot(trigger.toLowerCase());
        if (trigger === 'Find') {
          const search = page.getByRole('searchbox', { name: 'Find cards', exact: true });
          await search.fill('no matching card anywhere');
          await page.keyboard.press('Tab');
          const clear = page.getByRole('button', { name: 'Clear search', exact: true });
          await expect(clear).toBeFocused();
          await reachable(clear);
          await screenshot('find-empty');
          await page.keyboard.press('Enter');
          await expect(search).toBeFocused();
          await expect(search).toHaveValue('');
          await expect(page.locator('.workspace-find-results button')).toHaveCount(1);
        }
        await reachable(page.getByRole('button', { name: close, exact: true }));
        await page.getByRole('button', { name: close, exact: true }).focus();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: close, exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: viewport.width <= 900 ? /^Menu$/ : new RegExp(`^${trigger}`) })).toBeFocused();
      }
      if (viewport.width <= 900) await openWorkspaceMenu(page);
      await page.getByRole('button', { name: 'Boards ▾', exact: true }).click();
      if (viewport.width <= 900) await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
      await reachable(page.locator('.board-switcher').getByLabel('Board name', { exact: true }));
      const create = page.locator('.board-switcher').getByRole('button', { name: 'Create board', exact: true });
      await create.hover();
      const primaryColours = await renderedColours(create);
      expect(contrast(primaryColours.foreground, primaryColours.background)).toBeGreaterThanOrEqual(4.5);
      await screenshot('boards');
      await reachable(page.locator('.board-switcher').getByRole('link', { name: 'Small board', exact: true }).last());
      await reachable(page.getByRole('button', { name: 'Close boards', exact: true }));
      await page.getByRole('button', { name: 'Close boards', exact: true }).click();
      const selectedTool = page.locator('.tlui-button__tool[aria-pressed="true"]').first();
      const toolColours = await renderedColours(selectedTool, '::after');
      expect(contrast(toolColours.foreground, toolColours.background)).toBeGreaterThanOrEqual(3);
      await testInfo.attach(`${viewport.width}-${theme}-contrast`, { body: JSON.stringify({ field: { ...fieldColours, ratio: contrast(fieldColours.foreground, fieldColours.background) }, selectedTool: { ...toolColours, ratio: contrast(toolColours.foreground, toolColours.background) }, panel: panelColours }), contentType: 'application/json' });
      for (const name of ['More', 'Actions']) {
        const trigger = page.getByRole('button', { name, exact: true });
        await reachable(trigger);
        await trigger.click();
        const popup = page.getByRole('dialog').last();
        await expect(popup).toBeVisible();
        expect((await renderedColours(popup)).background).toBe(panelColours.background);
        await screenshot(`native-${name.toLowerCase()}`);
        await reachable(popup.getByRole('button').first());
        await page.keyboard.press('Escape');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    }
  });
}

test('saved feedback stays subtle while a failed save keeps recovery visible', async ({ page }) => {
  await boardWithMenus(page);
  const status = page.locator('.board-save');
  await expect(status).toHaveAttribute('data-save-state', 'saved');
  expect(await status.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  const id = page.url().split('/').pop();
  if (!id) throw new Error('Missing board id');
  await page.route(`**/api/boards/${id}`, async (route) => {
    if (route.request().method() === 'PUT') await route.abort('failed');
    else await route.continue();
  });
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.locator('.workspace-find-results button').click();
  await page.keyboard.press('ArrowRight');
  await expect(status).toHaveAttribute('data-save-state', 'unsaved');
  await expect(status).toHaveAttribute('data-save-attention', 'true');
  await reachable(status.getByRole('button', { name: /Retry/ }));
  expect(await status.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(1);
  await page.unroute(`**/api/boards/${id}`);
  await status.getByRole('button', { name: /Retry/ }).click();
  await expect(status).toHaveAttribute('data-save-state', 'saved');
});
