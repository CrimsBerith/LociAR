# LociAR Persistent World Lock

LociAR is a **native iOS app** (SwiftUI + ARKit, project generated with `xcodegen`). There is no Expo/React Native layer and no Android build.

## Re-finding a pin: resolution order

When a post is opened, the viewer (`LociAR/Features/AR/ARPostViewerView.swift`) tries, in order:

1. **ARCore Cloud Anchor** (`persistence.kind = arcore_cloud_anchor`): resolved through the ARCore SDK running on the existing ARKit session. Hosted with a 365-day TTL (`ARCoreService.cloudAnchorTTLDays`).
2. **Geospatial pose** (when the post carries a valid `geospatial` pose): usable only when Earth tracking is active and accuracy is at most **5 m horizontal** and **15° yaw** (`GeospatialPose.maximumHorizontalAccuracy` / `maximumYawAccuracy`).
3. **ARKit world map** (`persistence.kind = arkit_world_map`): downloaded from the private `post-world-maps` Storage folder (compressed, capped at 20 MB) and loaded through `initialWorldMap`; the viewer waits for relocalization.
4. **Aim-guided reveal**: if none of the above recognises the place within its timeout, the content is shown approximately and the user is guided to aim at the spot.

Map/geo gets the user near the place; unlock for native posts is distance-first (the create heading is not required).

## Publishing

- The pin is an `ARAnchor` from an ARKit raycast on a tracked plane (centre reticle + "Yüzeye sabitle").
- Publish hosts a Cloud Anchor and then calls **`registerCloudAnchor`** so the backend binds the anchor id to its owner. `createPost` accepts an anchor only if it is registered to the caller and not yet used, and binds it to the post in one transaction. Delete paths remove only an anchor bound to that post; failures go to `cloud_anchor_deletions` and are retried by `cleanupPostMedia`.
- The world map is uploaded to `post-world-maps/{luid}/{postId}/…` (readable by the owner, or by any signed-in user while the post is `active`).
- The server derives `placement_state`, `native_provider` and `resolver_strategy` itself; the client cannot choose them.
- Camera reference frames are not collected (privacy). The Cloud Anchor feature sends visual feature data to Google; this is disclosed in the in-app notice and privacy pages.

## Keyless ARCore authorization (`getArcoreToken`)

The app never holds a Google credential. The callable signs a one-hour JWT with the Functions runtime service account through the IAM Credentials API (needs `roles/iam.serviceAccountTokenCreator` on itself, ARCore API enabled). It requires an active (not suspended or deleted) profile, allows 30 tokens per user per hour, and refunds the slot when signing fails. The app refreshes the token 5 minutes before expiry.

## Acceptance test on physical devices

1. Build and install on an ARKit device.
2. Create a post on a textured wall in good light and wait for publish to finish.
3. Fully terminate the app, move at least 3–5 metres away, reopen it and return to the post.
4. Slowly scan the original wall until the status changes from resolving to ready.
5. Verify the composition stays on the same physical point from front, left and right.
6. Repeat after a device restart and from a second device.
7. Record drift, time-to-resolve, failure state, lighting and device model in `FIELD_TEST_CHECKLIST.md`.

## Known external gates

- ARKit/ARCore relocalization and Cloud Anchor hosting need a physical device and a deployed backend (issue #18).
- Cloud Anchor Management API deletions need the Functions service account to have ARCore management access (see `docs/FIREBASE_SETUP.md`).
