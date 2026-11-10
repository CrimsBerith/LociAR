import test from 'node:test';
import assert from 'node:assert/strict';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db, killSwitchOn, resetKillSwitchCache } = await import('../lib/core.js');

test('unreadable emergency flags refuse admission instead of caching an enabled service', async t => {
  let failing = true, reads = 0;
  t.mock.method(db, 'collection', () => ({ doc: () => ({ get: async () => {
    reads++;
    if (failing) throw Object.assign(new Error('synthetic provider detail must not be logged'), { code: 14 });
    return { data: () => ({ kill_switch: true }) };
  } }) }));
  resetKillSwitchCache();
  await assert.rejects(killSwitchOn(), error => error.code === 'unavailable' && error.details.reason === 'busy_retry');
  failing = false;
  assert.equal(await killSwitchOn(), true);
  assert.equal(reads, 2);
  resetKillSwitchCache();
});

test('kill switch reads only its emergency flag and reuses the cached flags document', async t => {
  let flags = {}, reads = 0;
  t.mock.method(db, 'collection', () => ({ doc: () => ({ get: async () => { reads++; return { data: () => flags }; } }) }));
  resetKillSwitchCache();
  flags = { post_review_required: true, kill_switch: false };
  assert.equal(await killSwitchOn(), false);
  assert.equal(reads, 1, 'legacy review flags no longer gate post publishing');
  resetKillSwitchCache();
});
