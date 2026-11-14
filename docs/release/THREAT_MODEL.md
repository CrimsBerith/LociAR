# LociDrop 1.0 — Threat Model & Security Architecture (STRIDE)

> Phase: P2 / P5  
> Owner: A07 (Security & Privacy Specialist)  
> Reviewed by: A15 (Independent Red Team)  
> Methodology: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  
> Date: 2 Kasım 2026  

---

## 1. System Boundary & Assets

### 1.1 Assets Under Protection
1. **User Identity & Auth**: Apple user identifiers, Firebase UIDs, `luid` custom claims.
2. **User Private Data**: User email, account deletion records, real-time precise GPS locations.
3. **Content Integrity**: Post coordinate coordinates, AR anchor transforms, like/view counters, author attribution.
4. **Platform Infrastructure**: Google Cloud / Firebase API billing limits, Google Secret Manager keys.

### 1.2 Trust Boundaries
- **Untrusted**: Mobile iOS Client (can be run on jailbroken devices or modified via runtime injection).
- **Untrusted**: Public Internet / Cellular networks.
- **Trusted**: Cloud Functions (Node 22 / Admin SDK), Cloud Firestore, Firebase Storage, Google Cloud Secret Manager.

---

## 2. STRIDE Threat Analysis

### 2.1 Spoofing (Identity)
- **Threat**: Attacker creates fake accounts or impersonates other users.
- **Mitigations**:
  - Direct anonymous / guest access is retired. Every user must authenticate via Sign in with Apple or verified Email OTP.
  - Server-authoritative `ensureProfile` callable derives the immutable `luid` (UUIDv5) and writes it into Firebase Auth custom claims.
  - Client SDKs cannot forge or modify claims; Firestore security rules enforce `request.auth.token.luid == resource.data.luid`.

### 2.2 Tampering (Data Integrity)
- **Threat**: Attacker fabricates likes, views, modifies someone else's post, or changes location pin coordinates to spam remote locations.
- **Mitigations**:
  - Direct Firestore writes are blocked for clients by default-deny security rules (`firestore.rules`).
  - Counters (`likes_count`, `views_count`, `comments_count`) are modified exclusively through atomic Cloud Functions with idempotency deduplication.
  - Location note placement verifies `distance <= 12m` from measured GPS hardware fix.
  - Links, URLs, and adult text are filtered server-side during `createPost`.

### 2.3 Repudiation (Audit Trail)
- **Threat**: User denies posting malicious content; admin performs unauthorized actions without a trace.
- **Mitigations**:
  - Every content submission records immutable author `luid`, timestamp, and client metadata.
  - Operations console logs all admin actions into an append-only `admin_audit_logs` collection keyed by idempotency tokens.
  - Content suspensions, account deletions, and flag reviews are audited.

### 2.4 Information Disclosure (Privacy & Secrets)
- **Threat**: Attacker scrapes users' home locations, leaks anonymous author identities, or extracts server API keys from binary.
- **Mitigations**:
  - `qa-secret-scan.mjs` scans all tracked files; zero service secrets exist in the mobile bundle.
  - Remote location notes return redacted text; full text requires an authenticated on-site fix.
  - Anonymous posts use `author_alias`, never the user's handle or account ID.
  - Blocking an anonymous author uses independent `anonymous_blocks` collection. Differential privacy test (`anonymous.test.mjs`) proves muting an author's anonymous note gives zero information about their identity or other posts.
  - Usual home locations learned on-device for campaigns never leave the local device.

### 2.5 Denial of Service (Availability & Cost Depletion)
- **Threat**: Attacker floods `createPost` to exhaust Firebase quotas or billable Cloud Scheduler jobs.
- **Mitigations**:
  - Rate limiting enforced on posts (10/hour, 50/day per verified user).
  - Cloud Scheduler jobs strictly capped at 3 jobs (free tier limit) in `functions/src/schedules.ts`.
  - Spatial cell indexing (`map_cells`) limits queries to fixed geohash tiles, preventing unbounded database collection scans.

### 2.6 Elevation of Privilege (Access Control)
- **Threat**: Regular user accesses admin moderation APIs or modifies protected zones.
- **Mitigations**:
  - Static RBAC enforced on admin callable handlers (`admin/lib/rbac.ts`).
  - Sensitive operations (viewing device/IP data, exporting audit logs, managing roles) require an authenticator-backed AAL2 session.
  - Firestore security rules reject all direct client queries to `admin_*` collections.
