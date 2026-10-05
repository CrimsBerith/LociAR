import { anyBlocked } from './moderation';

/**
 * Ported 1:1 from supabase/functions/create_post/index.ts (placement scoring and world-lock
 * evidence). Storage paths keep the Supabase bucket name as the first path segment.
 */
type Persistence = {
  version: number;
  kind: 'arkit_world_map' | 'arcore_cloud_anchor';
  originalNativeAnchorId: string;
  assetUri?: string;
  assetURI?: string;
  referenceImageURI?: string;
  storagePath?: string;
  cloudAnchorId?: string;
  hostedAt: string;
  expiresAt?: string;
};

type PoseAnchor = {
  coordinateSpace: 'camera_free_space' | 'arkit_world' | 'arcore_world' | 'visual_surface' | 'admin_geo_estimate';
  provider?: string | null;
  x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number;
  capturedAt: string;
  nativeAnchorId?: string;
  trackingQuality?: 'unknown' | 'limited' | 'normal';
  surfaceNormal?: { x: number; y: number; z: number };
  physicalRectMeters?: { width: number; height: number };
  persistence?: Persistence;
  /** Google ARCore Geospatial pose captured at pin time (optional, VPS areas only). */
  geospatial?: GeospatialPose;
};

type GeospatialPose = {
  latitude: number;
  longitude: number;
  altitude: number;
  eusQuaternion: number[];
  horizontalAccuracy: number;
  verticalAccuracy: number;
  yawAccuracy: number;
};

/** Must match GeospatialPose thresholds in the iOS client (Domain/Models.swift). */
const GEOSPATIAL_MAX_HORIZONTAL_ACCURACY = 5;
const GEOSPATIAL_MAX_YAW_ACCURACY = 15;
/** ARCore Cloud Anchor ids look like `ua-<hex>`; accept the documented URL-safe alphabet. */
const CLOUD_ANCHOR_ID = /^[A-Za-z0-9_-]{8,128}$/;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isValidGeospatialPose(g: unknown): boolean {
  if (!g || typeof g !== 'object') return false;
  const p = g as GeospatialPose;
  return finite(p.latitude) && Math.abs(p.latitude) <= 90
    && finite(p.longitude) && Math.abs(p.longitude) <= 180
    && finite(p.altitude) && Math.abs(p.altitude) <= 10_000
    && Array.isArray(p.eusQuaternion) && p.eusQuaternion.length === 4 && p.eusQuaternion.every(finite)
    && finite(p.horizontalAccuracy) && p.horizontalAccuracy >= 0 && p.horizontalAccuracy <= GEOSPATIAL_MAX_HORIZONTAL_ACCURACY
    && finite(p.verticalAccuracy) && p.verticalAccuracy >= 0
    && finite(p.yawAccuracy) && p.yawAccuracy >= 0 && p.yawAccuracy <= GEOSPATIAL_MAX_YAW_ACCURACY;
}

/** The hosted Cloud Anchor id of a post body, if it carries a valid one. */
export function cloudAnchorIdOf(body: CreatePostBody): string | null {
  const persistence = body.pose?.anchor?.persistence;
  if (persistence?.kind !== 'arcore_cloud_anchor') return null;
  const id = persistence.cloudAnchorId;
  return typeof id === 'string' && CLOUD_ANCHOR_ID.test(id) ? id : null;
}

export type CreatePostBody = {
  clientMutationId?: string;
  userId?: string;
  pose: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
    heading: number;
    accuracy?: number | null;
    anchor?: PoseAnchor;
  };
  refImageUri: string;
  editData: Record<string, unknown>;
  contentSource?: Record<string, unknown> | null;
  caption: string;
  ageRating: 'all' | '13_plus' | '16_plus' | '18_plus';
  visibility: 'public' | 'friends' | 'private';
  placementState?: string;
  placementQuality?: number;
  resolverStrategy?: string[];
  nativeProvider?: string | null;
  anchorBundle?: Record<string, unknown> | null;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPose(pose: CreatePostBody['pose'] | undefined): boolean {
  const validBase = !!pose
    && typeof pose.latitude === 'number'
    && typeof pose.longitude === 'number'
    && typeof pose.heading === 'number'
    && Math.abs(pose.latitude) <= 90
    && Math.abs(pose.longitude) <= 180
    && pose.heading >= 0
    && pose.heading <= 360;
  if (!validBase) return false;
  if (!pose!.anchor) return true;
  const a = pose!.anchor;
  return typeof a.x === 'number' && typeof a.y === 'number' && typeof a.z === 'number'
    && typeof a.yaw === 'number' && typeof a.pitch === 'number' && typeof a.roll === 'number'
    && typeof a.capturedAt === 'string';
}

