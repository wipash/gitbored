import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { controlProvider, providerOrigin, signIn } from './auth-support.js';

async function gate(request: APIRequestContext, action: 'arm' | 'release' | 'reset', target?: string): Promise<void> {
  expect((await request.post(`${providerOrigin}/__source-gate`, { data: { action, target } })).ok()).toBe(true);
}
async function waitGate(request: APIRequestContext, target: string, state: 'entered' | 'completed' = 'entered'): Promise<void> {
  await expect.poll(async () => {
    const value: unknown = await (await request.get(`${providerOrigin}/__source-gate?target=${target}`)).json();
    return typeof value === 'object' && value !== null && state in value && Reflect.get(value, state) === true;
  }).toBe(true);
}
async function choose(page: Page, repository: 'project' | 'other'): Promise<void> {
  const choice = page.getByRole('button', { name: `Browse alice/${repository} · Private`, exact: true });
  if (repository === 'other' && !await choice.isVisible()) await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await choice.click();
}
async function picker(page: Page): Promise<void> {
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await expect(page.getByRole('button', { name: 'Browse alice/project · Private', exact: true })).toBeVisible();
}
async function submit(page: Page, repository: 'project' | 'other', number = 1): Promise<void> {
  await page.getByLabel('GitHub item URL', { exact: true }).fill(`https://github.com/alice/${repository}/issues/${number}`);
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
}
async function deny(page: Page, repository: 'project' | 'other'): Promise<void> {
  await controlProvider(page.request, { sourceDenied: true });
  await submit(page, repository);
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  await controlProvider(page.request, { sourceDenied: false });
}

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Configured source authorization is required.');
test.beforeEach(async ({ request }) => {
  await controlProvider(request, { reset: true });
  await gate(request, 'reset');
});

