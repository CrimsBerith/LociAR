// Operations safety nets (issues #6, #12, #16): kill switch, quota refunds, idempotent profile
// flags, the Cloud Anchor deletion queue and the orphan sweep cursor. Run via `npm run test:emulator`.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, expectFailure, newUser, postBody } from './_harness.mjs';
import { onProfileUpdated } from '../../lib/triggers.js';
import { deleteAnchorOrQueue, drainAnchorDeletionQueue } from '../../lib/anchorQueue.js';
import { purgeOrphanCloudAnchors } from '../../lib/cleanup.js';

after(async () => closeClients());

const flags = () => adminDb.collection('system').doc('flags');
const hourDoc = (luid) => adminDb.collection('post_quota').doc(`${luid}_h${Math.floor(Date.now() / 3_600_000)}`);
const anchorPose = (cloudAnchorId, lat, lng) => ({
  latitude: lat, longitude: lng, heading: 10, accuracy: 8,
  anchor: {
    coordinateSpace: 'visual_surface', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(),
    persistence: { kind: 'arcore_cloud_anchor', cloudAnchorId, version: 1, originalNativeAnchorId: 'x', hostedAt: new Date().toISOString() },
  },
});

test('kill switch: content and cost paths answer service_paused, and recover when it is cleared', async () => {
  const user = await newUser();
  await flags().set({ kill_switch: true, kill_reason: 'test' });
  try {
    for (const [name, data] of [
      ['createPost', postBody({ pose: { latitude: 41.1, longitude: 29.1, heading: 0, accuracy: 5 } })],
      ['getArcoreToken', {}],
      ['registerCloudAnchor', { cloudAnchorId: `ua-${randomUUID().replace(/-/g, '')}` }],
      ['beginAvatarUpload', {}],
    ]) {
      const error = await expectFailure(user.call(name, data));
      assert.equal(error.code, 'functions/unavailable', name);
      assert.equal(error.details?.reason, 'service_paused', name);
    }
  } finally {
    await flags().set({ kill_switch: false });
  }
  await user.call('createPost', postBody({ pose: { latitude: 41.1, longitude: 29.1, heading: 0, accuracy: 5 } }));
});

test('createPost: failed publishes are refunded at most 3 times an hour', async () => {
  const user = await newUser();
  for (let i = 0; i < 4; i++) {
    const missingAnchor = `ua-${randomUUID().replace(/-/g, '')}`;
    const failed = await expectFailure(user.call('createPost', postBody({ pose: anchorPose(missingAnchor, 41.2 + i * 0.01, 29.2) })));
    assert.equal(failed.code, 'functions/invalid-argument');
  }
  const hour = (await hourDoc(user.luid).get()).data();
  assert.equal(hour.refunds, 3);
  assert.equal(hour.count, 1, 'the fourth failure keeps its slot');
});

test('profile text flags: a redelivered event writes one flag', async () => {
  const luid = randomUUID();
  const before = { handle: 'h', bio: 'merhaba', display_name: 'x' };
  const afterData = { handle: 'h', bio: 'siktir git', display_name: 'x' };
  const event = {
    id: `evt-${luid}`,
    params: { luid },
    data: { before: { data: () => before }, after: { data: () => afterData } },
  };
  await onProfileUpdated.run(event);
  await onProfileUpdated.run(event);
  const flagged = await adminDb.collection('moderation_flags').where('user_id', '==', luid).get();
  assert.equal(flagged.size, 1);
  assert.equal(flagged.docs[0].data().reason, 'profile_text_filtered');
});

