import { randomUUID } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import {
  bucket, db, CALLABLE_MAX_INSTANCES, deleteStoragePrefix, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, isUUID, logEvent,
  requireCaller, Timestamp,
} from './core';
import { distanceMeters, encodeGeohash, geohashCoverPrefixes } from './geo';
import { cloudAnchorIdOf, evaluatePlacement, validateCreatePostBody, type CreatePostBody } from './placement';
import { reasonError } from './errors';
import { fetchLinkPreview, storedContentSource } from './linkPreview';
import { placeAt } from './places';
import { INVITE_REQUIRED, inviteGate } from './invites';
import { TRUSTED_AUTO_PUBLISH, authorIsTrusted, hasDrawingLayer } from './trust';
import { anchorBindError, consumePostQuota, deleteAnchorOfPost, refundPostQuota } from './anchors';

/**
 * High-quality world locks used to go live without review in the Supabase build. App Review
 * notes promise that every post is reviewed first, so this defaults to off.
 */
const AUTO_PUBLISH_HIGH_QUALITY = process.env.LOCIAR_AUTO_PUBLISH_HIGH_QUALITY === 'true';

type ProtectedZone = { name: string; category: string; lat: number; lng: number; radius_meters: number };
let zoneCache: { at: number; zones: ProtectedZone[] } | null = null;

async function protectedZoneAt(lat: number, lng: number): Promise<ProtectedZone | null> {
  if (!zoneCache || Date.now() - zoneCache.at > 5 * 60 * 1000) {
    const snap = await db.collection('protected_zones').where('active', '==', true).limit(5000).get();
    zoneCache = {
      at: Date.now(),
      zones: snap.docs.map((d) => d.data() as ProtectedZone).filter((z) => typeof z.lat === 'number'),
    };
  }
  let best: { zone: ProtectedZone; distance: number } | null = null;
  for (const zone of zoneCache.zones) {
    const distance = distanceMeters(lat, lng, zone.lat, zone.lng);
    if (distance <= zone.radius_meters && (!best || distance < best.distance)) best = { zone, distance };
  }
  return best?.zone ?? null;
}

async function storageObjectExists(path: string | null): Promise<boolean> {
  if (!path) return false;
  const [exists] = await bucket().file(path).exists();
  return exists;
}

async function activeDensity(lat: number, lng: number, radius: number, tx: FirebaseFirestore.Transaction): Promise<number> {
  const prefixes = geohashCoverPrefixes(lat, lng, radius);
  let count = 0;
  for (const prefix of prefixes) {
    const snap = await tx.get(db.collection('posts')
      .where('status', 'in', ['active', 'pending_review'])
      .orderBy('geohash')
      .startAt(prefix)
      .endAt(`${prefix}~`)
      .limit(50));
    count += snap.docs.filter((d) => {
      const p = d.data();
      return distanceMeters(lat, lng, p.lat, p.lng) <= radius;
    }).length;
  }
  return count;
}

function serializePost(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, placement_state: data.placement_state ?? null, status: data.status };
}

