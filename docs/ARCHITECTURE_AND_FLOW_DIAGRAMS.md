> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

ben # LociAR Architecture and Flow Diagrams

Updated: 2026-08-09  
Scope: iOS user app, Supabase backend, web/mobile admin, native Visual Surface/ARKit bridge  
Source of truth: current repository code and migrations. Dashed nodes are planned or externally gated.

## 1. User Flow Diagram

```mermaid
flowchart TD
  Launch["Launch native iOS app"] --> Bootstrap["Hydrate cache + restore auth + sync pending"]
  Bootstrap --> Onboarding{"Onboarding completed?"}
  Onboarding -- No --> Intro["Value intro; no permission prompts"] --> Explore
  Onboarding -- Yes --> Explore["Explore feed — permission-free home"]

  Explore --> Map["Map"]
  Explore --> Activity["Activity"]
  Explore --> OwnProfile["Own profile"]
  Explore --> CameraIntent{"Explicit Camera tab / AR CTA / camera link?"}
  CameraIntent -- Yes --> Permission["Explain value + request camera permission"]
  Permission --> Camera["Camera / AR hub"]
  Camera --> Create["Create / edit / pin"]

  Explore --> PublicProfile["Other creator profile"]
  Map --> Place["Place detail"]
  Activity --> Preview["Public post preview"]
  PublicProfile --> Preview
  Place --> Preview

  Preview --> Anywhere["View public media anywhere"]
  Preview --> ARChoice{"View in AR?"}
  ARChoice -- No --> Preview
  ARChoice -- Yes --> Proximity["Travel + camera + proximity/alignment"]
  Proximity --> Unlock{"Visual Surface resolved?"}
  Unlock -- Yes --> ARContent["World-locked post + social actions"]
  Unlock -- No --> Recovery["Distance / framing / permission recovery"] --> Proximity

  Create --> Identity{"Live verified identity?"}
  Identity -- No --> SignIn["Apple / Google / email magic link"] --> Create
  Identity -- Yes --> Capture["Capture detailed surface"]
  Capture --> Compose["Image / drawing / text / video / platform media"]
  Compose --> Publish["Upload assets + create_post"]
  Publish --> Review["pending_review"]
  Review -->|Admin approves| Active["active + discoverable"]
  Review -->|Admin rejects/removes| Hidden["Not public"]
```

## 2. Wireflow Diagram

```mermaid
flowchart LR
  Launch["NORMAL LAUNCH"] --> Explore
  subgraph Tabs["Persistent tab shell"]
    Cam["CAMERA\nreticle · modes · shutter"]
    Map["MAP\nclusters · selected surface"]
    Explore["EXPLORE\nsearch · filters · cards"]
    Activity["ACTIVITY\ninteractions · nearby"]
    Profile["PROFILE\nposts · map · collections"]
  end

  Explore -->|"tap creator"| Creator["PUBLIC PROFILE\nidentity · follow · public grid"]
  Explore -->|"tap post card"| Preview["POST PREVIEW\nauthor · composed surface · media · actions"]
  Map --> Place["PLACE DETAIL\nlocation · posts · AR CTA"]
  Place --> Preview
  Creator --> Preview
  Profile --> Preview
  Activity --> Preview
  Preview -->|"Go to location / View in AR"| Cam
  Explore -->|"Camera tab"| Cam
  Cam -->|"Create mode"| Editor["CREATE\ncapture → edit → pin → publish"]
  Profile --> Collections["COLLECTIONS\nsaved posts · private groups"]
```

## 3. Task Flow Diagram — Browse Another User's Public Post

```mermaid
flowchart TD
  Start["Tap creator handle"] --> Route["Navigate PublicProfile with creatorId + handle"]
  Route --> Blocked{"Creator locally blocked?"}
  Blocked -- Yes --> Stop["Profile unavailable"]
  Blocked -- No --> Cache["Render eligible cached posts"]
  Cache --> RPC["public_profile_posts RPC"]
  RPC --> Gate{"active + public + non-18+ + not blocked both ways?"}
  Gate -- No --> Empty["No public posts"]
  Gate -- Yes --> Merge["Merge by post ID into Zustand + AsyncStorage"]
  Merge --> Grid["Render public post grid"]
  Grid --> Open["Open PostPreview"]
  Open --> Resolve["Local post first; otherwise public_post_preview RPC"]
  Resolve --> Format{"Post format"}
  Format --> Layers["Drawing / text / image layers"]
  Format --> Texture["Raster surface texture"]
  Format --> FirstVideo["Uploaded video player"]
  Format --> YouTube["YouTube embed"]
  Format --> Spotify["Spotify embed"]
  Format --> Restricted["TikTok / Instagram / Facebook / X fallback"]
  Restricted --> Original["Open original platform URL"]
  Layers --> Preview
  Texture --> Preview["Location-independent preview"]
  FirstVideo --> Preview
  YouTube --> Preview
  Spotify --> Preview
  Original --> Preview
  Preview --> OptionalAR["Optional physical AR flow"]
```

