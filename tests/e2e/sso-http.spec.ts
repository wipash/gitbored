import { expect, test } from '@playwright/test';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

test('SSO denials stay distinct across GitHub reads, identify known owners and invalidate private caches', async ({ page }) => {
  await page.goto('/api/auth/github');
  await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected signed-in session');
  const headers = { origin: applicationOrigin, 'x-csrf-token': session.csrfToken };
  const issueResponse = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/alice/project/issues/1' } });
  expect(issueResponse.ok()).toBe(true);
  const issue = readSourceItem(await issueResponse.json());
  const pullResponse = await page.request.post('/api/sources/resolve', { headers, data: { url: 'https://github.com/alice/project/pull/2' } });
  expect(pullResponse.ok()).toBe(true);
  const pull = readSourceItem(await pullResponse.json());
  const reference = `/api/references/${issue.reference.id}`;
  const pageUrl = '/api/sources/repositories/alice/project/items?page=1';
  const cases = [
    { path: '/user/installations/9007199254740993/repositories', api: '/api/sources/installations/9007199254740993/repositories', knownOwner: false },
    { path: '/repos/alice/project', api: `${pageUrl}&refresh=1`, knownOwner: true },
    { path: '/repos/alice/project/issues/1', api: `${reference}?refresh=1`, knownOwner: true },
    { path: '/repos/alice/project/pulls/2', api: `/api/references/${pull.reference.id}?refresh=1`, knownOwner: true },
    { path: '/graphql', api: `${reference}/context?refresh=1`, knownOwner: true },
  ];
  for (const scenario of cases) {
    await controlProvider(page.request, { sourceSsoRequired: false });
    for (const url of [pageUrl, reference, `${reference}/context`]) expect((await page.request.get(url, { headers })).ok()).toBe(true);
    await controlProvider(page.request, { sourceSsoRequired: true, sourceSsoPath: scenario.path });
    const denied = await page.request.get(scenario.api, { headers });
    expect(denied.status(), scenario.path).toBe(403);
    const body: unknown = await denied.json();
    expect(body).toMatchObject({ error: 'sso_required' });
    if (scenario.knownOwner) expect(body).toMatchObject({ ssoOrganization: 'alice' });
    else expect(body).not.toHaveProperty('ssoOrganization');
    expect(await denied.text()).not.toContain('example.invalid');
    expect(await denied.text()).not.toContain('private-sso-token');
    expect(await denied.text()).not.toContain('Controlled private');
    await controlProvider(page.request, { sourceSsoPath: '' });
    // A denial must invalidate every cached representation, including the context.
    for (const url of [pageUrl, reference, `${reference}/context`]) {
      const response = await page.request.get(url, { headers });
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({ error: 'sso_required' });
    }
  }
  await controlProvider(page.request, { sourceSsoRequired: false, sourceDenied: true });
  const generic = await page.request.get(`${reference}?refresh=1`, { headers });
  expect(generic.status()).toBe(403);
  expect(await generic.json()).toMatchObject({ error: 'missing_access' });
  expect(await generic.json()).not.toHaveProperty('ssoOrganization');
  expect(await currentSession(page.request)).toMatchObject({ status: 'signed-in', authorization: 'ready' });
  await controlProvider(page.request, { sourceDenied: false });
  expect((await page.request.get(reference, { headers })).ok()).toBe(true);
});
