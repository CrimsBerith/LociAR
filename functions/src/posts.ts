import { randomUUID } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import {
  analyticsEventDoc, bucket, db, CALLABLE_MAX_INSTANCES, deleteStoragePrefix, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, isUUID,
  requireCaller, Timestamp, assertServiceEnabled,
} from './core';
import { encodeGeohash } from './geo';
import { cloudAnchorIdOf, evaluatePlacement, validateCreatePostBody, type CreatePostBody } from './placement';
import { reasonError, withContentionGuard } from './errors';
import { admitPost, anchorBindError, deleteAnchorOfPost } from './anchors';
import { activeDensity, readDensityLocks, updateDensityLock } from './postAdmission';
import { protectedZoneAt } from './protectedZones';
import { assertAccountNotDeleting, requireActiveAccount } from './profileGuard';

/**
 * High-quality world locks used to go live without review in the Supabase build. App Review
 * notes promise that every post is reviewed first, so this defaults to off.
 */
const AUTO_PUBLISH_HIGH_QUALITY = process.env.LOCIAR_AUTO_PUBLISH_HIGH_QUALITY === 'true';

async function storageObjectExists(path: string | null): Promise<boolean> {
  if (!path) return false;
  const [exists] = await bucket().file(path).exists();
  return exists;
}

function serializePost(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, placement_state: data.placement_state ?? null, status: data.status };
}