## 4. App Map / Information Architecture

```mermaid
flowchart TD
  App["LociAR"]
  App --> UserApp["User iOS app"]
  App --> Admin["Administration"]
  App --> Platform["Platform services"]

  UserApp --> CoreTabs["Core tabs"]
  CoreTabs --> Camera["Camera / AR"]
  CoreTabs --> Map["Map"]
  CoreTabs --> Explore["Explore"]
  CoreTabs --> Activity["Activity"]
  CoreTabs --> Profile["Profile"]

  UserApp --> Fullscreen["Full-screen routes"]
  Fullscreen --> Create["CreateTag"]
  Fullscreen --> Place["PlaceDetail"]
  Fullscreen --> Collections["Collections"]
  Fullscreen --> PublicProfile["PublicProfile"]
  Fullscreen --> PostPreview["PostPreview"]

  Profile --> Account["Auth · appearance · deletion"]
  Camera --> ARResolve["Visual Surface · ARKit compatibility · geo fallback"]
  Create --> Composition["Gallery · note · drawing · social media"]

  Admin --> WebAdmin["Next.js admin"]
  Admin --> MobileAdmin["Private iOS admin"]
  WebAdmin --> Moderation["Posts · flags · users · approvals · audit"]
  MobileAdmin --> Operations["MFA · review queue · campaigns · push token"]

  Platform --> Supabase["Auth · Postgres/PostGIS · Storage · Edge Functions"]
  Platform --> ExternalMedia["YouTube · Spotify · TikTok · Instagram · Facebook · X"]
  Platform --> Observability["Sentry + analytics events"]
```

## 5. Application State Diagram

```mermaid
stateDiagram-v2
  [*] --> Booting
  Booting --> HydratingCache
  HydratingCache --> RestoringSession
  RestoringSession --> ReplayingPending
  ReplayingPending --> ExploreReady
  ReplayingPending --> OfflineReady: backend unavailable

  ExploreReady --> GuestBrowsing: no live session
  ExploreReady --> Authenticated: verified session
  ExploreReady --> DemoFieldMode: development-only explicit action
  OfflineReady --> ExploreReady: connection restored + refresh

  GuestBrowsing --> Authenticated: Apple / Google / email callback
  Authenticated --> GuestBrowsing: sign out
  DemoFieldMode --> GuestBrowsing: exit demo

  Authenticated --> Creating
  DemoFieldMode --> Creating
  Creating --> Draft
  Draft --> Uploading
  Uploading --> PendingReview: server accepted
  Uploading --> QueuedOffline: transient failure
  Uploading --> CreateError: auth / validation / protected zone
  QueuedOffline --> Uploading: replay
  PendingReview --> Active: admin approval
  PendingReview --> Removed: rejection / moderation

  ExploreReady --> PublicPreview
  GuestBrowsing --> PublicPreview
  Authenticated --> PublicPreview
  ExploreReady --> CameraIntent: explicit Camera tab or camera deep link
  PublicPreview --> CameraIntent: explicit View in AR
  CameraIntent --> CameraPermission: camera not determined
  CameraIntent --> ARSeeking: permission already granted
  CameraPermission --> ARSeeking: granted
  CameraPermission --> CameraRecovery: denied
  CameraRecovery --> ExploreReady: continue without camera
  ARSeeking --> ARResolved: proximity + visual match
  ARSeeking --> ARRecovery: permission / distance / tracking failure
  ARRecovery --> ARSeeking: retry
  ARResolved --> PublicPreview: exit camera
```

State ownership:

- Zustand: posts, current user, loading, pending sync, saves, follows, blocks, likes, local analytics.
- Component state: route-specific loading, selected tabs/filters, camera permissions, AR resolver, editor draft, media playback.
- AsyncStorage: durable cache and offline queue.
- Supabase: authoritative online identity, content, moderation, social graph, storage, audit.

## 6. Navigation Flowchart

