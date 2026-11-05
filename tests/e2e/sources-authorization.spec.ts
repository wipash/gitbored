import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn } from './auth-support.js';

async function gate(request: APIRequestContext, action: 'arm' | 'release' | 'reset', target?: string): Promise<void> {
  expect((await request.post(`${providerOrigin}/__source-gate`, { data: { action, target } })).ok()).toBe(true);
}
async function gateEntered(request: APIRequestContext): Promise<void> {
  await expect.poll(async () => {
    const value: unknown = await (await request.get(`${providerOrigin}/__source-gate`)).json();
    return typeof value === 'object' && value !== null && 'entered' in value && value.entered === true;
  }).toBe(true);
}
async function headersFor(request: APIRequestContext): Promise<Record<string, string>> {
  const session = await currentSession(request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in request context');
  return { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
}
async function browseProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  await expect(page.locator('.source-item')).toHaveCount(2);
}
async function authorizeBob(page: Page): Promise<void> {
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: 'Authorize Bob', exact: true }).click();
  await expect(page.getByText('@bob', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /bob · Personal/ })).toBeVisible();
}

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Configured source authorization is required.');
test.beforeEach(async ({ request }) => {
  await controlProvider(request, { reset: true });
  await gate(request, 'reset');
});

test('same-context account changes reject stale repository continuation and URL submission before provider reads', async ({ page, context }) => {
  await signIn(page);
  const aliceHeaders = await headersFor(page.request);
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await expect(page.getByRole('button', { name: 'Browse alice/project · Private', exact: true })).toBeVisible();
  const staleUrl = await context.newPage();
  await staleUrl.goto('/');
  await staleUrl.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/alice/project/issues/1');
  await staleUrl.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  await expect(staleUrl.locator('.source-item')).toHaveCount(1);
  const bob = await context.newPage();
  await authorizeBob(bob);
  await context.request.post(`${providerOrigin}/__source-stats/reset`);
  const staleGet = page.waitForResponse((response) => response.url().includes('/repositories?page=2'));
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  const getResponse = await staleGet;
  expect(getResponse.status()).toBe(409);
  expect(await getResponse.json()).toMatchObject({ error: 'session_changed' });
  await expect(page.getByRole('link', { name: 'Reload current account', exact: true })).toBeVisible();
  const source = page.getByRole('region', { name: 'Browse GitHub sources', exact: true });
  await expect(source).not.toContainText('alice/project');
  await expect(source).not.toContainText('bob/other');
  const stalePost = staleUrl.waitForResponse((response) => response.url().endsWith('/api/sources/resolve'));
  await staleUrl.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  const postResponse = await stalePost;
  expect(postResponse.status()).toBe(403);
  expect(await postResponse.json()).toMatchObject({ error: 'csrf' });
  await expect(staleUrl.locator('.source-item')).toHaveCount(0);
  await expect(staleUrl.getByRole('link', { name: 'Reload current account', exact: true })).toBeVisible();
  expect(await (await context.request.get(`${providerOrigin}/__source-stats`)).json()).toEqual({ requests: [] });
  expect((await context.request.get('/api/sources/installations', { headers: aliceHeaders })).status()).toBe(409);
  await page.getByRole('link', { name: 'Reload current account', exact: true }).click();
  await expect(page.getByText('@bob', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /bob · Personal/ })).toBeVisible();
});

test('an original session invalidated during a held read cannot deliver its late representation', async ({ page, context }) => {
  await signIn(page);
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await expect(page.getByRole('button', { name: 'Browse alice/project · Private', exact: true })).toBeVisible();
  await gate(page.request, 'arm', 'repositories-page-2');
  try {
    const late = page.waitForResponse((response) => response.url().includes('/repositories?page=2'));
    await page.getByRole('button', { name: 'Load next page', exact: true }).click();
    await gateEntered(page.request);
    const bob = await context.newPage(); await authorizeBob(bob);
    await gate(page.request, 'release');
    expect((await late).status()).toBe(401);
    await expect(page.getByRole('link', { name: 'Reload current account', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Browse GitHub sources', exact: true })).not.toContainText('alice/project');
  } finally { await gate(page.request, 'release'); }
});

for (const status of [403, 404]) {
  test(`same-repository URL ${status} clears expanded private values and aborts held pagination without revoking unrelated repositories`, async ({ page }) => {
    await signIn(page); await browseProject(page);
    await page.getByText('View full available details', { exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 4 })).toBeVisible();
    await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/missing/project/issues/1');
    await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
    await expect(page.locator('#source-url-error')).toContainText('unavailable');
    await expect(page.locator('.source-item')).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 4 })).toBeVisible();
    await gate(page.request, 'arm', 'items-page-2');
    try {
      const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/items?page=2') });
      await page.getByRole('button', { name: 'Load next page', exact: true }).click();
      await gateEntered(page.request);
      await controlProvider(page.request, { sourceDenied: true, sourceDenialStatus: status });
      await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/alice/project/issues/1');
      const denied = page.waitForResponse((response) => response.url().endsWith('/api/sources/resolve'));
      await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
      expect((await denied).status()).toBe(status);
      await expect(page.locator('.source-item')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 4 })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
      expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED');
      await gate(page.request, 'release');
      await controlProvider(page.request, { sourceDenied: false });
      await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/missing/project/issues/1');
      const unrelated = page.waitForResponse((response) => response.url().endsWith('/api/sources/resolve'));
      await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
      expect((await unrelated).status()).toBe(404);
      await expect(page.getByRole('button', { name: 'Resolve URL', exact: true })).toHaveAttribute('aria-disabled', 'false');
      await expect(page.getByRole('button', { name: 'Retry repository', exact: true })).toBeVisible();
      await expect(page.locator('.source-item')).toHaveCount(0);
      await page.getByRole('button', { name: 'Retry repository', exact: true }).click();
      await expect(page.locator('.source-item')).toHaveCount(2);
      await expect(page.getByText('Showing 2 of 2 loaded items.', { exact: false })).toBeVisible();
    } finally { await gate(page.request, 'release'); }
  });
}