export const createPost = onCall({ memory: '512MiB', timeoutSeconds: 60, enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  await assertServiceEnabled('create_post');
  const body = request.data as CreatePostBody;
  if (body?.userId !== caller.luid) throw reasonError('permission-denied', 'Publishing session changed', 'session_changed');
  const validationError = validateCreatePostBody(body, caller.luid);
  if (validationError) throw new HttpsError('invalid-argument', validationError);
  if (!identityVerified(caller)) {
    throw reasonError('permission-denied', 'A verified Apple or email identity is required', 'identity_unverified');
  }

  const postId = body.clientMutationId!.toLowerCase();
  const postRef = db.collection('posts').doc(postId);
  const { latitude: lat, longitude: lng } = body.pose;
  // A committed mutation is replayable even when its old draft assets have since expired.
  // Re-check both the account fence and the document in a transaction before returning it.
  if ((await postRef.get()).exists) {
    const replay = await db.runTransaction(async (tx) => {
      await requireActiveAccount(tx, caller.luid);
      const existing = await tx.get(postRef);
      if (!existing.exists) return null;
      const data = existing.data()!;
      if (data.creator_id !== caller.luid) throw new HttpsError('already-exists', 'Post ID is already in use');
      return { post: serializePost(postId, data), publishStatus: data.status, idempotentReplay: true };
    });
    if (replay) return replay;
  }
  // Storage validation can perform network I/O. Do it before opening a transaction; no quota
  // has been consumed, so a timeout or an invalid anchor cannot leak admission slots.
  const placement = await evaluatePlacement(body, caller.luid, storageObjectExists);
  const publishStatus = AUTO_PUBLISH_HIGH_QUALITY && placement.autoPublishEligible ? 'active' : 'pending_review';
  const mapURI = body.pose.anchor?.persistence?.kind === 'arkit_world_map' ? body.pose.anchor.persistence.assetURI ?? body.pose.anchor.persistence.assetUri ?? body.pose.anchor.persistence.storagePath : null;
  const worldMapPath = typeof mapURI === 'string' && mapURI.startsWith('storage://') ? mapURI.slice(10) : null;
  const document = {
    world_map_path: worldMapPath,
    id: postId,
    creator_id: caller.luid,
    creator_handle: '',
    lat,
    lng,
    geohash: encodeGeohash(lat, lng, 10),
    pose_json: JSON.stringify(body.pose),
    ref_image_url: body.refImageUri,
    edit_data_json: JSON.stringify(body.editData),
    content_source_json: body.contentSource ? JSON.stringify(body.contentSource) : null,
    anchor_bundle_json: body.anchorBundle ? JSON.stringify(body.anchorBundle) : null,
    calibration_json: JSON.stringify(placement.calibration),
    caption: body.caption.trim(),
    age_rating: body.ageRating,
    visibility: body.visibility,
    status: publishStatus,
    placement_state: placement.placementState,
    placement_quality: placement.placementQuality,
    resolver_strategy: placement.resolverStrategy,
    native_provider: placement.nativeProvider,
    multi_user_ready: placement.hasPersistentResolver,
    cloud_anchor_id: cloudAnchorIdOf(body),
    geospatial: body.pose.anchor?.geospatial ? true : false,
    views_count: 0,
    likes_count: 0,
    comments_count: 0,
    saves_count: 0,
    engagement_score: 0,
    client_mutation_id: postId,
    deleted_at: null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  const outcome = await withContentionGuard(() => db.runTransaction(async (tx) => {
    const profile = await requireActiveAccount(tx, caller.luid);
    const [existing, reclamation] = await Promise.all([
      tx.get(postRef),
      tx.get(db.collection('storage_reclamations').doc(postId)),
    ]);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.creator_id !== caller.luid) throw new HttpsError('already-exists', 'Post ID is already in use');
      return { kind: 'replay' as const, post: serializePost(postId, data), publishStatus: data.status };
    }
    if (reclamation.exists && reclamation.get('state') !== 'draft') throw reasonError('failed-precondition', 'World map draft expired; create a new draft', 'draft_expired');

    // The zone scan is deliberately fresh on every transaction attempt. It is not a cached
    // safety decision, so newly activated zones and records after the first page participate.
    const zone = await protectedZoneAt(lat, lng, tx);
    if (zone) {
      tx.create(db.collection('analytics_events').doc(randomUUID()), analyticsEventDoc({
        userId: caller.luid, name: 'protected_zone_blocked', properties: { zone: zone.name }, lat, lng,
      }));
      return { kind: 'protected' as const, zoneName: zone.name };
    }
    const anchorId = cloudAnchorIdOf(body);
    const anchorRef = anchorId ? db.collection('cloud_anchors').doc(anchorId) : null;
    if (anchorRef) {
      const anchor = await tx.get(anchorRef);
      const bindError = anchorBindError(anchor.data(), caller.luid);
      if (bindError) throw new HttpsError('invalid-argument', bindError);
    }
    const densityLock = await readDensityLocks(tx, lat, lng);
    const admission = await admitPost(tx, caller.luid, Date.now(), () => activeDensity(lat, lng, tx));
    if (!admission.ok) {
      if (admission.flag) tx.create(db.collection('moderation_flags').doc(randomUUID()), {
        post_id: null, user_id: caller.luid, reason: 'rate_or_density_limit', status: 'open',
        metadata: { hourly: admission.hourly, daily: admission.daily, density: admission.density, limit: admission.reason },
        created_at: FieldValue.serverTimestamp(),
      });
      return { kind: 'limited' as const };
    }
    updateDensityLock(tx, densityLock, Date.now());
    if (anchorRef) tx.update(anchorRef, { post_id: postId, bound_at: FieldValue.serverTimestamp(), expires_at: FieldValue.delete() });
    tx.set(db.collection('storage_reclamations').doc(postId), { post_id: postId, creator_id: caller.luid, state: 'committed', world_map_path: worldMapPath, public_readable: publishStatus === 'active' && body.visibility === 'public', claimed_at: FieldValue.serverTimestamp() });
    tx.create(postRef, { ...document, creator_handle: String(profile.handle ?? '') });
    tx.create(db.collection('analytics_events').doc(randomUUID()), analyticsEventDoc({
      userId: caller.luid, postId,
      name: publishStatus === 'active' ? 'post_published_active' : 'post_pending_review_created',
      properties: {
        layerCount: (body.editData as { layers: unknown[] }).layers.length,
        placementState: placement.placementState,
        placementQuality: placement.placementQuality,
        nativeProvider: placement.nativeProvider,
        publishStatus,
        multiUserReady: placement.hasPersistentResolver,
      }, lat, lng,
    }));
    return { kind: 'created' as const };
  }, { maxAttempts: 10 }));
  if (outcome.kind === 'replay') return { post: outcome.post, publishStatus: outcome.publishStatus, idempotentReplay: true };
  if (outcome.kind === 'protected') throw reasonError('permission-denied', `Creation is blocked in protected zone: ${outcome.zoneName}`, 'protected_zone');
  if (outcome.kind === 'limited') throw reasonError('resource-exhausted', 'Creation limit reached for this area or account', 'rate_limited');

  return { post: serializePost(postId, document), publishStatus, idempotentReplay: false };
});