```mermaid
flowchart LR
  ColdLaunch["Normal cold/warm launch"] --> Discover
  AR["AR"] <--> Home["Home / Map"]
  Home <--> Discover["Discover"]
  Discover <--> Activity["Activity"]
  Activity <--> Profile["Profile"]
  Profile <--> AR

  AR --> Create["Create (hidden tab route)"]
  Home --> PlaceDetail["PlaceDetail (hidden)"]
  Profile --> Collections["Collections (hidden)"]
  Discover --> PublicProfile["PublicProfile (hidden)"]
  AR --> PublicProfile
  PlaceDetail --> PublicProfile
  PublicProfile --> PostPreview["PostPreview (hidden)"]
  Discover --> PostPreview
  PlaceDetail --> PostPreview
  Activity --> PostPreview
  Profile --> PostPreview
  PostPreview --> AR

  Create -->|"publish success"| Profile
  Create -->|"open in AR"| AR
  PublicProfile -->|"back"| Discover
  PostPreview -->|"back"| Previous["Previous route"]
```

Invariant: hidden routes own their full-screen chrome; the floating tab bar is not rendered over Create, PlaceDetail, Collections, PublicProfile, or PostPreview.

Launch invariant: `Discover` is the normal initial route. `AR` is reached only by an explicit Camera tab/AR CTA action or the intentional `lociar://camera` deep link.

## 7. Deep Linking Mapping

```mermaid
flowchart LR
  Scheme["lociar://"] --> Camera["camera → AR"]
  Scheme --> Map["map → Home"]
  Scheme --> Explore["explore → Discover"]
  Scheme --> Activity["activity → Activity"]
  Scheme --> Profile["profile → own Profile"]
  Scheme --> Creator["profile/:creatorId → PublicProfile"]
  Scheme --> Post["post/:postId → PostPreview"]
  Scheme --> Create["create → Create"]
  Scheme --> Place["place → PlaceDetail"]
  Scheme --> Collections["collections → Collections"]
  Scheme --> Auth["auth/callback → Supabase session exchange"]
```

Deep-link rules:

- Route parameters stay JSON-serializable; stable IDs are canonical.
- `PostPreview` fetches through `public_post_preview` when the post is absent from cache.
- A private, unapproved, removed, 18+, or block-conflicting post resolves to “Post unavailable.”
- Auth callback accepts PKCE `code` or access/refresh tokens, then restores the application session.
- A `lociar://camera` cold start is treated as explicit user intent; an ordinary icon launch never resolves to `AR`.

## 8. Error Handling and Edge Case Flow

```mermaid
flowchart TD
  Action["User action"] --> Validate["Local precondition validation"]
  Validate -->|"invalid"| Inline["Inline/alert recovery message"]
  Validate -->|"valid"| Remote["Remote/native operation"]
  Remote --> Result{"Result type"}

  Result -->|"success"| Commit["Commit state + cache + analytics"]
  Result -->|"transient network"| Queueable{"Queueable create?"}
  Queueable -- Yes --> Queue["Persist pendingSync + offline placeholder"]
  Queueable -- No --> Rollback["Rollback optimistic mutation"]
  Result -->|"401 / no session"| SignIn["Request verified sign-in"]
  Result -->|"403 policy / protected zone"| HardStop["Do not queue; explain policy"]
  Result -->|"404 / hidden / blocked"| Unavailable["Safe unavailable state"]
  Result -->|"media embed rejected"| Fallback["Thumbnail/title + open original"]
  Result -->|"camera/location denied after explicit action"| Settings["Explain need; retry, Settings, or permission-free Explore"]
  Result -->|"AR match low confidence"| Reframe["Distance/framing/tracking guidance"]
  Result -->|"unexpected render error"| Boundary["ErrorBoundary recovery UI"]

  Queue --> Retry["Replay after hydration/connectivity"]
  Retry --> Remote
  Rollback --> Inline
  Reframe --> Remote
```

Required behavior: startup and onboarding never trigger camera/location permission; no false-success state for failed like/comment/save/follow mutations; no blank media panel; no silent AR resolver failure; permanent policy failures never enter the offline queue.

## 9. System Architecture Diagram

```mermaid
flowchart TB
  subgraph IOS["iOS user app — Expo SDK 54 / React Native 0.81"]
    UI["Screens + components"]
    Store["Zustand application store"]
    Services["Auth · post · social · media · observability"]
    Cache["AsyncStorage cache + queue"]
    Native["lociar-world-lock Swift module\nVision + ARKit compatibility"]
    UI --> Store --> Services
    Store <--> Cache
    UI <--> Native
  end

  subgraph AdminClients["Admin clients"]
    Web["Next.js web admin"]
    AdminIOS["Private Expo iOS admin"]
  end

  subgraph Supabase["Supabase boundary"]
    Auth["Auth\nApple · Google · email"]
    Data["Postgres + PostGIS + RLS"]
    Storage["Public media + private world maps"]
    Edge["Edge Functions\ncreate_post · delete_account · admin_action"]
  end

  Services --> Auth
  Services --> Data
  Services --> Storage
  Services --> Edge
  Native --> Storage
  Web --> Auth
  Web --> Data
  AdminIOS --> Auth
  AdminIOS --> Edge
  Edge --> Data
  Edge --> Storage

  Media["External media platforms"] --> UI
  Services -->|"errors and traces"| Sentry["Sentry"]
  ExpoPush["Expo Push Service"] -. "admin token registered; sender worker deferred" .-> AdminIOS
```