export const createPost = onCall({ memory: '512MiB', timeoutSeconds: 60, enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const body = request.data as CreatePostBody;
  const validationError = validateCreatePostBody(body, caller.luid);
  if (validationError) throw new HttpsError('invalid-argument', validationError);
  if (!identityVerified(caller)) {
    throw reasonError('permission-denied', 'A verified Apple or email identity is required', 'identity_unverified');
  }

  const profileSnap = await db.collection('profiles').doc(caller.luid).get();
  if (!profileSnap.exists) throw reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
  const profile = profileSnap.data()!;
  if (profile.suspended === true || profile.deleted_at) {
    throw reasonError('permission-denied', 'This account cannot publish', 'account_suspended');
  }
  if (INVITE_REQUIRED) {
    const priv = await db.collection('users_private').doc(caller.luid).get();
    if (inviteGate(priv.data(), true)) throw reasonError('permission-denied', 'An invite code is required to publish', 'invite_required');
  }

  const postId = body.clientMutationId!.toLowerCase();
  const postRef = db.collection('posts').doc(postId);
  const existing = await postRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.creator_id !== caller.luid) throw new HttpsError('already-exists', 'Post ID is already in use');
    return { post: serializePost(postId, data), publishStatus: data.status, idempotentReplay: true };
  }

  const { latitude: lat, longitude: lng } = body.pose;
  const zone = await protectedZoneAt(lat, lng);
  if (zone) {
    await logEvent({ userId: caller.luid, name: 'protected_zone_blocked', properties: { zone: zone.name }, lat, lng });
    throw reasonError('permission-denied', `Creation is blocked in protected zone: ${zone.name}`, 'protected_zone');
  }

  const quotaAt = Date.now();
  const admission = await consumePostQuota(caller.luid, quotaAt, (tx) => activeDensity(lat, lng, 25, tx));
  if (!admission.ok) {
    // One flag per user, window and reason (admission.flag), not one per rejected request.
    if (admission.flag) {
      await db.collection('moderation_flags').doc(randomUUID()).set({
        post_id: null,
        user_id: caller.luid,
        reason: 'rate_or_density_limit',
        status: 'open',
        metadata: { hourly: admission.hourly, daily: admission.daily, density: admission.density, limit: admission.reason },
        created_at: FieldValue.serverTimestamp(),
      });
    }
    throw reasonError('resource-exhausted', 'Creation limit reached for this area or account', 'rate_limited');
  }

  // From here on the slot is consumed; any path that does not create the post gives it back.
  const insertPost = async () => {
    const placement = await evaluatePlacement(body, caller.luid, storageObjectExists);
    const autoPublish = placement.autoPublishEligible && !hasDrawingLayer(body.editData)
      && (AUTO_PUBLISH_HIGH_QUALITY || (TRUSTED_AUTO_PUBLISH && await authorIsTrusted(caller.luid, profile, Date.now()).catch(() => false)));
    const publishStatus = autoPublish ? 'active' : 'pending_review';
    const source = body.contentSource ?? null;
    const place = await placeAt(lat, lng);
    const preview = source ? await fetchLinkPreview(String(source.platform ?? '').toLowerCase(), source.url) : null;

    const document = {
      id: postId,
      creator_id: caller.luid,
      creator_handle: String(profile.handle ?? ''),
      lat,
      lng,
      geohash: encodeGeohash(lat, lng, 10),
      place_id: place?.id ?? null,
      pose_json: JSON.stringify(body.pose),
      ref_image_url: body.refImageUri,
      edit_data_json: JSON.stringify(body.editData),
      content_source_json: source ? JSON.stringify(storedContentSource(source, preview)) : null,
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
      // Kept top-level so removal/cleanup can delete the Cloud Anchor through the Management API.
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

    const anchorId = cloudAnchorIdOf(body);
    try {
      await db.runTransaction(async (tx) => {
        if (anchorId) {
          const anchorRef = db.collection('cloud_anchors').doc(anchorId);
          const anchorSnap = await tx.get(anchorRef);
          const bindError = anchorBindError(anchorSnap.data(), caller.luid);
          if (bindError) throw new HttpsError('invalid-argument', bindError);
          tx.update(anchorRef, { post_id: postId, bound_at: FieldValue.serverTimestamp(), expires_at: FieldValue.delete() });
        }
        tx.create(postRef, document);
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const again = await postRef.get();
      if (again.exists && again.data()!.creator_id === caller.luid) {
        return { replay: { post: serializePost(postId, again.data()!), publishStatus: again.data()!.status, idempotentReplay: true } };
      }
      throw error;
    }
    return { placement, publishStatus, document };
  };
  let outcome: Awaited<ReturnType<typeof insertPost>> | undefined;
  try {
    outcome = await insertPost();
  } finally {
    if (!outcome || 'replay' in outcome) {
      await refundPostQuota(caller.luid, quotaAt).catch((error) => console.error('post_quota_refund_failed', error));
    }
  }
  if ('replay' in outcome) return outcome.replay;
  const { placement, publishStatus, document } = outcome;

  await logEvent({
    userId: caller.luid,
    postId,
    name: publishStatus === 'active' ? 'post_published_active' : 'post_pending_review_created',
    properties: {
      layerCount: (body.editData as { layers: unknown[] }).layers.length,
      placementState: placement.placementState,
      placementQuality: placement.placementQuality,
      nativeProvider: placement.nativeProvider,
      publishStatus,
      multiUserReady: placement.hasPersistentResolver,
    },
    lat,
    lng,
  });

  return { post: serializePost(postId, document), publishStatus, idempotentReplay: false };
});

export const deleteOwnPost = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const postId = (request.data as { postId?: unknown })?.postId;
  if (!isUUID(postId)) throw new HttpsError('invalid-argument', 'Invalid post ID');
  const ref = db.collection('posts').doc(postId.toLowerCase());
  let cloudAnchorId: string | null = null;
  const removed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const post = snap.data()!;
    if (post.creator_id !== caller.luid || post.deleted_at) return false;
    if (!['active', 'pending_review', 'flagged', 'draft'].includes(post.status)) return false;
    cloudAnchorId = typeof post.cloud_anchor_id === 'string' ? post.cloud_anchor_id : null;
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
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new HttpsError('permission-denied', 'post_not_viewable');
    const post = snap.data()!;
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
