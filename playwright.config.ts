import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${process.env['E2E_FRONTEND_PORT'] ?? process.env['E2E_APP_PORT'] ?? '3100'}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx scripts/test-server.ts',
    url: `http://127.0.0.1:${process.env['E2E_FRONTEND_PORT'] ?? process.env['E2E_APP_PORT'] ?? '3100'}/api/health`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