Security boundaries:

- Mobile receives only the Supabase anon key; service-role remains server-side.
- Public profile RPCs expose only moderated public safe content and enforce blocks in both directions.
- Admin writes require authenticated owner/moderator permissions, MFA `aal2`, rate limits, reason/idempotency, and audit.

## 10. UML Sequence Diagram — Public Profile and Post Preview

```mermaid
sequenceDiagram
  actor Viewer
  participant Explore as Explore/AR/Place UI
  participant Profile as PublicProfileScreen
  participant Store as Zustand + AsyncStorage
  participant Service as postService
  participant DB as Supabase RPC/Postgres
  participant Preview as PostPreviewScreen
  participant Media as Media renderer/platform

  Viewer->>Explore: Tap creator handle
  Explore->>Profile: navigate(creatorId, handle)
  Profile->>Store: select cached eligible posts + blockedIds
  Profile->>Service: getPublicCreatorPostsRemote(creatorId)
  Service->>DB: public_profile_posts(profile_id)
  DB->>DB: active/public/age/block checks
  DB-->>Service: allowed post rows
  Service->>DB: public profile handles + public comments
  DB-->>Service: handle/comment data
  Service-->>Profile: hydrated posts
  Profile->>Store: mergePosts(posts)
  Store->>Store: deduplicate, block filter, persist cache
  Profile-->>Viewer: Render public grid

  Viewer->>Profile: Tap post
  Profile->>Preview: navigate(postId, serializable post)
  Preview->>Store: prefer freshest cached post
  Preview->>Preview: canPreviewPost policy
  Preview->>Media: render texture/layers/media
  alt Embedded playback supported
    Media-->>Viewer: Inline image/video/audio
  else Platform restriction or embed failure
    Media-->>Viewer: Fallback + Open original
  end
  opt Viewer chooses physical AR
    Viewer->>Preview: View in AR
    Preview->>Explore: navigate AR(targetPostId)
  end
```

## 11. Data Flow Diagram (DFD)

```mermaid
flowchart LR
  Viewer["Viewer / creator"] -->|"gestures, auth, media, location"| Mobile(("LociAR iOS"))
  Mobile -->|"cached posts, preferences, queue"| Local[("AsyncStorage")]
  Local -->|"hydrate/offline data"| Mobile

  Mobile -->|"session"| Auth(("Supabase Auth"))
  Auth -->|"JWT/user"| Mobile
  Mobile -->|"RPC/select/social mutations"| DB[("Postgres + PostGIS")]
  DB -->|"RLS-filtered rows"| Mobile
  Mobile -->|"media/world-map upload"| Storage[("Supabase Storage")]
  Storage -->|"public/signed URLs"| Mobile
  Mobile -->|"validated create/delete"| Edge(("Edge Functions"))
  Edge -->|"server-authorized writes"| DB
  Edge -->|"asset metadata"| Storage

  Admin["Admin"] -->|"MFA + moderation"| AdminAPI(("Admin API / admin_action"))
  AdminAPI -->|"RBAC, audit, approval"| DB
  DB -->|"review queue / audit"| Admin

  Platforms["Media platforms"] -->|"embed/thumbnail/player"| Mobile
  Mobile -->|"analytics/error events"| Telemetry[("Analytics + Sentry")]
```

## 12. API Integration Map

```mermaid
flowchart TD
  Mobile["Mobile services"] --> Auth["Supabase Auth API"]
  Mobile --> RPC["Postgres RPC"]
  Mobile --> Tables["RLS table API"]
  Mobile --> Storage["Storage API"]
  Mobile --> Functions["Edge Functions"]
  Mobile --> External["External media URLs"]

  Auth --> AuthOps["getUser · OTP · OAuth · Apple ID token · set/exchange session · signOut"]
  RPC --> Nearby["nearby_posts · nearby_ar_posts · my_posts"]
  RPC --> Public["public_profile_posts · public_post_preview"]
  RPC --> Safety["protected_zone_check"]
  Tables --> Social["comments · likes · saves · follows · blocks · collections · activity_events"]
  Tables --> Analytics["analytics_events · moderation_flags"]
  Storage --> Buckets["reference · layers · textures · videos · world maps"]
  Functions --> Create["create_post"]
  Functions --> Delete["delete_account"]
  Functions --> Admin["admin_action"]
  External --> Playback["YouTube · Spotify · TikTok · Instagram · Facebook · X · uploaded video"]
```

