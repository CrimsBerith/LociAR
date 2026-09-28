import { expect, test } from '@playwright/test';

const hasAal2State = Boolean(process.env.ADMIN_E2E_STORAGE_STATE);

test.describe('AAL2 operations', () => {
  test.skip(!hasAal2State, 'Set ADMIN_E2E_STORAGE_STATE to an ephemeral AAL2 admin Playwright state file.');

  const pages = [
    ['/admin/dashboard', 'Dashboard'],
    ['/admin/users', 'Users'],
    ['/admin/posts', 'Posts & media'],
    ['/admin/moderation', 'Moderation queue'],
    ['/admin/anchors', 'AR anchors'],
    ['/admin/places', 'Map & places'],
    ['/admin/zones', 'Restricted zones'],
    ['/admin/analytics', 'Analytics'],
    ['/admin/system', 'System health'],
    ['/admin/approvals', 'Pending approvals'],
    ['/admin/audit', 'Audit logs'],
  ] as const;

  for (const [path, heading] of pages) {
    test(`${heading} loads with MFA session`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByText('MFA verified')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('FIREBASE_SERVICE_ACCOUNT_JSON');
    });
  }

  test('global search returns operational categories', async ({ page }) => {
    await page.goto('/admin/search?q=QA');
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AR anchors' })).toBeVisible();
  });
});
