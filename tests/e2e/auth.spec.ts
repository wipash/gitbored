import { expect, test } from '@playwright/test';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn, openSettings, selectTheme } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'This suite exercises configured authentication.');

test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

test('initial heading focus announces the page without a selection-like border', async ({ page }, testInfo) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'GitBored', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toHaveCSS('outline-style', 'none');
  await page.screenshot({ path: testInfo.outputPath('initial-heading-focus.png') });
  await page.keyboard.press('Tab');
  const signInLink = page.getByRole('link', { name: 'Sign in with GitHub', exact: true });
  await expect(signInLink).toBeFocused();
  await expect(signInLink).toHaveCSS('outline-style', 'solid');
});

test('two identities remain distinct and a renamed GitHub login retains the application identity', async ({ page, browser }) => {
  await signIn(page);
  const alice = await currentSession(page.request);
  expect(alice.status).toBe('signed-in');
  if (alice.status !== 'signed-in') throw new Error('Expected Alice session');
  expect(alice.user.githubId).toBe('101');
  expect(alice.user.login).toBe('alice');
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === 'gitbored-session');
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false });
  expect(await page.evaluate(() => document.cookie)).not.toContain('gitbored-session');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(alice.user.id);
  expect(JSON.stringify(alice)).not.toMatch(/controlled-access|controlled-refresh|access_token|refresh_token/);
  const other = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const bobPage = await other.newPage();
    await signIn(bobPage, 'Bob');
    const bob = await currentSession(other.request);
    if (bob.status !== 'signed-in') throw new Error('Expected Bob session');
    expect(bob.user.githubId).toBe('202');
    expect(bob.user.id).not.toBe(alice.user.id);
    expect(bob.csrfToken).not.toBe(alice.csrfToken);
    await openSettings(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
    expect((await currentSession(other.request)).status).toBe('signed-in');
    const replay = await page.request.get('/api/session', { headers: { cookie: `gitbored-session=${sessionCookie?.value ?? ''}` } });
    expect(await replay.json()).toEqual({ status: 'signed-out', reason: 'expired' });
    await controlProvider(page.request, { login: 'alice-renamed' });
    await signIn(page);
    const renamed = await currentSession(page.request);
    if (renamed.status !== 'signed-in') throw new Error('Expected renamed session');
    expect(renamed.user.id).toBe(alice.user.id);
    expect(renamed.user.login).toBe('alice-renamed');
    expect(renamed.csrfToken).not.toBe(alice.csrfToken);
    await openSettings(page);
    await expect(page.locator('.application-account')).toHaveText('Account: @alice-renamed');
  } finally { await other.close(); }
});

test('unsafe requests require a session, exact same origin and the current CSRF token', async ({ page, request }) => {
  expect((await request.post('/api/auth/logout')).status()).toBe(401);
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected session');
  const wrongRequests = [ {}, { origin: applicationOrigin }, { origin: 'https://evil.example', 'x-csrf-token': session.csrfToken },
    { origin: applicationOrigin, 'x-csrf-token': 'wrong' }, { 'x-csrf-token': session.csrfToken } ];
  for (const headers of wrongRequests) {
    expect((await page.request.post('/api/auth/logout', { headers })).status()).toBe(403);
  }
  expect((await currentSession(page.request)).status).toBe('signed-in');
  const response = await page.request.post('/api/auth/logout', { headers: { origin: applicationOrigin, 'x-csrf-token': session.csrfToken } });
  expect(response.status()).toBe(204);
  expect((await currentSession(page.request)).status).toBe('signed-out');
});

test('encoded API routes retain the same CSRF and private-response policy as their matched routes', async ({ page, request }) => {
  expect((await request.post('/%61pi/auth/logout')).status()).toBe(401);
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected session');
  const encodedSession = await page.request.get('/%61pi/session');
  expect(encodedSession.headers()['cache-control']).toBe('no-store');
  expect(encodedSession.headers()['referrer-policy']).toBe('no-referrer');
  const wrongRequests = [{}, { origin: applicationOrigin }, { 'x-csrf-token': session.csrfToken },
    { origin: 'https://evil.example', 'x-csrf-token': session.csrfToken },
    { origin: applicationOrigin, 'x-csrf-token': 'wrong' }];
  for (const path of ['/%61pi/auth/logout', '/api/%61uth/logout']) {
    for (const headers of wrongRequests) {
      const rejected = await page.request.post(path, { headers });
      expect(rejected.status()).toBe(403);
      expect(rejected.headers()['cache-control']).toBe('no-store');
      expect(rejected.headers()['referrer-policy']).toBe('no-referrer');
    }
  }
  expect((await currentSession(page.request)).status).toBe('signed-in');
  const accepted = await page.request.post('/%61pi/auth/logout', {
    headers: { origin: applicationOrigin, 'x-csrf-token': session.csrfToken },
  });
  expect(accepted.status()).toBe(204);
  expect((await currentSession(page.request)).status).toBe('signed-out');
});