API result policy:

- Reads: safe empty state for offline/schema-unavailable discovery; security-sensitive preview RPCs fail closed.
- Creates: only transient failures queue; auth, validation, policy, rate-limit, and protected-zone failures surface immediately.
- Social mutations: optimistic UI must rollback when the authoritative remote mutation fails.
- Media: inline playback when supported; explicit external fallback otherwise.

## 13. Push Notification Logic Flow

```mermaid
flowchart TD
  subgraph Implemented["Implemented: private admin app"]
    Login["Owner signs in"] --> MFA["TOTP reaches aal2"]
    MFA --> Device{"Physical iOS device?"}
    Device -- No --> Skip["Skip registration"]
    Device -- Yes --> Permission{"Notification permission granted?"}
    Permission -- No --> Skip
    Permission -- Yes --> Token["Expo getExpoPushTokenAsync(projectId)"]
    Token --> Register["admin_action: register_push_token"]
    Register --> Verify["JWT + owner role + aal2 + token format"]
    Verify --> Tokens[("admin_device_tokens")]
    Verify --> Audit[("admin_audit_log")]
  end

  subgraph Planned["Deferred after 1.0: push delivery worker"]
    Event["Moderation / system event"] -.-> Worker["Server-side notification worker"]
    Worker -.-> Active["Select active device tokens"]
    Active -.-> Expo["Expo Push Service"]
    Expo -.-> APNs["APNs"]
    APNs -.-> AdminDevice["Admin iPhone"]
    Expo -.-> Receipt["Receipt/error processing"]
    Receipt -.-> Disable["Deactivate invalid tokens"]
  end
```

Current truth: token registration exists for the private admin iOS app. A production sender/receipt worker and end-user push notifications are explicitly deferred; activity feed records are in-app notifications, not APNs delivery.