test('secondary throttling with Retry-After retains the loaded cursor and current authorization', async ({ page }) => {
  await signIn(page); await browseProject(page);
  const headers = await headersFor(page.request);
  await controlProvider(page.request, { sourceThrottlePage: 2 });
  const limited = page.waitForResponse((response) => response.url().includes('/items?page=2'));
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  expect((await limited).status()).toBe(429);
  expect(await (await limited).json()).toMatchObject({ error: 'rate_limit' });
  await expect(page.locator('.source-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Retry page 2', exact: true })).toBeVisible();
  const session = await currentSession(page.request);
  expect(session).toMatchObject({ status: 'signed-in', authorization: 'ready' });
  expect((await page.request.get('/api/sources/installations', { headers })).status()).toBe(200);
  await controlProvider(page.request, { sourceThrottlePage: 0 });
  await page.getByRole('button', { name: 'Retry page 2', exact: true }).click();
  await expect(page.getByText('Showing 4 of 4 loaded items.', { exact: false })).toBeVisible();
});

test('a late rejected token cannot invalidate a newer refreshed credential', async ({ page }) => {
  await controlProvider(page.request, { expiresIn: 2 });
  await signIn(page);
  const headers = await headersFor(page.request);
  await gate(page.request, 'arm', 'old-token-401');
  try {
    const stale = page.request.get('/api/sources/repositories/alice/project/items?page=2', { headers });
    await gateEntered(page.request);
    await controlProvider(page.request, { expiresIn: 28800 });
    await expect.poll(async () => {
      await currentSession(page.request);
      const stats: unknown = await (await page.request.get(`${providerOrigin}/__stats`)).json();
      return typeof stats === 'object' && stats !== null && 'refreshCount' in stats ? stats.refreshCount : 0;
    }).toBe(1);
    await gate(page.request, 'release');
    expect((await stale).status()).toBe(401);
    expect(await currentSession(page.request)).toMatchObject({ status: 'signed-in', authorization: 'ready' });
    expect((await page.request.get('/api/sources/repositories/alice/project/items?page=1', { headers })).status()).toBe(200);
    expect(await (await page.request.get(`${providerOrigin}/__stats`)).json()).toMatchObject({ exchangeCount: 1, refreshCount: 1 });
  } finally { await gate(page.request, 'release'); }
});

for (const width of [1280, 320]) {
  test(`keyboard pagination, retry and URL submission retain focus without stealing it at ${width}px`, async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('button', { name: 'Load next page', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'All pages loaded', exact: true })).toBeFocused();
    await page.getByRole('button', { name: /alice · Personal/ }).click();
    await gate(page.request, 'arm', 'repositories-page-2');
    try {
      const load = page.getByRole('button', { name: 'Load next page', exact: true });
      await load.focus(); await page.keyboard.press('Enter'); await gateEntered(page.request);
      await expect(load).toBeFocused(); await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
      await gate(page.request, 'release');
      await expect(page.getByRole('button', { name: 'All pages loaded', exact: true })).toBeVisible();
      await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
    } finally { await gate(page.request, 'release'); }
    await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
    await expect(page.locator('.source-item')).toHaveCount(2);
    await controlProvider(page.request, { sourceFailurePage: 2 });
    await page.getByRole('button', { name: 'Load next page', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Retry page 2', exact: true })).toBeFocused();
    await controlProvider(page.request, { sourceFailurePage: 0 });
    await page.keyboard.press('Enter');
    await expect(page.getByText('Showing 4 of 4 loaded items.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load next page', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'All pages loaded', exact: true })).toBeFocused();
    await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/public/outside/issues/1?invalid=1');
    await page.getByRole('button', { name: 'Resolve URL', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#source-url-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve URL', exact: true })).toBeFocused();
    await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/public/outside/issues/1');
    await page.getByRole('button', { name: 'Resolve URL', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve URL', exact: true })).toBeFocused();
    await gate(page.request, 'arm', 'issue-detail');
    try {
      await page.keyboard.press('Enter'); await gateEntered(page.request);
      await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab');
      await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
      await gate(page.request, 'release');
      await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
      await expect(page.getByLabel('GitHub item URL', { exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/sources-corrected-keyboard-${width}.png`, fullPage: true });
    } finally { await gate(page.request, 'release'); }
  });
}
