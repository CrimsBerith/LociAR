> **ARŞİV (5 Ekim 2026):** Bu belge Expo/Supabase dönemine aittir ve güncel değildir. Güncel kaynaklar: `AGENTS.md`, `ARCHITECTURE.md`, `docs/FIREBASE_SETUP.md`, `docs/AR_WORLD_LOCK.md`, `docs/release/APP_STORE_SUBMISSION_GUIDE.md`. Sosyal medya bağlantıları (Spotify, YouTube, TikTok, Instagram, Facebook, X), fotoğraf/video ve çizim postları 9 Ekim 2026'da kaldırıldı; postlar metin ve/veya 1 GIPHY GIF'idir. Burada geçen platform adları yalnızca tarihî kayıttır.

# LociAR Frontend ↔ Backend Contract Matrix

**Updated:** 2026-08-09  
**Auth:** Policy A (SMS OFF, owner-confirmed)  
**Status:** Code-audited for online path; hosted E2E still required for PASS on live rows

Legend: **CODE** = verified in repo · **TODO-LIVE** = needs hosted/device evidence

## 1. Environment profiles

| Profile | REMOTE | STORAGE | SMS | VISUAL | DEMO tools | FORCE pending | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| development EAS | true | true | false | true | true | false | CODE `eas.json` |
| preview EAS | true | true | false | true | **false** | true | CODE |
| production EAS | true | true | false | true | **false** | true | CODE |
| simulator EAS | false | false | false | true | true | false | CODE |
| featureFlags store-like | — | — | false default | true | forced false | forced true | CODE `featureFlags.ts` |

| Check | Result | Evidence |
| --- | --- | --- |
| Production SMS off | CODE | `eas.json` production env |
| Production demo tools off | CODE | `eas.json` + `IS_STORE_LIKE_ENV` |
| Mobile bundle no service_role | CODE | `qa-secret-scan` + admin security test |
| `.env.example` documents flags | CODE | `.env.example` |

## 2. Auth → create eligibility (Policy A)

| Client | Server (`create_post`) | Result |
| --- | --- | --- |
| Apple / Google / email verified session | JWT + `creatorIdentityVerified` (email or phone confirmed) | CODE |
| Mockup `demo-miles` / guest | Blocked client-side before invoke | CODE `isLocalDemoIdentity` + `addPost` session check |
| Unauthenticated | 401 Invalid session | CODE edge |
| SMS / phone OTP | Disabled; not required | CODE Policy A |
| Unverified email | 403 identity | CODE edge line ~192 |

## 3. Create post field mapping

| Mobile | Edge / DB | Status |
| --- | --- | --- |
| `pose` | posts.pose JSON | CODE `createPostRemote` body |
| `refImageUri` → HTTPS after upload | ref_image_url | CODE `uploadPostAssets` |
| `editData.layers` + asset URLs | edit_data | CODE |
| `contentSource` | content_source | CODE |
| `caption` max 220 | caption | CODE client sanitize + edge |
| `ageRating` 18_plus | rejected both sides | CODE |
| `visibility` | visibility | CODE |
| placement / resolver / calibration / anchorBundle | columns + JSON | CODE |
| status | **server** `pending_review` (or active if nativeEligible quality path) | CODE edge — do not client-set |
| Mockup cannot set active via remote | client requires live session | CODE |

## 4. Storage

| Asset | Bucket | Status |
| --- | --- | --- |
| Reference | `post-reference-images` | CODE mobile upload paths |
| Layers | `post-layer-assets` | CODE |
| Video | `post-video-assets` | CODE ≤80MB |
| Surface texture | `post-surface-textures` | CODE |
| World map | world-map private bucket | CODE transport helper |
| Cross-user overwrite | policy deny | TODO-LIVE adversarial |
| `file://` not left on visual_surface | `attachVisualReferenceUrls` | CODE + unit test |

## 5. Social

| Action | Path | Status |
| --- | --- | --- |
| Like / comment / save / follow / block / report | `socialService` + store | CODE (remote when configured) |
| Report → moderation_flags only | no client status escalate | CODE intent — TODO-LIVE |
| Block hides posts | store filter | CODE |

## 6. Discovery / nearby

| Query | pending public | active | own pending | Status |
| --- | --- | --- | --- | --- |
| nearby / discover | no (strangers) | yes | yes (creator visibility migration) | CODE migrations; TODO-LIVE |
| Map engagement sort | — | yes | — | CODE map screens |

### Public profile / remote preview

| Path | Visibility boundary | Proximity | Status |
| --- | --- | --- | --- |
| `public_profile_posts(profile_id)` | active + public + non-18+ + blocks both ways | not required | CODE migration + client |
| `public_post_preview(target_post_id)` | active + public + non-18+ + blocks both ways | not required | CODE migration + deep-link fallback |
| `PostPreview` → `AR` | same public post, then camera/Visual Surface rules | required for AR unlock | CODE navigation |
| Surface texture/layers/image/uploaded video/YouTube/Spotify/platform fallback | renderer or explicit external open | not required for preview | CODE + unit tests |

## 7. Admin moderation

| Action | Path | Status |
| --- | --- | --- |
| Approve / remove / trash | `/api/admin/v1/posts/.../moderate` | CODE routes exist |
| Metrics | `/metrics` super admin | CODE |
| Invite | `/users/invite` | CODE |
| Approvals | `/approvals` | CODE |
| aal2 + same-origin + rate limit | security contract tests | CODE 6/6 |
| Hosted admin smoke | — | TODO-LIVE |

## 8. AR resolve

| Condition | Expected | Status |
| --- | --- | --- |
| visual_surface + HTTPS ref | Vision match unlock | CODE module; TODO-LIVE field |
| file:// ref after online create | prevented by upload rewrite | CODE |
| Blank wall recovery | message not silent | CODE prior handoff; TODO-LIVE |
| Multi post top engagement camera | store + AR camera | CODE |
| Sensor-only emergency UX | warning | CODE |

## 9. Delete account

| Step | Status |
| --- | --- |
| Profile UI + `delete_account` edge | CODE |
| Live cascade matches Privacy | TODO-LIVE |

## 10. Golden path online (P11)

| Step | Result |
| --- | --- |
| Sign in Apple/email | TODO-LIVE |
| Pin + publish | TODO-LIVE |
| pending_review | CODE server; TODO-LIVE |
| Admin approve | TODO-LIVE |
| Discover stranger | TODO-LIVE |
| AR unlock | TODO-LIVE field |
| Like/comment/report/block | TODO-LIVE |
| Delete throwaway | TODO-LIVE |

## Code fixes applied 2026-08-06 (online hardening)

1. Remote create requires **live** `getAuthenticatedLociUser()`, not mockup `identityVerified`.  
2. `isLocalDemoIdentity` rejects demo-miles/guest in validation + store.  
3. `enableLocalTestAccess` disabled when remote sync on or demo tools off.  
4. EAS production/preview: SMS false, demo tools false, force pending true.  
5. Unit suite `auth-policy-online.test.ts`.
