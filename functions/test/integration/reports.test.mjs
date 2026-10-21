import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, expectFailure, newUser } from './_harness.mjs';
import { Timestamp } from '../../lib/core.js';
import { autoHideReported } from '../../lib/noteAutomation.js';
after(closeClients);

async function fixture() {
  const author = await newUser(), viewer = await newUser(), postId = randomUUID();
  const ref = adminDb.collection('posts').doc(postId);
  await ref.set({ creator_id: author.luid, status: 'active', visibility: 'public', age_rating: 'all', push_state: 'approved' });
  return { author, viewer, ref, report: { targetKind: 'post', targetId: postId, reason: 'spam' } };
}

test('concurrent reports and network retries create one flag, receipt and quota charge', async () => {
  const f = await fixture();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.viewer.call('submitReport', f.report)));
  assert.equal(new Set(responses.map(r => r.flagId)).size, 1);
  assert.equal(responses.filter(r => !r.alreadyReported).length, 1);
  assert.equal((await adminDb.collection('moderation_flags').where('user_id', '==', f.viewer.luid).get()).size, 1);
  assert.equal((await adminDb.collection('report_receipts').where('owner_luid', '==', f.viewer.luid).get()).size, 1);
  assert.equal((await adminDb.collection('report_quota').doc(f.viewer.luid).get()).get('day').count, 1);
  await f.ref.update({ status: 'removed' });
  assert.equal((await f.viewer.call('submitReport', f.report)).flagId, responses[0].flagId, 'accepted report remains retryable after target moderation');
});

test('comment and user targets are read on the server, never supplied by the reporter', async () => {
  const f = await fixture(), commentId = randomUUID();
  await adminDb.collection('comments').doc(commentId).set({ user_id: f.author.luid, post_id: f.ref.id, text: 'Actual server text' });
  const result = await f.viewer.call('submitReport', { targetKind: 'comment', targetId: commentId, reason: 'harassment' });
  const flag = (await adminDb.collection('moderation_flags').doc(result.flagId).get()).data();
  assert.equal(flag.post_id, f.ref.id); assert.equal(flag.metadata.author_id, f.author.luid); assert.equal(flag.metadata.text, 'Actual server text');
  assert.equal(Object.hasOwn(result, 'authorId'), false);
  const emojiId = randomUUID();
  await adminDb.collection('comments').doc(emojiId).set({ user_id: f.author.luid, post_id: f.ref.id, text: 'a' + '😀'.repeat(300) });
  const emoji = await f.viewer.call('submitReport', { targetKind: 'comment', targetId: emojiId, reason: 'harassment' });
  const excerpt = (await adminDb.collection('moderation_flags').doc(emoji.flagId).get()).get('metadata.text');
  assert.ok(excerpt.length <= 500); assert.equal(excerpt.includes('\uFFFD'), false, 'clipping must not split an emoji');
  const user = await f.viewer.call('submitReport', { targetKind: 'user', targetId: f.author.luid, reason: 'Diğer' });
  assert.equal((await adminDb.collection('moderation_flags').doc(user.flagId).get()).get('post_id'), null);
  for (const override of [{ userId: f.author.luid }, { metadata: { author_id: randomUUID() } }, { reason: 'constructor' }, { reason: 'x'.repeat(501) }]) {
    const error = await expectFailure(f.viewer.call('submitReport', { ...f.report, ...override }));
    assert.ok(['functions/invalid-argument', 'functions/permission-denied'].includes(error.code));
  }
});

test('minute quotas are transaction-safe while duplicate reports remain available at the limit', async () => {
  const f = await fixture(), ids = Array.from({ length: 8 }, () => randomUUID());
  for (const id of ids) await adminDb.collection('posts').doc(id).set({ creator_id: f.author.luid, status: 'active', visibility: 'public', age_rating: 'all' });
  // This is a fixed UTC-minute quota. A batch straddling :00 may legitimately
  // admit more than five reports across two windows; reserve half a minute.
  const remaining = 60_000 - Date.now() % 60_000;
  if (remaining < 30_000) await new Promise(resolve => setTimeout(resolve, remaining + 50));
  const window = Math.floor(Date.now() / 60_000);
  const responses = await Promise.allSettled(ids.map(targetId => f.viewer.call('submitReport', { ...f.report, targetId })));
  assert.equal(Math.floor(Date.now() / 60_000), window, 'the quota batch must exercise one minute window');
  assert.equal(responses.filter(r => r.status === 'fulfilled').length, 5);
  const quota = (await adminDb.collection('report_quota').doc(f.viewer.luid).get()).get('minute');
  assert.deepEqual(quota, { window, count: 5 });
  for (const error of responses.filter(r => r.status === 'rejected')) assert.equal(error.reason.code, 'functions/resource-exhausted');
  const accepted = responses.findIndex(r => r.status === 'fulfilled');
  assert.equal((await f.viewer.call('submitReport', { ...f.report, targetId: ids[accepted] })).alreadyReported, true);
});

