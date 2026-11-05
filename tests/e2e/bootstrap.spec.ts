import { expect, test } from '@playwright/test';

test('theme choices persist and System tracks browser preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/runtime');
  const theme = page.getByLabel('Theme', { exact: true });
  const document = page.locator('html');
  await expect(theme).toHaveValue('system');
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await theme.selectOption('light');
  await expect(document).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(theme).toHaveValue('light');
  await expect(document).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await theme.selectOption('dark');
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(theme).toHaveValue('dark');
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await theme.selectOption('system');
  await expect(document).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(theme).toHaveValue('system');
  await expect(document).toHaveAttribute('data-theme', 'dark');
});

test('unknown and malformed API routes return JSON errors, never the SPA', async ({ request }) => {
  for (const path of ['/api/not-a-route', '/api/%ZZ']) {
    const response = await request.get(path, { headers: { accept: 'text/html' } });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.text()).not.toContain('<!doctype html>');
  }
  const missing = await request.get('/api/not-a-route');
  expect(missing.status()).toBe(404);
});

test('missing assets return an error instead of the application HTML', async ({ request }) => {
  const asset = await request.get('/assets/missing.js', { headers: { accept: 'text/html' } });
  expect(asset.status()).toBe(404);
  expect(asset.headers()['content-type']).not.toContain('text/html');
});
