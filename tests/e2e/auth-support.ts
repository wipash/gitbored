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
  await expect(page.locator('.desktop-app')).toBeVisible();
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

/** Open the same settings surface on a canvas, board list or sign-in screen. */
export async function openSettings(page: Page): Promise<void> {
  if (await page.getByRole('region', { name: 'Settings', exact: true }).isVisible()) return;
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  if (!await trigger.isVisible()) await openWorkspaceMenu(page);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
}

/** Change appearance through the UI and return to an open workspace panel. */
export async function selectTheme(page: Page, theme: string): Promise<void> {
  const settingsWereOpen = await page.getByRole('region', { name: 'Settings', exact: true }).isVisible();
  const incomingWasOpen = await page.locator('#incoming-panel').isVisible();
  const repositoriesWereOpen = await page.getByRole('region', { name: 'Board repository connection', exact: true }).isVisible();
  await openSettings(page);
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  if (!settingsWereOpen) {
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    if (incomingWasOpen || repositoriesWereOpen) await openWorkspaceMenu(page);
    if (incomingWasOpen) await page.getByRole('button', { name: /^Incoming \d+$/ }).click();
    else if (repositoriesWereOpen) await page.getByRole('button', { name: 'Repositories', exact: true }).click();
  }
}

export async function openWorkspaceMenu(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
}
