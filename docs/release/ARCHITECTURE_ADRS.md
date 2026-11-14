# LociDrop — Architectural Decision Records (ADRs)

> Phase: P2 / P3  
> Owner: A02 (Architecture & Big Refactor Specialist)  
> Status: Active / Production Ready  
> Date: 2 Kasım 2026  

---

## ADR-01: Firebase Server-Authoritative Architecture & Retirement of Supabase
- **Status**: Accepted & Implemented (27 Sep 2026).
- **Context**: The initial prototype explored Supabase and direct client writes to PostgreSQL. This posed severe cheating, spam, and coordinate spoofing risks, and complicated integration with Google ARCore Cloud Anchors.
- **Decision**: Migrate completely to Firebase:
  - Firestore (`nam5`) for schemaless, scalable document storage.
  - Cloud Functions (`us-central1`, matching Firestore region) for server-authoritative writes.
  - Client SDKs are read-only for public collections; all writes (posts, profiles, counters, flags) must pass through Cloud Functions.
- **Consequences**: Zero risk of clients fabricating likes or view counts. Default-deny security rules protect database integrity. Supabase dependencies archived and strictly banned from active trees.

---

## ADR-02: Multi-Tier AR Relocalization Pipeline
- **Status**: Accepted & Implemented.
- **Context**: Standard ARKit world tracking suffers from drift over physical distance and cannot resolve persistent anchors across multiple independent sessions or distinct devices.
- **Decision**: Implement a 4-tier relocalization ladder:
  1. **Google ARCore Cloud Anchors**: Hosted with 365-day TTL, authenticated keylessly via the `getArcoreToken` callable (no client API key).
  2. **Google ARCore Geospatial (VPS)**: Earth-referenced poses using visual positioning service where Street View geometry exists.
  3. **Local ARKit World Tracking**: Surface detection with ARPlaneAnchor for local session persistence.
  4. **Aim-Guided Reveal**: Proximity-based direction arrow guiding the user toward the post when visual tracking is obscured.
- **Consequences**: Superior cross-device anchor stability while respecting privacy (sensor disclosure visible on all AR views).

---

## ADR-03: Cam Katman Glass Map & Spatial Cell Indexing (`map_cells`)
- **Status**: Accepted & Implemented (19 Oct 2026 / 22 Oct 2026).
- **Context**: Querying every post within a 5 km bounding box requires massive Firestore document scans, creating astronomical read costs and client battery drain.
- **Decision**: Introduce a server-computed spatial cell index collection (`map_cells`). The client queries pre-aggregated cell documents based on geohashes. Map views render the custom Cam Katman glass heat style and 6-metre cluster center groups.
- **Consequences**: Firestore read operations reduced by over 90%. Remote note text stays server-redacted until an authenticated on-site GPS fix is submitted.

---

## ADR-04: Verified Membership with Server-Enforced Anonymous Authorship
- **Status**: Accepted & Implemented (28 Oct 2026).
- **Context**: Pure anonymous posting leads to trolling and platform abuse, while mandatory public handles inhibit honest community contributions.
- **Decision**: Require verified Apple Sign-in or Email OTP for all sessions. Users can choose to publish anonymously (default) or attributed to their handle. The server derives and freezes this choice, stamping an opaque `author_alias` on anonymous posts. Profile blocks and anonymous author blocks remain completely independent (differential privacy).
- **Consequences**: Full accountability at the backend with zero leakage of author identity between users. Complete compliance with App Store user safety guidelines.

---

## ADR-05: Creator Support / Monetization Gating in Version 1.0
- **Status**: Accepted & Implemented (28 Oct 2026).
- **Context**: Creator tipping and support features require live merchant accounts, tax compliance, and StoreKit digital item approvals. Publishing incomplete or sandbox-only payment UI triggers immediate App Store Review rejection under guidelines 2.1 and 3.1.1.
- **Decision**: Gate all payment entry points behind `PostSupportAvailability.releaseBuilds = false`. The support button on notes and the Earnings section in Profile are completely hidden from production Release builds. Only dedicated UI test fixtures explicitly launched with `UITEST_SUPPORT_UI` can render mock payment flows.
- **Consequences**: Eliminates App Review rejection risk. Re-enabling will occur in a dedicated minor release with live production StoreKit contracts.

---

## ADR-06: Maintenance Job Consolidation (Cloud Scheduler 3-Job Free Tier)
- **Status**: Accepted & Implemented (21 Oct 2026).
- **Context**: In October 2026, 7 distinct scheduled Cloud Functions exceeded the Google Cloud Scheduler free tier (3 jobs per billing account), triggering spend caps and halting all functions.
- **Decision**: Consolidate all maintenance into exactly 3 scheduled functions:
  1. `everyFiveMinutes`: Urgent queue processing (avatar screening retries, report counters).
  2. `everyFifteenMinutes`: Spatial cell indexing recomputation, transient cache pruning.
  3. `nightlyMaintenance`: Account deletion retries, orphan Cloud Anchor cleanup, log rotation.
- **Consequences**: 100% free-tier compliance for scheduler jobs; zero spend cap interruptions.