export const deleteOwnPost = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const postId = (request.data as { postId?: unknown })?.postId;
  if (!isUUID(postId)) throw new HttpsError('invalid-argument', 'Invalid post ID');
  const ref = db.collection('posts').doc(postId.toLowerCase());
  let cloudAnchorId: string | null = null;
  const removed = await db.runTransaction(async (tx) => {
    await assertAccountNotDeleting(tx, caller.luid);
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const post = snap.data()!;
    if (post.creator_id !== caller.luid || post.deleted_at) return false;
    if (!['active', 'pending_review', 'flagged', 'draft'].includes(post.status)) return false;
    cloudAnchorId = typeof post.cloud_anchor_id === 'string' ? post.cloud_anchor_id : null;
    tx.set(db.collection('storage_reclamations').doc(postId.toLowerCase()), { creator_id: caller.luid, state: 'removed', public_readable: false }, { merge: true });
    tx.update(ref, { status: 'removed', deleted_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    return true;
  });
  if (removed) {
    await deleteStoragePrefix(`${caller.luid}/${postId.toLowerCase()}/`);
    await deleteAnchorOfPost(cloudAnchorId, postId.toLowerCase());
  }
  return { removed };
});

export const recordPostView = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const postId = (request.data as { postId?: unknown })?.postId;
  if (!isUUID(postId)) throw new HttpsError('invalid-argument', 'Invalid post ID');
  const id = postId.toLowerCase();
  const postRef = db.collection('posts').doc(id);
  const day = new Date().toISOString().slice(0, 10);
  const receiptRef = db.collection('post_view_receipts').doc(`${id}_${caller.luid}_${day}`);

  return db.runTransaction(async (tx) => {
    await assertAccountNotDeleting(tx, caller.luid);
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new HttpsError('permission-denied', 'post_not_viewable');
    const post = snap.data()!;
    await assertAccountNotDeleting(tx, String(post.creator_id));
    const viewable = post.creator_id === caller.luid
      || (post.status === 'active' && post.visibility === 'public' && post.age_rating !== '18_plus' && !post.deleted_at);
    if (!viewable) throw new HttpsError('permission-denied', 'post_not_viewable');
    const [blockA, blockB] = await Promise.all([
      tx.get(db.collection('user_blocks').doc(`${caller.luid}_${post.creator_id}`)),
      tx.get(db.collection('user_blocks').doc(`${post.creator_id}_${caller.luid}`)),
    ]);
    if (blockA.exists || blockB.exists) throw new HttpsError('permission-denied', 'post_not_viewable');
    const receipt = await tx.get(receiptRef);
    const current = Number(post.views_count ?? 0);
    if (receipt.exists) return { views: current };
    tx.create(receiptRef, { post_id: id, user_id: caller.luid, viewed_on: day, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 30 * 86_400_000) });
    tx.update(postRef, {
      views_count: FieldValue.increment(1),
      engagement_score: FieldValue.increment(1),
    });
    return { views: current + 1 };
  });
});

/** A map draft has one immutable locator and one owner. Admission itself never consumes a post
 * quota; expired/reclaimed/committed drafts cannot be reopened by a stale upload attempt. */
export const beginWorldMapUpload = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async request => {
  const caller = requireCaller(request);
  const postId = (request.data as { postId?: unknown })?.postId;
  if (!isUUID(postId)) throw new HttpsError('invalid-argument', 'Invalid post ID');
  const id = postId.toLowerCase();
  await assertServiceEnabled('create_post');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [claim, post] = await tx.getAll(db.collection('storage_reclamations').doc(id), db.collection('posts').doc(id));
    if (post.exists || claim.exists && (claim.get('state') !== 'draft' || claim.get('creator_id') !== caller.luid)) throw reasonError('failed-precondition', 'Map draft is no longer writable', 'draft_expired');
    if (!claim.exists) tx.create(claim.ref, { post_id: id, creator_id: caller.luid, state: 'draft', created_at: FieldValue.serverTimestamp() });
    return { admitted: true };
  });
});
