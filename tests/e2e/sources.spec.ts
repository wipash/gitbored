import { expect, test } from '@playwright/test';
import { readSourceItem, readSourcePage } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, restartApplication, signIn } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Configured source authorization is required.');
test.beforeEach(async ({ request }) => {
  await controlProvider(request, { reset: true });
  expect((await request.post(`${providerOrigin}/__source-stats/reset`)).ok()).toBe(true);
});

test('mixed pages retain PR-only progress, partial retry and loaded-subset filters', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByRole('button', { name: /example-org · Organization/ })).toBeVisible();
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Browse alice/other · Private', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  await expect(page.getByText('Showing 2 of 2 loaded items.', { exact: false })).toBeVisible();
  await page.getByLabel('Kind in loaded results').selectOption('issue');
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByText('Showing 1 of 4 loaded items.', { exact: false })).toBeVisible();
  await controlProvider(page.request, { sourceFailurePage: 3 });
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry page 3' })).toBeVisible();
  await expect(page.getByText('Showing 1 of 4 loaded items.', { exact: false })).toBeVisible();
  await controlProvider(page.request, { sourceFailurePage: 0 });
  await page.getByRole('button', { name: 'Retry page 3' }).click();
  await expect(page.getByText('All pages loaded (3).')).toBeVisible();
  await expect(page.getByText('Showing 2 of 5 loaded items.', { exact: false })).toBeVisible();
  await page.getByLabel('Filter loaded titles or numbers').fill('no matching title');
  await expect(page.getByText('No loaded items match.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.source-item')).toHaveCount(5);
  await expect(page.getByText('Pull request · State unknown', { exact: false })).toHaveCount(3);
  await page.getByText('View full available details', { exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 4 })).toContainText('Long complete title');
  await expect(page.getByText('Label 8 extended', { exact: false }).first()).toBeVisible();
  const providerReads = await (await page.request.get(`${providerOrigin}/__source-stats`)).text();
  for (const forbidden of ['/pulls/', '/comments', '/body']) expect(providerReads).not.toContain(forbidden);
});

test('lossless identities, current-user reference access and authorized URL reads survive restart', async ({ page, browser }) => {
  await signIn(page);
  const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('Expected session');
  const headers = { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
  const first = await page.request.get('/api/sources/repositories/alice/project/items?page=1');
  expect(first.status()).toBe(200);
  const listed = readSourcePage(await first.json(), readSourceItem);
  expect(listed.items[0]?.reference.repositoryRestId).toBe('9007199254740993');
  expect(listed.items[0]?.reference.issueRestId).toBe('9007199254741002');
  expect(listed.items[1]?.metadata.state).toBe('unknown');
  const referenceId = listed.items[0]?.reference.id; expect(referenceId).toBeTruthy();
  const otherRepo = await page.request.get('/api/sources/repositories/alice/other/items?page=1');
  const otherItems = readSourcePage(await otherRepo.json(), readSourceItem);
  expect(otherItems.items[0]?.reference.id).not.toBe(referenceId);
  const pull = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/alice/project/pull/2' } });
  expect(pull.status()).toBe(200);
  const enriched = readSourceItem(await pull.json());
  expect(enriched.reference.issueRestId).toBe('9007199254741003');
  expect(enriched.reference.pullRequestRestId).toBe('9007199254741999');
  expect(enriched.metadata.state).toBe('merged');
  expect(enriched.reference.id).toBe(listed.items[1]?.reference.id);
  await controlProvider(page.request, { pullUnavailable: true });
  const unknown = await page.request.get(`/api/references/${enriched.reference.id}`);
  expect(unknown.status()).toBe(200);
  expect(readSourceItem(await unknown.json()).metadata.state).toBe('unknown');
  expect(readSourceItem(await unknown.json()).reference.pullRequestRestId).toBe('9007199254741999');
  await restartApplication(page.request, 'original');
  const persisted = await page.request.get(`/api/references/${referenceId ?? ''}`);
  expect(persisted.status()).toBe(200);
  expect(readSourceItem(await persisted.json()).reference.id).toBe(referenceId);
  const bobContext = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bob = await bobContext.newPage(); await signIn(bob, 'Bob');
    expect((await bob.request.get(`/api/references/${referenceId ?? ''}`)).status()).toBe(404);
    expect((await bob.request.get('/api/sources/repositories/alice/project/items?page=1')).status()).toBe(404);
    const bobSession = await currentSession(bob.request); if (bobSession.status !== 'signed-in') throw new Error('Expected Bob');
    const publicResult = await bob.request.post('/api/sources/resolve', { headers: { origin: applicationOrigin, 'x-csrf-token': bobSession.csrfToken }, data: { url: 'https://github.com/public/outside/issues/1' } });
    expect(publicResult.status()).toBe(200);
    expect(readSourceItem(await publicResult.json()).metadata.locator.owner).toBe('public');
    await expect(bob.getByRole('button', { name: /bob · Personal/ })).toBeVisible();
    await expect(bob.getByText('alice private issue', { exact: false })).toHaveCount(0);
  } finally { await bobContext.close(); }
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain('private issue');
});

