// Seeds approved (active) text posts so App Review never sees an empty map.
// Usage: FIREBASE_PROJECT_ID=my-project node scripts/seed-review-content.mjs apple-review@lociar.app
// The review account must exist and have signed in once (so its profile exists).
// Rerunning is safe: post IDs are derived from the account and place, so posts are overwritten.
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { v5 as uuidv5 } from 'uuid';
import { auth, db, luidForUid } from './_admin.mjs';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat, lng, precision = 10) {
  let latR = [-90, 90], lngR = [-180, 180], hash = '', bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    const range = even ? lngR : latR;
    const value = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) { ch = (ch << 1) | 1; range[0] = mid; } else { ch <<= 1; range[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

const PLACES = [
  { lat: 41.0335, lng: 28.9780, caption: 'İstiklal Caddesi · LociAR tanıtım notu' },
  { lat: 41.0256, lng: 28.9744, caption: 'Galata Kulesi manzarası' },
  { lat: 41.0130, lng: 28.9810, caption: 'Gülhane Parkı\'nda mekânsal hikâye' },
  { lat: 41.0422, lng: 29.0083, caption: 'Beşiktaş sahil yürüyüşü' },
  { lat: 37.3349, lng: -122.0090, caption: 'Welcome to LociAR · Apple Park Visitor Center' },
  { lat: 37.3318, lng: -122.0312, caption: 'LociAR demo note · Cupertino' },
  { lat: 37.3230, lng: -122.0322, caption: 'Spatial story sample · Main Street' },
];

// Seed posts bypass createPost, so enforce the same protected-zone hard block here.
const ZONES = JSON.parse(readFileSync(new URL('./zones.json', import.meta.url), 'utf8'));
function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}
for (const place of PLACES) {
  const zone = ZONES.find((z) => distanceMeters(place.lat, place.lng, z.lat, z.lng) <= z.radius_meters);
  if (zone) {
    console.error(`"${place.caption}" is inside protected zone "${zone.name}". Move it and rerun.`);
    process.exit(1);
  }
}

const SEED_NAMESPACE = '0b3f5c2e-8a41-4d7e-9c6b-2f1e7a9d4c35';
const email = (process.argv[2] || '').trim().toLowerCase();
const user = await auth.getUserByEmail(email);
const luid = luidForUid(user.uid);
const profile = await db.collection('profiles').doc(luid).get();
if (!profile.exists) {
  console.error('Profile missing: sign in with this account in the app once, then rerun.');
  process.exit(1);
}
const handle = profile.data().handle;
for (const place of PLACES) {
  const id = uuidv5(`${luid}:${place.lat},${place.lng}`, SEED_NAMESPACE);
  const now = new Date().toISOString();
  const pose = {
    latitude: place.lat, longitude: place.lng, altitude: null, heading: 0, accuracy: 10,
    anchor: { coordinateSpace: 'camera_free_space', provider: 'native_ios_camera', x: 0, y: 0, z: -0.8, yaw: 0, pitch: 0, roll: 0, capturedAt: now.replace(/\.\d{3}Z$/, 'Z'), nativeAnchorId: uuidv5(`${id}:anchor`, SEED_NAMESPACE), trackingQuality: 'normal', surfaceAlignment: 'freeSpace' },
  };
  const editData = { version: 1, canvas: { width: 1080, height: 1920 }, layers: [{ id: uuidv5(`${id}:layer`, SEED_NAMESPACE), type: 'text', text: place.caption, color: '#FFFFFF', opacity: 1, scale: 1, rotation: 0, x: 0, y: 0, zIndex: 0, fontSize: 32 }] };
  await db.collection('posts').doc(id).set({
    id, creator_id: luid, creator_handle: handle, lat: place.lat, lng: place.lng, geohash: geohash(place.lat, place.lng),
    pose_json: JSON.stringify(pose), ref_image_url: 'native-ar-reference://pending', edit_data_json: JSON.stringify(editData),
    content_source_json: null, anchor_bundle_json: null, calibration_json: JSON.stringify({ state: 'free_space_approximate' }),
    caption: place.caption, age_rating: 'all', visibility: 'public', status: 'active',
    placement_state: 'free_space_approximate', placement_quality: 0.3, resolver_strategy: ['geo_pose'], native_provider: null,
    multi_user_ready: false, views_count: 0, likes_count: 0, comments_count: 0, saves_count: 0, engagement_score: 0,
    client_mutation_id: id, deleted_at: null, seeded_for_review: true,
    created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
  });
  console.log('Seeded', id, place.caption);
}
