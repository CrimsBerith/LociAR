import { defineConfig, devices } from '@playwright/test';
import ciEnvironment from './scripts/ci-environment.json';

const remoteBaseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;
const publicOnly = process.env.ADMIN_E2E_PUBLIC_ONLY === '1';
const configuredPort = process.env.ADMIN_E2E_PORT ?? '3100';
if (!/^\d{1,5}$/.test(configuredPort) || Number(configuredPort) < 1024 || Number(configuredPort) > 65_535) {
  throw new Error('ADMIN_E2E_PORT must be an integer between 1024 and 65535.');
}
const localOrigin = `http://127.0.0.1:${Number(configuredPort)}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: publicOnly ? 'public-security.spec.ts' : undefined,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  outputDir: 'artifacts/playwright-results',
  use: {
    baseURL: remoteBaseURL ?? localOrigin,
    storageState: publicOnly ? undefined : storageState || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
  ],
  webServer: remoteBaseURL ? undefined : {
    env: { ...ciEnvironment, ADMIN_ORIGIN: localOrigin },
    command: `npm run ${process.env.CI ? 'start' : 'dev'} -- --hostname 127.0.0.1 --port ${Number(configuredPort)}`,
    url: `${localOrigin}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
