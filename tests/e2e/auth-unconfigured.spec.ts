import { expect, test } from '@playwright/test';

test.skip(process.env['E2E_AUTH_MODE'] !== 'unconfigured', 'Run with E2E_AUTH_MODE=unconfigured for missing-credential acceptance.');

test('an unconfigured deployment explains setup and has no fake sign-in path in either theme', async ({ page, request }) => {
  const response = await request.get('/api/session');
  expect(await response.json()).toEqual({ status: 'unconfigured' });
  const start = await request.get('/api/auth/github', { maxRedirects: 0 });
  expect(start.headers()['location']).toBe('/?authError=unconfigured');
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.getByText('GitHub sign-in is not configured on this deployment.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Check configuration again' }).click();
    await expect(page.getByRole('button', { name: 'Check configuration again' })).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const retry = page.getByRole('button', { name: 'Check configuration again' });
  const labelBounds = await retry.evaluate((button) => {
    const panel = button.closest('.auth-panel');
    if (!panel) throw new Error('Expected account panel');
    const control = button.getBoundingClientRect();
    const container = panel.getBoundingClientRect();
    const label = document.createRange();
    label.selectNodeContents(button);
    return {
      labelWithinControl: [...label.getClientRects()].every((line) => line.left >= control.left && line.right <= control.right),
      controlWithinPanel: control.left >= container.left && control.right <= container.right,
    };
  });
  expect(labelBounds).toEqual({ labelWithinControl: true, controlWithinPanel: true });
  await page.getByRole('button', { name: 'Check configuration again' }).click();
  await expect(page.getByRole('button', { name: 'Check configuration again' })).toBeVisible();
});
