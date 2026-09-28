# LociAR Persistent World Lock

## Runtime contract

LociAR ships as a **native iOS app** (local `expo run:ios` or EAS). Expo Go is **not** supported. Android was removed from the product/repo.

Real surface locking runs when:

1. The binary includes `lociar-world-lock` (custom build / dev client / production).
2. `EXPO_PUBLIC_NATIVE_WORLD_LOCK_ENABLED=true` (default).

If the native module is missing or plane raycast fails, the app may store a limited **sensor estimate** only as emergency fallback. That is not a world lock; the post should be recalibrated.

The saved post contains a versioned `pose.anchor.persistence` descriptor. A native session anchor ID without this descriptor is session-local and must be recalibrated.

## iOS: ARKit world map

- A surface pin creates an `ARAnchor` from an ARKit raycast on **any** tracked plane (wall / floor / table / angled) or free-space ~1.4 m in front of the camera.
- Publish requests the current `ARWorldMap`, archives it in Application Support, and stores its local file URI in the descriptor.
- Reopening the post restores the map through `ARWorldTrackingConfiguration.initialWorldMap` and waits for relocalization before attaching the post surface.
- The current file transport supports revisits on the same installation/device. Cross-device discovery requires an authenticated private upload/download path for the world-map asset, or a shared cloud/VPS resolver. World-map files must not be public because they encode a scanned physical environment.

## Multi-perspective + low drift (product bar)

- **Create:** pin creates an ARKit world anchor (plane preferred on any surface; ~1.4 m front-of-camera is still world-tracked, marked limited).
- **Publish (atomic):** re-archive `ARWorldMap` → upload to private `post-world-maps` → set https `persistence.assetUrl` → only then claim `arkit_world_locked` when tracking is normal.
- **Multi-user:** other devices download the signed world-map URL and ARKit relocalizes (`resolveWorldLockForViewer`).
- **Discover:** map/geo gets you near the place. Unlock for native posts is **distance-first** — same create heading is **not** required.
- **View:** ARKit relocalizes the map; content is drawn on the world anchor so left/right/front angles all see the same spot with low drift.
- **Anti-pattern:** GPS + compass screen overlays for native posts (looks like “kayma” when you turn).

Client modules: `src/services/ar/atomicPublish.ts`, `worldMapTransport.ts`, `resolveWorldLock.ts`.

## Acceptance test on physical devices

1. Install a LociAR native iOS build (`npm run ios` or EAS IPA).
2. Create a post on a textured wall in good light and wait for publish to finish.
3. Fully terminate the app, move at least 3-5 metres away, reopen it, and return to the post.
4. Slowly scan the original wall until the status changes from relocalizing/resolving to ready.
5. Verify the composition remains on the same physical point from front, left, and right viewing angles.
6. Repeat after device restart.
7. Record drift, time-to-resolve, failure state, lighting, and device model in `platforms/ios/docs/FIELD_TEST_CHECKLIST.md` or `FIELD_TEST_CHECKLIST.md`.

## Known external gates

- Swift/RealityKit compilation and ARKit relocalization require Xcode or EAS iOS build and a physical ARKit device.
- Same-device iOS persistence is implemented. Cross-device iOS persistence is deliberately not claimed until private asset transport or a common cloud resolver is implemented.