test('invalid, browser-unbound and replayed state cannot exchange a code', async ({ request, browser }) => {
  const start = await request.get('/api/auth/github', { maxRedirects: 0 });
  const authorize = new URL(start.headers()['location'] ?? '');
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(authorize.searchParams.has('code_verifier')).toBe(false);
  const invalid = await request.get('/api/auth/callback?state=wrong&code=wrong', { maxRedirects: 0 });
  expect(invalid.headers()['location']).toBe('/?authError=state');
  const unbound = await browser.newContext({ baseURL: applicationOrigin });
  try {
    const mismatch = await unbound.request.get(`/api/auth/callback?state=${authorize.searchParams.get('state') ?? ''}&code=wrong`, { maxRedirects: 0 });
    expect(mismatch.headers()['location']).toBe('/?authError=state');
  } finally { await unbound.close(); }
  const fresh = await request.get('/api/auth/github', { maxRedirects: 0 });
  const consent = new URL(fresh.headers()['location'] ?? ''); consent.searchParams.set('identity', '101');
  const approved = await request.get(consent.href, { maxRedirects: 0 });
  const callback = approved.headers()['location'] ?? '';
  const completed = await request.get(callback, { maxRedirects: 0 });
  expect(completed.headers()['location']).toBe('/');
  const replayed = await request.get(callback, { maxRedirects: 0 });
  expect(replayed.headers()['location']).toBe('/?authError=state');
  const stats = await request.get(`${providerOrigin}/__stats`);
  expect(await stats.json()).toMatchObject({ exchangeCount: 1 });
});

test('expired access tokens refresh once across concurrent requests and revocation requires reauthorization', async ({ page }) => {
  await controlProvider(page.request, { expiresIn: 1 });
  await signIn(page);
  await expect.poll(async () => {
    await Promise.all([currentSession(page.request), currentSession(page.request), currentSession(page.request)]);
    const stats: unknown = await (await page.request.get(`${providerOrigin}/__stats`)).json();
    return stats;
  }).toMatchObject({ refreshCount: 1 });
  await controlProvider(page.request, { revoke: true });
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('link', { name: 'Reconnect GitHub' })).toBeVisible();
  const revoked = await currentSession(page.request);
  expect(revoked.status === 'signed-in' && revoked.authorization).toBe('reauthorize');
  await openSettings(page);
  await page.getByRole('link', { name: 'Reconnect GitHub' }).click();
  await page.getByRole('link', { name: 'Authorize Alice' }).click();
  await page.goto('/boards');
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('refresh rejection and refresh expiry are actionable without substituting authority', async ({ page }) => {
  await controlProvider(page.request, { expiresIn: 1, refreshExpiresIn: 1 });
  await signIn(page);
  await expect.poll(async () => {
    const session = await currentSession(page.request);
    return session.status === 'signed-in' ? session.authorization : session.status;
  }).toBe('reauthorize');
  const stats = await page.request.get(`${providerOrigin}/__stats`);
  expect(await stats.json()).toMatchObject({ refreshCount: 0 });
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('link', { name: 'Reconnect GitHub' })).toBeVisible();
  await openSettings(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
  await controlProvider(page.request, { expiresIn: 1, refreshExpiresIn: 28800 });
  await signIn(page);
  await controlProvider(page.request, { revokeRefresh: true });
  await expect.poll(async () => {
    const session = await currentSession(page.request);
    return session.status === 'signed-in' ? session.authorization : session.status;
  }).toBe('reauthorize');
  const response = await page.request.get('/api/session');
  expect(await response.text()).not.toContain('SENSITIVE_PROVIDER_PAYLOAD');
});

test('provider failure and consent denial offer recovery without leaking provider details', async ({ page }) => {
  await controlProvider(page.request, { fail: true });
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
  await page.getByRole('link', { name: 'Authorize Alice' }).click();
  await expect(page.getByRole('alert')).toContainText('Try again');
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
  expect(await page.content()).not.toContain('SENSITIVE_PROVIDER_PAYLOAD');
  await controlProvider(page.request, { fail: false, deny: true });
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
  await page.getByRole('link', { name: 'Authorize Alice' }).click();
  await expect(page.getByRole('alert')).toContainText('not completed');
  await controlProvider(page.request, { deny: false });
  await signIn(page);
  await controlProvider(page.request, { fail: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await controlProvider(page.request, { fail: false });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.goto('/boards');
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await controlProvider(page.request, { rateLimit: true });
  const limited = await page.request.get('/api/session');
  expect(limited.status()).toBe(502);
  expect(await limited.text()).not.toContain('SENSITIVE_PROVIDER_PAYLOAD');
  await controlProvider(page.request, { rateLimit: false });
  const recovered = await currentSession(page.request);
  expect(recovered.status === 'signed-in' && recovered.authorization).toBe('ready');
});

test('an expired server session rejects a replay even when its cookie is retained', async ({ page }) => {
  test.skip(Number(process.env['CONTROLLED_SESSION_SECONDS'] ?? '10') > 10, 'Run default short-session mode to exercise expiry.');
  await signIn(page);
  const cookie = (await page.context().cookies()).find((value) => value.name === 'gitbored-session');
  expect(cookie).toBeDefined();
  await expect.poll(async () => {
    const response = await page.request.get('/api/session', { headers: { cookie: `gitbored-session=${cookie?.value ?? ''}` } });
    const session: unknown = await response.json();
    return session;
  }, { timeout: 15_000 }).toEqual({ status: 'signed-out', reason: 'expired' });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('sign-in and signed-in flows remain reachable in both themes at 320px and enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await signIn(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openSettings(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
});
