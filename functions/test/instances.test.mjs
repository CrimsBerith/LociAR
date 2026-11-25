import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

process.env.GCLOUD_PROJECT ??= 'demo-lociar';
process.env.FIREBASE_CONFIG ??= '{"projectId":"demo-lociar"}';
const functions = createRequire(import.meta.url)('../lib/index.js');

// Social triggers run several instances so a launch burst does not queue behind one cold start.
// Their handlers are idempotent and transactional (see TRIGGER_MAX_INSTANCES in core.ts).
const SOCIAL_TRIGGERS = [
  'onLikeCreated', 'onLikeDeleted', 'onCommentCreated', 'onCommentDeleted', 'onSaveCreated', 'onSaveDeleted',
  'onFollowCreated', 'onFollowDeleted', 'onPostWritten', 'onProfileUpdated', 'onActivityCreated', 'onAdminNotificationQueued',
];

test('social triggers may scale to 3 instances', () => {
  for (const name of SOCIAL_TRIGGERS) {
    const endpoint = functions[name]?.__endpoint;
    assert.ok(endpoint?.eventTrigger, `${name} is an event trigger`);
    assert.equal(endpoint.maxInstances, 3, name);
  }
});

test('no function scales without a ceiling and none keeps a warm instance', () => {
  for (const [name, fn] of Object.entries(functions)) {
    const endpoint = fn?.__endpoint;
    if (!endpoint) continue;
    assert.ok(Number.isInteger(endpoint.maxInstances) && endpoint.maxInstances >= 1 && endpoint.maxInstances <= 10, `${name} maxInstances`);
    assert.ok(!endpoint.minInstances, `${name} minInstances must stay 0 (spend)`);
  }
});

// Map reads run on every pan and note open, so they scale further (owner decision, 25 Nov 2026).
const MAP_READ_CALLABLES = new Set(['readPublicContent', 'readNoteDensity']);

test('callables keep 4 instances; the map read callables scale to 10', () => {
  for (const name of MAP_READ_CALLABLES) assert.ok(functions[name]?.__endpoint?.callableTrigger, `${name} is a callable`);
  for (const [name, fn] of Object.entries(functions)) {
    if (fn?.__endpoint?.callableTrigger) assert.equal(fn.__endpoint.maxInstances, MAP_READ_CALLABLES.has(name) ? 10 : 4, name);
  }
});
