import { expect, test } from '@playwright/test';
import { controlProvider, currentSession, providerOrigin, restartApplication, signIn } from './auth-support.js';

test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Recovery requires a configured GitHub App.');

for (const credential of ['access', 'refresh']) {
  test(`unreadable saved ${credential} credentials reconnect after a real server restart without changing identity`, async ({ page, request }) => {
    await controlProvider(request, { reset: true, expiresIn: credential === 'refresh' ? 2 : 28800 });
    await restartApplication(request, 'original');
    try {
      await signIn(page);
      const original = await currentSession(page.request);
      if (original.status !== 'signed-in') throw new Error('Expected original session');
      expect(original.authorization).toBe('ready');
      if (credential === 'refresh') {
        // Wait on the controlled provider's actual token-expiry boundary, not a fixed test sleep.
        await expect.poll(async () => {
          const stats: unknown = await (await request.get(`${providerOrigin}/__stats`)).json();
          return stats;
        }).toMatchObject({ expiredAccessCount: 1, refreshCount: 0 });
      }
      await restartApplication(request, 'replacement');
      const unreadable = await currentSession(page.request);
      expect(unreadable.status === 'signed-in' && unreadable.authorization).toBe('reauthorize');
      if (unreadable.status !== 'signed-in') throw new Error('Expected retained application session');
      expect(unreadable.user.id).toBe(original.user.id);
      expect(unreadable.user.githubId).toBe(original.user.githubId);
      expect(JSON.stringify(unreadable)).not.toMatch(/controlled-access|controlled-refresh|Unsupported state|authenticate data/);
      await page.reload();
      await page.getByRole('link', { name: 'Reconnect GitHub' }).click();
      await page.getByRole('link', { name: 'Authorize Alice' }).click();
      await page.goto('/boards');
      await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
      const reconnected = await currentSession(page.request);
      expect(reconnected.status === 'signed-in' && reconnected.authorization).toBe('ready');
      if (reconnected.status !== 'signed-in') throw new Error('Expected reconnected session');
      expect(reconnected.user.id).toBe(original.user.id);
      expect(reconnected.user.githubId).toBe(original.user.githubId);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
    } finally {
      await restartApplication(request, 'original');
    }
  });
}