function hasValidSurfaceRect(anchor?: PoseAnchor): boolean {
  const rect = anchor?.physicalRectMeters;
  return Boolean(rect && rect.width >= 0.15 && rect.height >= 0.15 && rect.width <= 20 && rect.height <= 20);
}

function hasStrictARKitWorldLockEvidence(body: CreatePostBody): boolean {
  const poseAnchor = body.pose.anchor;
  if (poseAnchor?.coordinateSpace !== 'arkit_world' || !poseAnchor.nativeAnchorId) return false;
  const bundle = body.anchorBundle;
  if (!bundle || bundle.coordinateSpace !== 'arkit_world') return false;
  const nested = bundle.anchor;
  const anchor = (nested && typeof nested === 'object' ? nested : bundle) as Record<string, unknown>;
  const nativeId = String(anchor.id ?? anchor.nativeAnchorId ?? '').toLowerCase();
  const hitSource = anchor.hitSource;
  return nativeId === poseAnchor.nativeAnchorId.toLowerCase()
    && (anchor.pinQuality === 'planeGeometry' || anchor.pinQuality === 'estimatedPlane')
    && (hitSource === 'planeGeometry' || hitSource === 'sceneMesh' || hitSource === 'estimatedPlane')
    && (anchor.trackingQuality === 'normal' || anchor.trackingQuality === 'limited')
    && (anchor.worldMappingStatus === 'limited' || anchor.worldMappingStatus === 'extending' || anchor.worldMappingStatus === 'mapped');
}