test('daily limits refuse a new target without consuming quota or creating a flag', async () => {
  const f = await fixture(), now = Date.now();
  await adminDb.collection('report_quota').doc(f.viewer.luid).set({ owner_luid: f.viewer.luid, day: { window: Math.floor(now / 86_400_000), count: 20 } });
  assert.equal((await expectFailure(f.viewer.call('submitReport', f.report))).code, 'functions/resource-exhausted');
  assert.equal((await adminDb.collection('moderation_flags').where('user_id', '==', f.viewer.luid).get()).size, 0);
});

test('suspended people can report, but deleted sessions, private targets and self reports are refused', async () => {
  const f = await fixture();
  await adminDb.collection('profiles').doc(f.viewer.luid).update({ suspended: true });
  assert.equal((await f.viewer.call('submitReport', f.report)).ok, true);
  assert.equal((await expectFailure(f.author.call('submitReport', f.report))).code, 'functions/invalid-argument');
  const privateId = randomUUID();
  await adminDb.collection('posts').doc(privateId).set({ creator_id: f.author.luid, status: 'active', visibility: 'private' });
  assert.equal((await expectFailure(f.viewer.call('submitReport', { ...f.report, targetId: privateId }))).code, 'functions/permission-denied');
  await adminDb.collection('account_deletion_jobs').doc(f.viewer.luid).set({ state: 'pending' });
  assert.equal((await expectFailure(f.viewer.call('submitReport', f.report))).code, 'functions/permission-denied');
});

test('new, suspended, missing or deleting accounts do not contribute to automatic hiding', async () => {
  const f = await fixture(), mature = await Promise.all([newUser(), newUser(), newUser()]);
  const old = Timestamp.fromMillis(Date.now() - 2 * 86_400_000);
  const ids = [f.viewer.luid, mature[0].luid, mature[1].luid, randomUUID()];
  for (const user of mature) await adminDb.collection('profiles').doc(user.luid).update({ created_at: old });
  await adminDb.collection('profiles').doc(mature[0].luid).update({ suspended: true });
  await adminDb.collection('account_deletion_jobs').doc(mature[1].luid).set({ state: 'pending' });
  for (const id of ids) await adminDb.collection('moderation_flags').doc(randomUUID()).set({ post_id: f.ref.id, user_id: id, status: 'open', reason: 'spam' });
  assert.equal(await autoHideReported(f.ref.id), false);
  for (const user of mature) {
    await adminDb.collection('profiles').doc(user.luid).update({ suspended: false });
    await adminDb.collection('account_deletion_jobs').doc(user.luid).delete();
    await user.call('submitReport', f.report);
  }
  // The emulator trigger may have applied the same decision first.
  await autoHideReported(f.ref.id);
  assert.equal((await f.ref.get()).get('status'), 'flagged');
});

test('account deletion removes private report receipts and quotas, while anonymising the moderation record', async () => {
  const f = await fixture(), result = await f.viewer.call('submitReport', f.report);
  await f.viewer.call('deleteAccount');
  assert.equal((await adminDb.collection('report_receipts').where('owner_luid', '==', f.viewer.luid).get()).size, 0);
  assert.equal((await adminDb.collection('report_quota').doc(f.viewer.luid).get()).exists, false);
  assert.equal((await adminDb.collection('moderation_flags').doc(result.flagId).get()).get('user_id'), null);
});

test('deleting a reported account removes its target identity without deleting another reporter records', async () => {
  const f = await fixture();
  const result = await f.viewer.call('submitReport', { targetKind: 'user', targetId: f.author.luid, reason: 'other' });
  await f.author.call('deleteAccount');
  const flag = await adminDb.collection('moderation_flags').doc(result.flagId).get();
  assert.equal(flag.get('metadata.reported_user_id'), null);
  assert.equal(flag.get('target_deleted'), true);
  assert.equal(flag.get('user_id'), f.viewer.luid);
  assert.equal((await adminDb.collection('report_receipts').where('target_luid', '==', f.author.luid).get()).size, 0);
  assert.equal((await adminDb.collection('report_quota').doc(f.viewer.luid).get()).exists, true);
});
