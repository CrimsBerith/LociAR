> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# LociAR Pre-Deploy Inventory

**Updated:** 2026-08-06  
**Purpose:** Single map of product surface, services, flags, and open gaps for D0→D2.

## 1. Mobile screens

| Screen / surface | Path | Role |
| --- | --- | --- |
| App shell / tabs | `App.tsx` | Navigation, chrome, onboarding gate |
| AR Camera | `src/screens/ARCameraScreen.tsx` | Unlock, embed, engagement |
| Create / Pin | `src/screens/CreateTagScreen.tsx` | Editor + Visual Surface pin + publish |
| Map | `src/screens/map-screen-premium.tsx` (+ `MapScreen.tsx`) | Pins, clusters, open AR |
| Discover | `src/screens/discover-screen-premium.tsx` | Feed/search/filters |
| Activity | `src/screens/activity-screen-premium.tsx` | Events |
| Profile | `src/screens/profile-screen-premium.tsx` | Auth, stats, legal, settings |
| Collections | `src/screens/CollectionsScreen.tsx` | Saves groups |
| Place detail | `src/screens/PlaceDetailScreen.tsx` | Place summary → AR |
| Legacy wrappers | `MapScreen.tsx`, `DiscoverScreen.tsx`, `ProfileScreen.tsx` | Route shims / older entry |

## 2. Shared components (high risk)

| Component | Path | Notes |
| --- | --- | --- |
| Edit composition | `src/components/EditComposition.tsx` | Layers, transforms |
| Native world lock surface | `src/components/NativeWorldLockSurface.tsx` | Native bridge UI |
| Embedded media | `src/components/EmbeddedMediaSurface.tsx` | Platform video/photo on wall |
| AR playback controls | `src/components/ARPlaybackControls.tsx` | Seek/play |
| Comment sheet | `src/components/CommentSheet.tsx` | Social |
| Error boundary | `src/components/ErrorBoundary.tsx` | Crash containment |
| Backend banner | `src/components/BackendStatusBanner.tsx` | Online readiness |

## 3. Services

| Service | Path | Remote dependency |
| --- | --- | --- |
| Auth | `src/services/authService.ts` | Supabase Auth (Apple/Google/email) |
| Posts | `src/services/postService.ts` | Storage + `create_post` |
| Social | `src/services/socialService.ts` | likes/comments/saves/follows/blocks/reports |
| Supabase client | `src/services/supabaseClient.ts` | anon key only |
| AR anchor / resolve | `src/services/ar/*` | Native module + cloud assets |
| Media embed | `src/services/mediaEmbed.ts` | Platform URLs |
| Observability | `src/services/observability.ts` | Sentry optional |
| Backend status | `src/services/backendStatus.ts` | Health flags |
| Store | `src/store/appStore.ts` | Local + remote orchestration |

## 4. Native

| Item | Path |
| --- | --- |
| World-lock module | `modules/lociar-world-lock/` (iOS) |
| Xcode project | `ios/LociAR.xcworkspace` |
| Bundle id | `com.khankartal.lociar` |

## 5. Supabase

### Migrations (apply order)

1. `001_initial_schema.sql`
2. `20260707173645_app_store_mvp_foundation.sql`
3. `20260717120000_production_readiness.sql`
4. `20260719130000_native_surface_capture_android.sql` (historical name; review impact on iOS-only)
5. `20260720110000_anchor_resolver_metadata.sql`
6. `20260720123000_post_video_assets.sql`
7. `20260720160000_world_lock_quality_gate.sql`
8. `20260720170000_surface_texture_bucket.sql`
9. `20260724180000_world_map_bucket.sql`
10. `20260725120000_social_mvp_features.sql`
11. `20260725140000_creator_visibility_and_nearby.sql`
12. `20260726030000_admin_operations_foundation.sql`
13. `20260729201500_service_role_server_grants.sql`
14. `20260729233000_visual_surface_provider.sql`

### Edge functions

| Function | Path | Status |
| --- | --- | --- |
| `create_post` | `supabase/functions/create_post/` | Required for D1 |
| `delete_account` | `supabase/functions/delete_account/` | Required for store privacy |
| `admin_action` | `supabase/functions/admin_action/` | Review vs Next admin APIs |

### Storage buckets (expected)

- `post-reference-images`
- `post-layer-assets`
- `post-video-assets`
- `post-surface-textures`
- world-map bucket (migration `20260724180000`)

Local ports (decision): API `56321`, DB `56322`, Studio `56323`, Mailpit `56324`.

## 6. Admin (Next.js)

| Area | Path |
| --- | --- |
| Login / MFA | `admin/app/login`, `admin/app/admin/mfa` |
| Dashboard | `admin/app/admin/(protected)/dashboard` |
| Posts moderate | `.../posts` + API `api/admin/v1/posts/[postId]/moderate` |
| Metrics | `api/admin/v1/posts/[postId]/metrics` |
| Users invite | `.../users` + `api/admin/v1/users/invite` |
| Approvals | `.../approvals` + API |
| Audit | `.../audit` |
| Security tests | `admin/tests/security-contract.test.mjs` |

## 7. Feature flags (`src/constants/featureFlags.ts`)

| Flag | Default | Production expectation |
| --- | --- | --- |
| `SMS_AUTH_ENABLED` | false | false (Policy A) |
| `REMOTE_POST_SYNC_ENABLED` | false | **true** (EAS production/preview) |
| `STORAGE_UPLOAD_ENABLED` | follows remote | **true** |
| `VISUAL_SURFACE_LOCK_ENABLED` | true | true |
| `NATIVE_WORLD_LOCK_ENABLED` | true | true |
| `DEMO_DEV_TOOLS_ENABLED` | __DEV__ | **false** in store |
| `FORCE_PENDING_REVIEW` | false | optional true for local parity |
| `FIELD_AUTO_ACTIVE_LOCAL` | true | **false** if local creates in store builds |
| Privacy/Terms/Support URLs | example.com | **live host** |

## 8. Automated tests present

- `src/__tests__/*` — ~12 suites (atomic publish, visual surface, world-lock, layout, social, mockup parity, …)
- Admin security contract tests
- Maestro flows: smoke, tabs, create-pin-publish, keyboard-caption, profile-collections-place

## 9. Open gaps (inventory snapshot)

| Gap | Gate | Campaign |
| --- | --- | --- |
| Physical Visual Surface resolve evidence | D1/D2 | P5 |
| Hosted Supabase push | D1 | P10 |
| Live legal URLs | D2 | P7 |
| Production demo tools / flag audit | D1 | P3 |
| Field checklist mostly TODO | D1 | P5 |
| Dirty git tree (single commit) | ops | P0-02 |
| Premium a11y unverified | D2 | P4 |
| Online golden E2E | D1 | P11 |

## 10. Reference visuals

`Loci_AR_Proje_Gorselleri/` — visual source of truth for parity (P4-10).