/** Posts are text and/or a social media link only; device photos/videos are not accepted. */
/** Hosts per platform. Must match ExternalMediaParser in the iOS client (Domain/Models.swift). */
const SOCIAL_HOSTS: Record<string, string[]> = {
  spotify: ['open.spotify.com', 'spotify.link'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
};
SOCIAL_HOSTS.twitter = SOCIAL_HOSTS.x;

export function isAllowedSocialLink(platform: string, url: unknown): boolean {
  const hosts = SOCIAL_HOSTS[platform];
  if (!hosts || typeof url !== 'string' || url.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port
    && hosts.includes(parsed.hostname.toLowerCase());
}

function layerTexts(body: CreatePostBody): string[] {
  const layers = (body.editData as { layers?: unknown[] })?.layers ?? [];
  return layers.flatMap((raw) => {
    const layer = (raw ?? {}) as Record<string, unknown>;
    return [layer.text, layer.content, layer.title].filter((t): t is string => typeof t === 'string');
  });
}

const ALLOWED_LAYER_TYPES = new Set(['text', 'drawing']);

function contentPolicyError(body: CreatePostBody): string | null {
  if (anyBlocked([body.caption, ...layerTexts(body)])) return 'Content not allowed';
  const layers = (body.editData as { layers?: unknown[] }).layers ?? [];
  for (const raw of layers) {
    const layer = (raw ?? {}) as Record<string, unknown>;
    if (!ALLOWED_LAYER_TYPES.has(String(layer.type ?? layer.kind))) return 'Only text posts and social media links are allowed';
    if (layer.uri != null && layer.uri !== '') return 'Only text posts and social media links are allowed';
  }
  const source = body.contentSource;
  if (source != null) {
    if (typeof source !== 'object') return 'Invalid content source';
    const platform = String(source.platform ?? 'other').toLowerCase();
    const mediaKind = String(source.mediaKind ?? '').toLowerCase();
    const url = source.url;
    if (['image', 'photo', 'video'].includes(mediaKind) || platform === 'own_video') {
      return 'Only text posts and social media links are allowed';
    }
    if (url != null) {
      if (!SOCIAL_HOSTS[platform]) return 'Only social media links are allowed';
      if (!isAllowedSocialLink(platform, url)) return 'Invalid social media link';
    }
  }
  return null;
}

/** Returns an error message or null. Messages match what the iOS client maps to Turkish copy. */
export function validateCreatePostBody(body: CreatePostBody | undefined, luid?: string): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request';
  if (!body.clientMutationId || !UUID_V4.test(body.clientMutationId)) return 'Invalid client mutation ID';
  if (!isValidPose(body.pose)) return 'Invalid pose';
  if (body.pose.accuracy != null && body.pose.accuracy > 100) {
    return `GPS accuracy is too low (${Math.round(body.pose.accuracy)}m)`;
  }
  if (typeof body.caption !== 'string' || !body.caption.trim() || body.caption.length > 220) return 'Invalid caption';
  if (body.ageRating === '18_plus') return '18+ content is disabled in this release';
  if (!['all', '13_plus', '16_plus'].includes(body.ageRating)) return 'Invalid age rating';
  if (!['public', 'friends', 'private'].includes(body.visibility)) return 'Invalid visibility';
  if (typeof body.refImageUri !== 'string' || body.refImageUri.length > 1024
    || !/^(storage|native-ar-reference):\/\//.test(body.refImageUri)) return 'Invalid reference image';
  if (body.refImageUri.startsWith('native-ar-reference://')) {
    if (!['native-ar-reference://none', 'native-ar-reference://pending'].includes(body.refImageUri)) return 'Invalid reference image';
  } else {
    const owned = luid && body.clientMutationId
      ? `storage://post-reference-images/${luid}/${body.clientMutationId.toLowerCase()}/`
      : null;
    if (luid && (!owned || !body.refImageUri.toLowerCase().startsWith(owned.toLowerCase()) || body.refImageUri.includes('..'))) {
      return 'Invalid reference image';
    }
  }
  if ((body.editData as { surfaceTextureUri?: unknown })?.surfaceTextureUri != null) return 'Surface textures are not accepted';
  if ((body.pose.anchor?.coordinateSpace as string | undefined) === 'admin_geo_estimate') return 'Invalid coordinate space';
  const layers = (body.editData as { layers?: unknown })?.layers;
  if (!Array.isArray(layers) || layers.length === 0) return 'At least one edit layer is required';
  if (JSON.stringify(body).length > 400_000) return 'Post payload is too large';
  const policyError = contentPolicyError(body);
  if (policyError) return policyError;
  const anchorPersistence = body.pose.anchor?.persistence;
  if (anchorPersistence?.kind === 'arcore_cloud_anchor' && !cloudAnchorIdOf(body)) return 'Invalid cloud anchor';
  if (body.pose.anchor?.geospatial != null && !isValidGeospatialPose(body.pose.anchor.geospatial)) {
    return 'Invalid geospatial pose';
  }
  if (body.pose.anchor?.coordinateSpace === 'arkit_world' && !hasStrictARKitWorldLockEvidence(body)) {
    return 'Physical AR world lock evidence is incomplete';
  }
  return null;
}

function storageObjectPath(uri: string | undefined, folder: string): string | null {
  const prefix = `storage://${folder}/`;
  if (!uri?.startsWith(prefix)) return null;
  const path = uri.slice(prefix.length);
  return path && !path.includes('..') ? `${folder}/${path}` : null;
}

function nativeWorldMapPath(anchor: PoseAnchor | undefined, luid: string, postId: string): string | null {
  const persistence = anchor?.persistence;
  if (!anchor?.nativeAnchorId || !persistence) return null;
  const locator = persistence.storagePath ?? persistence.assetURI ?? persistence.assetUri;
  const path = storageObjectPath(locator, 'post-world-maps');
  const expected = `post-world-maps/${luid}/${postId}/${anchor.nativeAnchorId.toLowerCase()}.lociarmap`;
  return path?.toLowerCase() === expected ? path : null;
}

function hasValidPersistentResolver(anchor: PoseAnchor | undefined, worldMapObjectExists: boolean): boolean {
  const persistence = anchor?.persistence;
  if (!anchor?.nativeAnchorId || !persistence || persistence.version !== 1) return false;
  if (String(persistence.originalNativeAnchorId).toLowerCase() !== anchor.nativeAnchorId.toLowerCase()) return false;
  if (persistence.expiresAt && Date.parse(persistence.expiresAt) <= Date.now()) return false;
  const validCloudAnchor = persistence.kind === 'arcore_cloud_anchor'
    && typeof persistence.cloudAnchorId === 'string' && CLOUD_ANCHOR_ID.test(persistence.cloudAnchorId);
  // iOS pins live in ARKit world space; they persist either as a world map or as a Cloud Anchor.
  if (anchor.coordinateSpace === 'arkit_world') {
    return (persistence.kind === 'arkit_world_map' && worldMapObjectExists) || validCloudAnchor;
  }
  if (anchor.coordinateSpace === 'arcore_world') return validCloudAnchor;
  return false;
}

function placementQualityForAnchor(anchor: PoseAnchor | undefined, accuracy: number | null | undefined, hasPersistentResolver: boolean): number {
  if (!anchor) return 0;
  if (anchor.coordinateSpace === 'camera_free_space') return Math.min(1, 0.22 + (accuracy != null && accuracy <= 25 ? 0.08 : 0));
  if (anchor.coordinateSpace !== 'arkit_world' && anchor.coordinateSpace !== 'arcore_world') return 0.35;
  let score = 0.5;
  if (anchor.nativeAnchorId) score += 0.16;
  if (anchor.trackingQuality === 'normal') score += 0.14;
  if (anchor.trackingQuality === 'limited') score += 0.03;
  if (anchor.trackingQuality === 'unknown' || !anchor.trackingQuality) score -= 0.03;
  if (hasValidSurfaceRect(anchor)) score += 0.08;
  if (anchor.surfaceNormal) score += 0.04;
  if (hasPersistentResolver) score += 0.1;
  if (accuracy != null && accuracy <= 20) score += 0.02;
  if (accuracy != null && accuracy > 60) score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

function nativeAnchorEligible(anchor: PoseAnchor | undefined, quality: number, hasRelocalizationResolver: boolean): boolean {
  return Boolean(
    anchor
    && (anchor.coordinateSpace === 'arkit_world' || anchor.coordinateSpace === 'arcore_world')
    && anchor.nativeAnchorId
    && anchor.trackingQuality === 'normal'
    && hasValidSurfaceRect(anchor)
    && hasRelocalizationResolver
    && quality >= 0.72,
  );
}

function providerForCoordinateSpace(space?: string): string | null {
  if (space === 'arkit_world') return 'arkit';
  if (space === 'arcore_world') return 'arcore';
  if (space === 'visual_surface') return 'vision';
  if (space === 'admin_geo_estimate') return 'admin';
  return null;
}

function resolverStrategyForCoordinateSpace(space?: string): string[] {
  if (space === 'arkit_world' || space === 'arcore_world') return ['native_anchor', 'geo_pose'];
  if (space === 'visual_surface') return ['reference_image', 'geo_pose'];
  return ['geo_pose'];
}

export type PlacementResult = {
  placementState: string;
  placementQuality: number;
  nativeProvider: string | null;
  resolverStrategy: string[];
  hasPersistentResolver: boolean;
  autoPublishEligible: boolean;
  calibration: Record<string, unknown>;
};

export async function evaluatePlacement(
  body: CreatePostBody,
  luid: string,
  objectExists: (path: string | null) => Promise<boolean>,
): Promise<PlacementResult> {
  const postId = body.clientMutationId!.toLowerCase();
  const anchor = body.pose.anchor;
  const space = anchor?.coordinateSpace;
  // Camera reference frames are no longer collected (privacy; nothing read them back), so the
  // stored world map is the only relocalization resolver.
  const worldMapExists = await objectExists(nativeWorldMapPath(anchor, luid, postId));
  const hasPersistentResolver = hasValidPersistentResolver(anchor, worldMapExists);
  const placementQuality = placementQualityForAnchor(anchor, body.pose.accuracy, hasPersistentResolver);
  const eligible = nativeAnchorEligible(anchor, placementQuality, hasPersistentResolver);
  const placementState = eligible && space === 'arkit_world'
    ? 'arkit_world_locked'
    : eligible && space === 'arcore_world'
      ? 'arcore_world_locked'
      : space === 'arkit_world' || space === 'arcore_world'
        ? 'recalibration_required'
        : space === 'visual_surface'
          ? 'visual_surface_locked'
          : 'free_space_approximate';
  const nativeProvider = providerForCoordinateSpace(space);
  const resolverStrategy = resolverStrategyForCoordinateSpace(space);
  const calibration = anchor
    ? {
      state: placementState,
      nativeAnchorId: anchor.nativeAnchorId ?? null,
      trackingQuality: anchor.trackingQuality ?? (space === 'camera_free_space' ? 'limited' : 'normal'),
    }
    : { state: 'camera_free_space' };
  return {
    placementState,
    placementQuality,
    nativeProvider,
    resolverStrategy,
    hasPersistentResolver,
    autoPublishEligible: eligible && hasPersistentResolver && placementQuality >= 0.72,
    calibration,
  };
}