test('remembered repository denials accumulate across navigation and retry clears only its selected repository', async ({ page }) => {
  await signIn(page); await picker(page); await choose(page, 'project');
  await expect(page.locator('.source-item')).toHaveCount(2); await deny(page, 'project');
  await page.getByRole('button', { name: 'Back to repositories', exact: true }).click();
  await choose(page, 'other'); await expect(page.locator('.source-item')).toHaveCount(2); await deny(page, 'other');
  await page.getByRole('button', { name: 'Back to repositories', exact: true }).click();
  await choose(page, 'project');
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  await expect(page.locator('.source-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload installations', exact: true }).click();
  await picker(page); await choose(page, 'other');
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/public/outside/issues/5');
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  await page.request.post(`${providerOrigin}/__source-stats/reset`);
  await page.getByRole('button', { name: 'Retry repository', exact: true }).click();
  await expect(page.locator('.source-locator').filter({ hasText: 'alice/other' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to repositories', exact: true }).click();
  await choose(page, 'project');
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  const requests = await (await page.request.get(`${providerOrigin}/__source-stats`)).text();
  expect(requests).toContain('/repos/alice/other/issues?');
  expect(requests).not.toContain('/repos/alice/project');
  await submit(page, 'project');
  await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
  await expect(page.locator('.source-locator').filter({ hasText: 'alice/project' })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/sources-remembered-denials.png', fullPage: true });
});

for (const width of [1280, 320]) {
  test(`focus inside revoked details moves to the current access notice at ${width}px`, async ({ page }) => {
    await signIn(page); await picker(page); await choose(page, 'project');
    await expect(page.locator('.source-item')).toHaveCount(2);
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    }
    await page.getByText('View full available details', { exact: true }).first().click();
    await gate(page.request, 'arm', 'repository-denial');
    try {
      await controlProvider(page.request, { sourceDenied: true });
      const response = page.waitForResponse((value) => value.url().endsWith('/api/sources/resolve'));
      await submit(page, 'project'); await waitGate(page.request, 'repository-denial');
      await controlProvider(page.request, { sourceDenied: false });
      for (let step = 0; step < 4; step += 1) await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('link', { name: 'Open alice/project #1 on GitHub (new tab)', exact: true })).toBeFocused();
      await gate(page.request, 'release', 'repository-denial');
      expect((await response).status()).toBe(403);
      await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
      await page.screenshot({ path: `test-results/sources-removed-detail-focus-${width}.png`, fullPage: true });
      await expect(page.getByRole('alert').filter({ hasText: 'Previously loaded values were cleared.' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally { await gate(page.request, 'release'); }
  });
}

for (const status of [403, 404]) {
  test(`held URL ${status} from the picker invalidates a subsequently selected repository and its held page`, async ({ page }) => {
    await signIn(page); await picker(page);
    await gate(page.request, 'arm', 'repository-denial');
    try {
      await controlProvider(page.request, { sourceDenied: true, sourceDenialStatus: status });
      const denied = page.waitForResponse((response) => response.url().endsWith('/api/sources/resolve'));
      await submit(page, 'project'); await waitGate(page.request, 'repository-denial');
      await controlProvider(page.request, { sourceDenied: false });
      await choose(page, 'project'); await expect(page.locator('.source-item')).toHaveCount(2);
      await page.getByText('View full available details', { exact: true }).first().click();
      await gate(page.request, 'arm', 'items-page-2');
      const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/items?page=2') });
      await page.getByRole('button', { name: 'Load next page', exact: true }).focus(); await page.keyboard.press('Enter');
      await waitGate(page.request, 'items-page-2');
      if (status === 403) {
        await page.keyboard.press('Tab');
        await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
      } else {
        await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
        await expect(page.getByRole('link', { name: 'Open alice/project #1 on GitHub (new tab)', exact: true })).toBeFocused();
      }
      await gate(page.request, 'release', 'repository-denial');
      expect((await denied).status()).toBe(status);
      await expect(page.locator('.source-item')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
      expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED');
      if (status === 403) await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
      else await expect(page.getByRole('alert').filter({ hasText: 'Previously loaded values were cleared.' })).toBeFocused();
      if (status === 403) {
        await gate(page.request, 'release', 'items-page-2'); await waitGate(page.request, 'items-page-2', 'completed');
        await expect(page.locator('.source-item')).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Retry repository', exact: true }).click();
      await expect(page.locator('.source-item')).toHaveCount(2);
      if (status === 404) { await gate(page.request, 'release', 'items-page-2'); await waitGate(page.request, 'items-page-2', 'completed'); }
      await expect(page.getByText('Showing 2 of 2 loaded items.', { exact: false })).toBeVisible();
      await page.screenshot({ path: `test-results/sources-navigation-denial-${status}.png`, fullPage: true });
    } finally { await gate(page.request, 'release'); }
  });
}

test('a held denial for A preserves the selected B, its focus and pagination, and remains remembered when returning to A', async ({ page }) => {
  await signIn(page); await picker(page); await gate(page.request, 'arm', 'repository-denial');
  try {
    await controlProvider(page.request, { sourceDenied: true });
    const denied = page.waitForResponse((response) => response.url().endsWith('/api/sources/resolve'));
    await submit(page, 'project'); await waitGate(page.request, 'repository-denial');
    await controlProvider(page.request, { sourceDenied: false });
    await choose(page, 'other'); await expect(page.locator('.source-item')).toHaveCount(2);
    await page.getByText('View full available details', { exact: true }).first().click();
    await gate(page.request, 'arm', 'items-page-2');
    await page.getByRole('button', { name: 'Load next page', exact: true }).focus(); await page.keyboard.press('Enter');
    await waitGate(page.request, 'items-page-2');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
    const link = page.getByRole('link', { name: 'Open alice/other #1 on GitHub (new tab)', exact: true });
    await expect(link).toBeFocused();
    await gate(page.request, 'release', 'repository-denial'); expect((await denied).status()).toBe(403);
    await expect(page.locator('.source-item')).toHaveCount(2); await expect(link).toBeFocused();
    await gate(page.request, 'release', 'items-page-2');
    await expect(page.getByText('Showing 4 of 4 loaded items.', { exact: false })).toBeVisible(); await expect(link).toBeFocused();
    await page.getByRole('button', { name: 'Back to repositories', exact: true }).click();
    await page.request.post(`${providerOrigin}/__source-stats/reset`);
    await choose(page, 'project');
    await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
    expect(await (await page.request.get(`${providerOrigin}/__source-stats`)).text()).not.toContain('/repos/alice/project');
  } finally { await gate(page.request, 'release'); }
});

for (const releaseTiming of ['before retry', 'after new retry']) {
  test(`a held URL success cannot resurrect a denied scope ${releaseTiming} or overwrite its newer URL operation`, async ({ page }) => {
    await signIn(page); await picker(page); await choose(page, 'project'); await expect(page.locator('.source-item')).toHaveCount(2);
    await gate(page.request, 'arm', 'issue-detail');
    try {
      const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/api/sources/resolve') });
      await submit(page, 'project'); await waitGate(page.request, 'issue-detail');
      await controlProvider(page.request, { sourceDenied: true });
      await page.getByRole('button', { name: 'Load next page', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
      expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED'); await expect(page.locator('.source-item')).toHaveCount(0);
      await controlProvider(page.request, { sourceDenied: false });
      if (releaseTiming === 'before retry') {
        await gate(page.request, 'release', 'issue-detail'); await waitGate(page.request, 'issue-detail', 'completed');
        await expect(page.locator('.source-item')).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Retry repository', exact: true }).click(); await expect(page.locator('.source-item')).toHaveCount(2);
      await gate(page.request, 'arm', 'issue-detail-next');
      await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/public/outside/issues/5');
      await page.getByRole('button', { name: 'Resolve URL', exact: true }).click(); await waitGate(page.request, 'issue-detail-next');
      if (releaseTiming === 'after new retry') { await gate(page.request, 'release', 'issue-detail'); await waitGate(page.request, 'issue-detail', 'completed'); }
      await expect(page.getByText('Resolving GitHub URL…', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Resolve URL', exact: true })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.locator('.source-item')).toHaveCount(2);
      await gate(page.request, 'release', 'issue-detail-next');
      await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
      await expect(page.locator('.source-locator').filter({ hasText: 'public/outside #5' })).toHaveCount(1);
      await expect(page.locator('.source-locator').filter({ hasText: 'alice/project' })).toHaveCount(2);
    } finally { await gate(page.request, 'release'); }
  });
}
