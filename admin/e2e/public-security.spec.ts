import { expect, test } from '@playwright/test';

test('admin login is branded, responsive and security-hardened', async ({ page }) => {
  const response = await page.goto('/admin/login');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/LociAR Admin/);
  await expect(page.getByText('LociAR operations', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('FIREBASE_SERVICE_ACCOUNT_JSON');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBeFalsy();
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
