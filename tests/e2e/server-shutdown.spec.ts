import { Agent, get } from 'node:http';
import { expect, test } from '@playwright/test';
import { applicationOrigin, controlProvider, currentSession, providerOrigin, signIn } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');

test('restart drains an active response without waiting for its keep-alive connection', async ({ page, request }) => {
  await controlProvider(request, { reset: true });
  await signIn(page);
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  const cookie = (await page.context().cookies(applicationOrigin)).map(({ name, value }) => `${name}=${value}`).join('; ');
  await page.close();
  const agent = new Agent({ keepAlive: true });
  const gate = `${providerOrigin}/__source-gate`;
  expect((await request.post(gate, { data: { action: 'arm', target: 'repositories-page-2' } })).ok()).toBe(true);
  const response = new Promise<number | undefined>((resolve, reject) => {
    get(`${applicationOrigin}/api/sources/installations/9007199254740993/repositories?page=2`, { agent, headers: { cookie, 'X-CSRF-Token': session.csrfToken } }, (incoming) => {
      incoming.resume();
      incoming.once('end', () => resolve(incoming.statusCode));
      incoming.once('error', reject);
    }).once('error', reject);
  });
  const completedResponse = response.catch((error: unknown) => error);
  let restart: Promise<boolean> | undefined;
  try {
    await expect.poll(async () => {
      const state: unknown = await (await request.get(gate)).json();
      return state;
    }).toMatchObject({ entered: true });
    restart = request.post(`${providerOrigin}/__runner/restart`, { data: { key: 'original' }, timeout: 5000 }).then((result) => result.ok(), () => false);
    // A new connection is refused once shutdown starts, while the held request is still active.
    await expect.poll(async () => {
      try { await fetch(`${applicationOrigin}/api/health`, { headers: { Connection: 'close' } }); return false; }
      catch { return true; }
    }).toBe(true);
    expect((await request.post(gate, { data: { action: 'release', target: 'repositories-page-2' } })).ok()).toBe(true);
    expect(await completedResponse).toBe(200);
    expect(await restart, 'Restart should finish while the client keeps its connection pool open').toBe(true);
    expect((await request.get(`${applicationOrigin}/api/health`)).ok()).toBe(true);
  } finally {
    await request.post(gate, { data: { action: 'reset' } });
    agent.destroy();
    await completedResponse;
    await restart;
  }
});