// Stubbed Management API; the test process talks to Firestore through the emulator only.
function managementStub({ list = {}, deleteStatus = 200, failList = false } = {}) {
  const deleted = [];
  return {
    deleted,
    deps: {
      getClient: async () => ({
        request: async ({ url, method }) => {
          if (method === 'DELETE') {
            deleted.push(decodeURIComponent(url.split('/').pop()));
            if (deleteStatus !== 200) throw Object.assign(new Error('x'), { response: { status: deleteStatus } });
            return { data: {} };
          }
          if (failList) throw Object.assign(new Error('page token expired'), { response: { status: 400 } });
          const token = new URL(url).searchParams.get('page_token') ?? '';
          return { data: list[token] ?? { anchors: [] } };
        },
      }),
    },
  };
}

function withManagementApiOn(fn) {
  return async () => {
    const saved = { emu: process.env.FUNCTIONS_EMULATOR, off: process.env.ARCORE_MANAGEMENT_DISABLED };
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.ARCORE_MANAGEMENT_DISABLED = 'false';
    try {
      await fn();
    } finally {
      process.env.FUNCTIONS_EMULATOR = saved.emu;
      process.env.ARCORE_MANAGEMENT_DISABLED = saved.off;
    }
  };
}

test('anchor deletion queue: a 500 is queued, and the next drain deletes it and empties the queue', withManagementApiOn(async () => {
  const id = `ua-${randomUUID().replace(/-/g, '')}`;
  assert.equal(await deleteAnchorOrQueue(id, managementStub({ deleteStatus: 500 }).deps), false);
  const queued = await adminDb.collection('cloud_anchor_deletions').doc(id).get();
  assert.equal(queued.exists, true);
  assert.equal(queued.data().last_error, 'http_500');

  const failing = managementStub({ deleteStatus: 503 });
  await drainAnchorDeletionQueue(Date.now() + 1_000, 500, failing.deps);
  const retried = (await adminDb.collection('cloud_anchor_deletions').doc(id).get()).data();
  assert.equal(retried.attempts, 1);
  assert.ok(retried.next_at.toMillis() > Date.now(), 'backs off');

  const ok = managementStub();
  const deleted = await drainAnchorDeletionQueue(Date.now() + 2 * 86_400_000, 500, ok.deps);
  assert.ok(deleted >= 1);
  assert.ok(ok.deleted.includes(id));
  assert.equal((await adminDb.collection('cloud_anchor_deletions').doc(id).get()).exists, false);
}));

test('orphan sweep: deletes old unreferenced anchors across pages, keeps referenced ones, then wraps the cursor', withManagementApiOn(async () => {
  await adminDb.collection('system').doc('arcore_orphan_cursor').delete();
  const orphan = `ua-${randomUUID().replace(/-/g, '')}`;
  const bound = `ua-${randomUUID().replace(/-/g, '')}`;
  const fresh = `ua-${randomUUID().replace(/-/g, '')}`;
  await adminDb.collection('cloud_anchors').doc(bound).set({ owner_luid: randomUUID(), post_id: randomUUID() });
  const old = '2020-01-01T00:00:00Z';
  const stub = managementStub({
    list: {
      '': { anchors: [{ name: `anchors/${orphan}`, createTime: old }], nextPageToken: 'p2' },
      p2: { anchors: [{ name: `anchors/${bound}`, createTime: old }, { name: `anchors/${fresh}`, createTime: new Date().toISOString() }] },
    },
  });
  const removed = await purgeOrphanCloudAnchors(Date.now(), 5, stub.deps);
  assert.equal(removed, 1);
  assert.deepEqual(stub.deleted, [orphan]);
  assert.equal((await adminDb.collection('system').doc('arcore_orphan_cursor').get()).data().page_token, null);
}));

test('orphan sweep: an expired stored page token resets the cursor instead of failing forever', withManagementApiOn(async () => {
  await adminDb.collection('system').doc('arcore_orphan_cursor').set({ page_token: 'stale-token' });
  await assert.rejects(purgeOrphanCloudAnchors(Date.now(), 1, managementStub({ failList: true }).deps));
  assert.equal((await adminDb.collection('system').doc('arcore_orphan_cursor').get()).data().page_token, null);
}));