test('invalid URLs, cursors, payloads and pagination links never become arbitrary provider requests', async ({ page, request }) => {
  expect((await request.get('/api/sources/installations')).status()).toBe(401);
  await signIn(page);
  const session = await currentSession(page.request); if (session.status !== 'signed-in') throw new Error('Expected session');
  const headers = { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
  expect((await page.request.post('/api/sources/resolve', { data: { url: 'https://github.com/alice/project/issues/1' } })).status()).toBe(403);
  await expect(page.getByRole('button', { name: /alice · Personal/ })).toBeVisible();
  await request.post(`${providerOrigin}/__source-stats/reset`);
  for (const url of ['http://github.com/alice/project/issues/1', 'https://evil.example/alice/project/issues/1', 'https://github.com@evil.example/a/b/pull/2', 'https://github.com/a/b/issues/1?x=1', 'https://github.com/a/b/issues/1#body', 'https://github.com/a/%2e%2e/issues/1', 'https://github.com/a/b/issues/9007199254740993', 'https://github.com/a/b/../../a/b/issues/1']) {
    expect((await page.request.post('/api/sources/resolve', { headers, data: { url } })).status()).toBe(400);
  }
  for (const pageValue of ['0', '-1', '1.5', '10001', 'NaN', '1&page=2']) expect((await page.request.get(`/api/sources/installations?page=${pageValue}`)).status()).toBe(400);
  expect(await (await request.get(`${providerOrigin}/__source-stats`)).json()).toEqual({ requests: [] });
  await controlProvider(request, { sourceMode: 'malformed' });
  expect((await page.request.get('/api/sources/installations')).status()).toBe(502);
  expect((await page.request.get('/api/sources/repositories/alice/project/items')).status()).toBe(502);
  await controlProvider(request, { sourceMode: 'untrusted-link' });
  expect((await page.request.get('/api/sources/repositories/alice/project/items')).status()).toBe(502);
  await controlProvider(request, { sourceMode: 'normal' });
  const missing = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/missing/project/issues/1' } });
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('organization approval');
});

test('source controls and complete values remain reachable in both themes, keyboard and narrow enlarged text', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByText('View full available details', { exact: true }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 4 })).toBeVisible();
    await expect(page.getByText('Label 8 extended', { exact: false }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await page.screenshot({ path: `test-results/sources-${theme}-desktop.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/public/outside/issues/1');
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Item resolved. No canvas placement was created.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/sources-dark-320-enlarged.png', fullPage: true });
});

test('loading, empty and malformed pages recover; detected access loss clears loaded private values', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: /alice · Personal/ })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await controlProvider(page.request, { sourceMode: 'empty', sourceDelayMs: 800 });
    await page.getByRole('button', { name: 'Reload installations' }).click();
    await expect(page.getByText('Loading page 1…', { exact: true })).toBeVisible();
    await expect(page.getByText('No installations are available.', { exact: false })).toBeVisible();
    await page.screenshot({ path: `test-results/sources-${theme}-empty.png`, fullPage: true });
    await controlProvider(page.request, { sourceMode: 'malformed', sourceDelayMs: 0 });
    await page.getByRole('button', { name: 'Reload installations' }).click();
    await expect(page.getByRole('button', { name: 'Retry page 1', exact: true })).toBeVisible();
    await expect(page.getByText('GitHub returned incomplete or invalid data.', { exact: false })).toBeVisible();
    await page.screenshot({ path: `test-results/sources-${theme}-error.png`, fullPage: true });
  }
  await controlProvider(page.request, { sourceMode: 'normal' });
  await page.getByRole('button', { name: 'Retry page 1', exact: true }).click();
  await page.getByRole('button', { name: /alice · Personal/ }).click();
  await expect(page.getByRole('button', { name: 'Browse alice/project · Private', exact: true })).toBeVisible();
  await controlProvider(page.request, { sourceMode: 'empty' });
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  await expect(page.getByText('No issues or pull requests were returned.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back to repositories' }).click();
  await controlProvider(page.request, { sourceMode: 'normal' });
  await page.getByRole('button', { name: 'Browse alice/project · Private', exact: true }).click();
  await expect(page.locator('.source-item')).toHaveCount(2);
  await controlProvider(page.request, { sourceDenied: true });
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByText('Previously loaded values were cleared.', { exact: false })).toBeVisible();
  await expect(page.locator('.source-item')).toHaveCount(0);
  await controlProvider(page.request, { sourceDenied: false });
  await page.getByRole('button', { name: 'Retry page 1', exact: true }).click();
  await expect(page.locator('.source-item')).toHaveCount(2);
  await page.getByLabel('GitHub item URL', { exact: true }).fill('https://github.com/alice/project/issues/1');
  await page.getByRole('button', { name: 'Resolve URL', exact: true }).click();
  await expect(page.locator('.source-item')).toHaveCount(3);
  await controlProvider(page.request, { revoke: true });
  await page.getByRole('button', { name: 'Load next page', exact: true }).click();
  await expect(page.getByText('Loaded source values were cleared.', { exact: false })).toBeVisible();
  await expect(page.locator('.source-item')).toHaveCount(0);
  await page.getByRole('link', { name: 'Reconnect GitHub', exact: true }).click();
  await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  await expect(page.getByRole('button', { name: /alice · Personal/ })).toBeVisible();
});
