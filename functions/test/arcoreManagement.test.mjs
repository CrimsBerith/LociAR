import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCloudAnchor, deleteCloudAnchorDetailed, listCloudAnchors } from '../lib/arcoreManagement.js';
import { backoffMs } from '../lib/anchorQueue.js';
import { selectOrphanAnchors } from '../lib/arcoreToken.js';

process.env.FUNCTIONS_EMULATOR = 'false';
process.env.ARCORE_MANAGEMENT_DISABLED = 'false';

const failing = (status) => ({ getClient: async () => ({ request: async () => { throw Object.assign(new Error('x'), { response: { status } }); } }) });
const ok = (data = {}) => ({ getClient: async () => ({ request: async () => ({ data }) }) });

test('deleteCloudAnchor: 200 and 404 count as deleted; 403 and 500 do not', async () => {
  assert.equal(await deleteCloudAnchor('ua-abcdef123', ok()), true);
  assert.equal(await deleteCloudAnchor('ua-abcdef123', failing(404)), true);
  assert.deepEqual(await deleteCloudAnchorDetailed('ua-abcdef123', failing(403)), { ok: false, status: 403, error: 'http_403' });
  assert.deepEqual(await deleteCloudAnchorDetailed('ua-abcdef123', failing(500)), { ok: false, status: 500, error: 'http_500' });
  assert.equal(await deleteCloudAnchor(null, ok()), false);
});

test('deleteCloudAnchor reports a disabled Management API as skipped', async () => {
  process.env.ARCORE_MANAGEMENT_DISABLED = 'true';
  try {
    assert.deepEqual(await deleteCloudAnchorDetailed('ua-abcdef123', ok()), { ok: false, skipped: true, error: 'management_disabled' });
  } finally {
    process.env.ARCORE_MANAGEMENT_DISABLED = 'false';
  }
});

test('listCloudAnchors maps names, skips blanks and forwards page tokens', async () => {
  const urls = [];
  const client = { getClient: async () => ({ request: async ({ url }) => { urls.push(url); return { data: { anchors: [{ name: 'anchors/ua-1', createTime: '2026-01-01T00:00:00Z' }, { name: '' }], nextPageToken: 'tok' } }; } }) };
  const page = await listCloudAnchors('abc', client);
  assert.deepEqual(page.anchors, [{ id: 'ua-1', createTime: '2026-01-01T00:00:00Z' }]);
  assert.equal(page.nextPageToken, 'tok');
  assert.match(urls[0], /page_token=abc/);
});

test('1500 fake anchors are fully covered by three 5-page runs worth of pages', async () => {
  const all = Array.from({ length: 1500 }, (_, i) => ({ name: `anchors/ua-${String(i).padStart(6, '0')}`, createTime: '2020-01-01T00:00:00Z' }));
  const client = { getClient: async () => ({ request: async ({ url }) => {
    const token = new URL(url).searchParams.get('page_token');
    const start = token ? Number(token) : 0;
    const slice = all.slice(start, start + 200);
    return { data: { anchors: slice, nextPageToken: start + 200 < all.length ? String(start + 200) : undefined } };
  } }) };
  const seen = new Set();
  let token;
  let runs = 0;
  do {
    for (let page = 0; page < 3; page++) { // a run that only has budget for 3 pages, resuming from the stored cursor
      const { anchors, nextPageToken } = await listCloudAnchors(token, client);
      anchors.forEach((a) => seen.add(a.id));
      token = nextPageToken;
      if (!token) break;
    }
    runs++;
  } while (token && runs < 10);
  assert.equal(seen.size, 1500);
  assert.ok(runs <= 3);
});

test('retry backoff doubles from 1h and caps at 24h', () => {
  assert.equal(backoffMs(0), 3_600_000);
  assert.equal(backoffMs(1), 2 * 3_600_000);
  assert.equal(backoffMs(3), 8 * 3_600_000);
  assert.equal(backoffMs(10), 24 * 3_600_000);
});

test('orphan selection respects the grace period and references', () => {
  const now = Date.parse('2026-06-30T00:00:00Z');
  const anchors = [
    { id: 'old-orphan', createTime: '2026-01-01T00:00:00Z' },
    { id: 'old-used', createTime: '2026-01-01T00:00:00Z' },
    { id: 'new-orphan', createTime: '2026-06-29T00:00:00Z' },
  ];
  assert.deepEqual(selectOrphanAnchors(anchors, new Set(['old-used']), now, 30 * 86_400_000), ['old-orphan']);
});
