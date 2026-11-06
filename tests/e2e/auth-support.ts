import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { SessionResponse } from '../../src/shared/session.js';

import { isSessionResponse } from '../../src/shared/session.js';
export const providerOrigin = `http://127.0.0.1:${process.env['E2E_PROVIDER_PORT'] ?? '3101'}`;
export const applicationOrigin = `http://127.0.0.1:${process.env['E2E_FRONTEND_PORT'] ?? process.env['E2E_APP_PORT'] ?? '3100'}`;

export async function controlProvider(request: APIRequestContext, settings: Record<string, unknown>): Promise<void> {
  const response = await request.post(`${providerOrigin}/__control`, { data: settings });
  expect(response.ok()).toBe(true);
}

export async function restartApplication(request: APIRequestContext, key: 'original' | 'replacement'): Promise<void> {
  const response = await request.post(`${providerOrigin}/__runner/restart`, { data: { key } });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ ready: true });
}

export async function signIn(page: Page, identity: 'Alice' | 'Bob' = 'Alice'): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
  await page.getByRole('link', { name: `Authorize ${identity}` }).click();
  await expect(page.locator('.application-nav')).toBeVisible();
  await page.goto('/boards');
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
}

export async function currentSession(request: APIRequestContext): Promise<SessionResponse> {
  const response = await request.get('/api/session');
  expect(response.ok()).toBe(true);
  const session: unknown = await response.json();
  if (!isSessionResponse(session)) throw new Error('Invalid session response');
  return session;
}
