import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('admin login in English', () => {
  test.use({ locale: 'en-US' });

  test('admin login is branded, responsive and security-hardened', async ({ page }) => {
    const response = await page.goto('/admin/login');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/LociAR Admin/);
    await expect(page.getByText('LociAR administration', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administrator sign-in' })).toBeVisible();
    // The email-code form is the default; the older link form stays collapsed in <details>.
    await expect(page.locator('#otp-email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send sign-in code' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('FIREBASE_SERVICE_ACCOUNT_JSON');
    expect(response?.headers()['x-frame-options']).toBe('DENY');
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBeFalsy();
  });
});

test.describe('admin login in Turkish', () => {
  test.use({ locale: 'tr-TR' });

  test('admin login follows a Turkish browser language', async ({ page }) => {
    const response = await page.goto('/admin/login');
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText('LociAR yönetim', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yönetici girişi' })).toBeVisible();
    await expect(page.locator('#otp-email')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBeFalsy();
  });
});

test('cross-origin admin write is rejected before authentication', async ({ request, baseURL }) => {
  const response = await request.post('/api/admin/v1/approvals', {
    headers: { origin: 'https://attacker.invalid', host: new URL(baseURL!).host, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    data: {},
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: 'Cross-origin admin writes are forbidden' });
});

test('auth callback fails closed without one-time link tokens', async ({ page }) => {
  const response = await page.goto('/auth/callback');
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Sign-in link could not be completed' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to admin sign in' })).toHaveAttribute('href', '/admin/login');
});

test('cross-origin session persistence is rejected before token validation', async ({ request, baseURL }) => {
  const response = await request.post('/api/auth/session', {
    headers: {
      origin: 'https://attacker.invalid',
      host: new URL(baseURL!).host,
      'content-type': 'application/json',
    },
    data: { accessToken: 'x'.repeat(64), refreshToken: 'y'.repeat(32) },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ ok: false, reason: 'origin' });
});

for (const path of ['/privacy', '/terms', '/support', '/en/privacy', '/privacy/en', '/login']) {
  test(`public page ${path} has no serious or critical accessibility violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    if (path === '/en/privacy') await expect(page).toHaveURL(/\/privacy\/en$/);
    if (path === '/login') await expect(page).toHaveURL(/\/admin\/login$/);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? '')),
      JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test('skip link is keyboard visible and focuses the single main landmark', async ({ page }) => {
  await page.goto('/privacy');
  const skipLink = page.getByRole('link', { name: 'İçeriğe geç' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  const position = await skipLink.boundingBox();
  expect(position?.y).toBeGreaterThanOrEqual(0);
  await expect(skipLink).toHaveCSS('outline-color', 'rgb(56, 224, 184)');
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  await expect(page.getByRole('main')).toHaveCount(1);
});

test('unknown pages show the accessible branded not-found screen', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Destek sayfasına git' })).toHaveAttribute('href', '/support');
  await expect(page.getByRole('main')).toHaveCount(1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});