## 14. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : owns
  PROFILES ||--o{ POSTS : creates
  PROFILES ||--o{ COMMENTS : writes
  POSTS ||--o{ COMMENTS : receives
  PROFILES ||--o{ LIKES : gives
  POSTS ||--o{ LIKES : receives
  PROFILES ||--o{ POST_SAVES : saves
  POSTS ||--o{ POST_SAVES : saved_as
  PROFILES ||--o{ FOLLOWS : follower
  PROFILES ||--o{ FOLLOWS : following
  PROFILES ||--o{ USER_BLOCKS : blocker
  PROFILES ||--o{ USER_BLOCKS : blocked
  PROFILES ||--o{ COLLECTIONS : owns
  COLLECTIONS ||--o{ COLLECTION_ITEMS : contains
  POSTS ||--o{ COLLECTION_ITEMS : collected
  PROFILES ||--o{ ACTIVITY_EVENTS : recipient
  POSTS o|--o{ ACTIVITY_EVENTS : concerns
  PROFILES o|--o{ ANALYTICS_EVENTS : emits
  POSTS o|--o{ ANALYTICS_EVENTS : measured
  POSTS ||--o{ MODERATION_FLAGS : flagged
  PROFILES o|--o{ MODERATION_FLAGS : reports
  PROFILES ||--o{ USER_ROLES : assigned
  PROFILES ||--o{ CAMPAIGNS : owns
  CAMPAIGNS ||--o{ CAMPAIGN_LOCATIONS : targets

  PROFILES {
    uuid id PK
    text handle UK
    boolean identity_verified
    text preferred_language
  }
  POSTS {
    uuid id PK
    uuid creator_id FK
    geography location
    jsonb pose
    jsonb edit_data
    jsonb content_source
    text status
    text visibility
    text age_rating
    integer views_count
    integer likes_count
    integer comments_count
  }
  COMMENTS {
    uuid id PK
    uuid post_id FK
    uuid user_id FK
    text text
  }
  LIKES {
    uuid post_id PK_FK
    uuid user_id PK_FK
  }
  POST_SAVES {
    uuid user_id PK_FK
    uuid post_id PK_FK
  }
  FOLLOWS {
    uuid follower_id PK_FK
    uuid following_id PK_FK
  }
  USER_BLOCKS {
    uuid blocker_id PK_FK
    uuid blocked_id PK_FK
  }
  COLLECTIONS {
    uuid id PK
    uuid owner_id FK
    text visibility
  }
  COLLECTION_ITEMS {
    uuid collection_id PK_FK
    uuid post_id PK_FK
  }
  ACTIVITY_EVENTS {
    uuid id PK
    uuid recipient_id FK
    uuid post_id FK
    text kind
  }
  MODERATION_FLAGS {
    uuid id PK
    uuid post_id FK
    uuid user_id FK
    text status
  }
  PROTECTED_ZONES {
    uuid id PK
    geography center
    integer radius_meters
    text policy
  }
  CAMPAIGNS {
    uuid id PK
    uuid owner_id FK
    text status
    jsonb template
  }
  CAMPAIGN_LOCATIONS {
    uuid id PK
    uuid campaign_id FK
    geography location
    text status
  }
```

Admin-operation entities extend this core model: `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_role_assignments`, `admin_sessions`, `admin_rate_limits`, `admin_approval_requests`, `admin_metric_changes`, `admin_user_invites`, `user_enforcements`, `admin_audit_log`, and `admin_device_tokens`.

## 15. Local Caching and Sync Logic Flow

```mermaid
flowchart TD
  Launch["App launch"] --> Parallel["Promise.all AsyncStorage reads"]
  Parallel --> Posts["posts cache"]
  Parallel --> User["current user"]
  Parallel --> Events["analytics events"]
  Parallel --> Pending["pending create queue"]
  Parallel --> Likes["liked IDs"]
  Parallel --> Demo["demo field flag"]
  Posts --> Hydrate["Validate arrays; seed only in local demo builds"]
  User --> Hydrate
  Events --> Hydrate
  Pending --> Hydrate
  Likes --> Hydrate
  Demo --> Hydrate

  Hydrate --> StoreGate{"Store-like environment?"}
  StoreGate -- Yes --> Sanitize["Force guest for demo identity; remove seed-* catalog"]
  StoreGate -- No --> Online
  Sanitize --> Online{"Remote sync enabled + configured?"}
  Online -- No --> SocialLocal["Load local saves/follows/blocks"]
  Online -- Yes --> RemoteReads["nearby_posts + my_posts + remote social sets"]
  RemoteReads --> Merge["Merge by stable ID; remote wins; sort newest"]
  Merge --> BlockFilter["Filter locally blocked creators"]
  SocialLocal --> BlockFilter
  BlockFilter --> Ready["Set Zustand ready"]
  Ready --> Replay["Replay pending create actions"]

  Replay --> Attempt{"create_post succeeds?"}
  Attempt -- Yes --> Replace["Replace matching offline placeholder; persist"]
  Attempt -- No --> Keep["Keep action for next replay"]

  Ready --> PublicFetch["Public profile RPC"]
  PublicFetch --> PublicMerge["mergePosts: dedupe + block filter + persist"]

  Ready --> Mutation["Like / comment / save / follow"]
  Mutation --> Optimistic["Optimistic state/local write"]
  Optimistic --> RemoteMutation{"Authoritative remote result"}
  RemoteMutation -- Success --> Finalize["Keep state + analytics/activity"]
  RemoteMutation -- Failure --> Rollback["Restore previous Zustand + AsyncStorage; show error"]

  Ready --> Create["Create post"]
  Create --> CreateResult{"Failure class"}
  CreateResult -- "transient/offline" --> Queue["Persist pendingSync + pending placeholder"]
  CreateResult -- "permanent/policy/auth" --> Surface["Throw; no queue"]
```

Cache keys:

- `lociar_posts_v4_mockup`
- `lociar_current_user_v4_mockup`
- `lociar_events_v1`
- `lociar_pending_sync`
- `lociar_liked_posts_v1`
- `lociar_demo_field_mode_v1`
- `lociar_saved_posts_v1`, `lociar_follows_v1`, `lociar_blocks_v1`, `lociar_collections_v1`
- theme and onboarding preference keys

## Cross-Layer Invariants

1. Remote preview and physical AR unlock are separate capabilities.
2. Other-user profile content is `active + public + non-18+` only and is block-aware in both directions.
3. Own pending/private safe content may be previewed locally by its creator but never returned by public preview RPCs.
4. Stable UUIDs drive data access; display handles are metadata, not authorization identifiers.
5. The mobile client never owns moderation authority or a service-role key.
6. Media must render inline or expose an explicit external fallback; blank surfaces are failures.
7. Transient create failures may queue. Permanent auth, validation, moderation, age, or protected-zone failures must fail immediately.
8. Optimistic social state rolls back when the authoritative remote write fails.
9. Cache merge is ID-based, block-filtered, and deterministic.
10. Push delivery is not claimed until a server sender and receipt processor exist.
11. Normal launch is Explore-first and permission-free; camera/location access follows an explicit user action.
12. Store-like startup never presents a mock identity or bundled seed catalog as production data.

## 16. Permission-Safe Launch Contract

```mermaid
flowchart TD
  Icon["App icon / ordinary launch"] --> Boot["Bootstrap + cache/session restore"]
  Boot --> FirstRun{"Onboarding complete?"}
  FirstRun -- No --> Intro["Three value slides; no permission APIs"]
  FirstRun -- Yes --> Explore["Discover / Explore"]
  Intro --> Explore

  Explore --> Intent{"Explicit camera intent?"}
  Intent -- No --> Browse["Browse previews, profiles, activity, map fallback"]
  Intent -- "Camera tab / View in AR / lociar://camera" --> Explain["Contextual benefit and safety copy"]
  Explain --> Permission{"Camera permission"}
  Permission -- Granted --> Mount["Mount CameraView / start AR session"]
  Permission -- Denied --> Recovery["Settings + retry + Continue exploring"]
  Recovery --> Explore
```

Acceptance contract:

- On a clean install, completing or skipping onboarding displays `screen-explore`; no camera/location system sheet appears.
- On a returning ordinary launch, `Discover` is selected and the lazy `ARCameraScreen` is not mounted.
- Camera starts only after the Camera tab, a `View in AR` CTA, or the explicit camera deep link.
- Denial always returns a usable permission-free route; it never creates a blank camera surface or launch loop.
- Preview/production starts with a guest identity and remote/cache content only; development demo data remains opt-in tooling.

## 17. Architecture Gap Register

```mermaid
flowchart TD
  Release["Production-ready LociAR"]
  Release --> Security["Security and privacy"]
  Release --> Navigation["Navigation and deep links"]
  Release --> Data["Data and synchronization"]
  Release --> Media["Media safety and playback"]
  Release --> Operations["Operations and evidence"]

  Security --> G1["P0: Apply public-preview migration and hosted adversarial tests"]
  Security --> G2["P0: Enforce two-way blocks on every public post read path"]
  Security --> G3["P0: Require live identity for online social mutations"]
  Navigation --> G4["P1: Root native stack over the five-tab shell"]
  Navigation --> G5["P1: Typed routes, auth callback route, universal links"]

  Data --> G6["P1: User-scoped cache keys and complete account/reset cleanup"]
  Data --> G7["P1: Typed/idempotent queue with retry, backoff, and dead-letter state"]
  Data --> G8["P2: Pagination, cache eviction, creator/comment batching"]
  Data --> G16["P1: Public profile projection and real profile metadata"]

  Media --> G9["P0: HTTPS/platform allowlist and WebView navigation policy"]
  Media --> G10["P1: Physical-device matrix for every supported post format"]

  Operations --> G11["P0: Hosted golden-path and physical Visual Surface evidence"]
  Operations --> G12["P2: Push sender, receipts, invalid-token cleanup"]
  Operations --> G13["P2: Production dashboards, alerts, and sync health metrics"]
```

### Gap status after implementation

| ID | Priority | Architecture area | Current gap | Required completion | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| G1 | P0 | Backend / database | **Local closed; hosted pending.** Preview/profile/idempotency migrations are applied and local smoke-tested. | Deploy the same ordered migrations to staging/production. | Anonymous and authenticated RPC tests pass against hosted staging. |
| G2 | P0 | Security / DFD | **Closed locally.** One block-aware predicate now governs public post RLS, comments, nearby reads, and preview RPCs. | Re-run the adversarial matrix on hosted staging. | A blocks B and B blocks A return no cross-user posts/comments from every endpoint. |
| G3 | P0 | State / API | **Closed.** Online social mutations require a live verified Supabase identity before local mutation. | Keep auth-policy regression tests in the release gate. | Guest action has no local success; authenticated action persists remotely. |
| G4 | P1 | Navigation / wireflow | **Closed.** A typed root native stack now owns full-screen routes over the five-tab shell. | Complete physical back-gesture/device verification. | Back gestures, tab state retention, modal chrome, and direct links behave consistently. |
| G5 | P1 | Deep linking | Route names/params are untyped; only the custom scheme is configured; `auth/callback` is created by auth code but not represented in the navigation map. | Define a typed root param list, explicit auth callback handler, associated-domain/universal-link mapping, invalid-ID parsing, and cold/warm-start tests. | Custom and universal links pass cold-start, foreground, expired-session, invalid-ID, and auth callback tests. |
| G6 | P1 | Local storage / ERD | **Closed for social state.** Saves, follows, blocks, likes, collections, and queues are user-scoped; account deletion clears the scope. | Extend the same contract if new private caches are introduced. | Automated account-isolation test plus reset/delete key audit. |
| G7 | P1 | Sync logic | **Core closed.** Queue items are typed/versioned/user-scoped, use a UUID idempotency key, exponential retry metadata, exact placeholder IDs, and dead-letter state. | Add a user-facing retry/discard panel for dead letters. | Edge smoke proves an idempotent replay returns the same post. |
| G8 | P2 | Performance / data | Public profiles load a fixed batch; global cache grows without eviction; handle/comment hydration adds extra requests; collections perform item N+1 reads. | Add cursor pagination, bounded normalized cache, batched profile/comment payloads, and collection aggregation RPC/view. | Large-account profiling meets documented latency/memory/query-count budgets. |
| G9 | P0 | Media / security | **Closed in code.** HTTPS/provider allowlists, credential rejection, WebView navigation interception, popup blocking, and external-leave confirmation are active. | Complete real-device provider playback matrix. | Malicious scheme/host tests pass; valid providers retain playback/fallback. |
| G10 | P1 | UI/UX / media | Unit tests cover media capability selection, but real-device playback, app switching, audio focus, interruption, accessibility, and degraded-network behavior are not evidenced for every format. | Run an iPhone matrix for texture/layers/image/uploaded video/YouTube/Spotify/TikTok/Instagram/Facebook/X with success and fallback states. | Recorded device checklist and screenshots/video for each media type and failure mode. |
| G11 | P0 | Release / AR | **Docker/local closed; hosted and physical pending.** Supabase, Expo, and admin containers build and run; all local health/smoke gates pass. | Deploy hosted staging, then run auth → publish → approve → remote preview → physical AR → social → delete. | D1 golden-path log plus physical-iPhone field evidence. |
| G12 | P2 | Push | Private admin token registration exists; server sender, event routing, Expo receipts, token invalidation, preferences, and end-user push do not. | Implement a server-owned outbox/worker and receipt processor after notification product policy is approved. | Idempotent delivery tests, invalid-token cleanup, opt-out, and deep-link handling pass. |
| G13 | P2 | Observability | Sentry and analytics hooks exist, but there is no production SLO/alert model for preview RPC failures, queue age, media fallback rate, AR resolve rate, or notification delivery. | Define privacy-safe metrics, dashboards, alert thresholds, release tags, and correlation IDs. | Staging fault injection produces actionable alerts without logging media, precise location, or secrets. |
| G14 | P2 | Database contracts | **Closed for v1 writes.** Database checks validate pose, edit canvas/layers, and optional content/calibration/resolver/anchor JSON contracts. | Add explicit v2 migration rules before introducing v2 documents. | Malformed/unknown versions fail safely; v1 remains readable. |
| G15 | P2 | UI/UX quality | The new flows need dedicated accessibility, localization, dynamic-type, reduced-motion, offline, empty, loading, and retry verification. | Add screen-level tests and iPhone QA for PublicProfile/PostPreview plus TR/EN copy review. | VoiceOver order, 200% text, reduced motion/transparency, narrow device, offline, and retry scenarios pass. |
| G16 | P1 | Profile / information architecture | **Closed locally.** A privacy-limited profile projection returns handle, avatar, bio, post/follower/following counts without private identity fields. | Validate the hosted projection with anonymous/authenticated roles. | Both viewers receive the same approved projection without email, phone, roles, or private fields. |
### Gaps closed in the 2026-08-09 pass

| Area | Closed gap |
| --- | --- |
| User flow | Other-user public posts now have a location-independent profile and post-preview route; AR proximity is a separate explicit action. |
| Visibility | New preview RPCs fail closed for status, visibility, age rating, and two-way blocks. |
| Media | Surface texture, drawing/text/image layers, image media, uploaded video, YouTube, Spotify, and restricted-platform fallback paths are represented by one preview renderer. |
| Shared state | Remotely fetched profile posts merge by stable post ID into Zustand and AsyncStorage. |
| Mutation correctness | Failed comment, like, save, and follow writes rollback their optimistic local state. |
| Documentation | UI/UX, state, navigation, deep links, errors, backend, API, push, ERD, and cache/sync diagrams now share one set of invariants. |
| Permission-safe launch | Normal launch and onboarding land on lazy-loaded Explore; Camera/AR requires explicit intent and owns its permission recovery path. |
| Release identity | Preview/production sanitizes demo identity and bundled `seed-*` content to an explicit guest/remote-only startup. |

### Execution order

1. Deploy and re-run G1/G2/G16 tests on hosted staging before exposing public preview.
2. Close G11 with the hosted golden path and physical-iPhone evidence.
3. Complete G5 universal-domain ownership, G7 dead-letter UI, G10, and G15 before App Store UX freeze.
4. Schedule G8, G12, and G13 as measured post-foundation work; push remains outside 1.0 until product policy is approved.
