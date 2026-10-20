# Cam Katman deep audit — 19 October 2026

Scope: the uncommitted glass heatmap and map-group changes on `codex/fix-anonymous-location-audit`, base `716f23659689cc8c1b50a61439590fda926aaf45`. This audit did not change application code or deploy services.

**Audit result: one access-control defect and four behaviour defects reproduced.** The findings below record the pre-fix behaviour. Follow-up implementation and verification: [GLASS_MAP_FIXES_2026-10-19.md](GLASS_MAP_FIXES_2026-10-19.md).

## Reproduced findings

### P1 — Note reads trust an obsolete spot circle after members disappear

`functions/src/denseSpots.ts:150` prefers the persisted spot over a current read area. Removal updates its count but does not recompute its centre/radius (`syncSpotMembership`, `repairSpotCount`). In contrast, the map summary computes a fresh circle from current visible posts. The backend can therefore return a body outside the area the app considers accessible.

Probe: create five notes spread across 24 m, let them form a real spot, remove four members, settle memberships/count, then request the surviving singleton from 35 m away with fresh 5 m accuracy. The current map group has radius 0; the default access distance is 15 + 5 = 20 m. The callable still returns the text unlocked. This is a backend authorization discrepancy, even though the unmodified group sheet hides rows using its stricter current circle.

Fix: authorize location-note reads against the same current, eligible member geometry used for the map summary. Do not use historical circle growth as an authority for current note access. Preserve the independent AR policy.

### P2 — Changing likes between pages omits notes

`functions/src/publicContent.ts:208` re-sorts the complete group for every request and slices by numeric offset at line 221. A previously unread note promoted into an earlier page disappears from the remaining pages; client deduplication cannot recover it.

Probe: read the first 50 of 60 notes, promote an unread note to first place, then request offset 50. The server returns 60 rows across the two pages, but only 59 unique IDs, one note missing and `nextOffset: null`.

Fix: use a bounded stable ordering snapshot for the pagination session, with live visibility/access checks on every page. A cursor over mutable like counts alone does not guarantee that every note is returned.

### P2 — A growing group turns an existing badge into an empty list

`functions/src/publicContent.ts:202` drops every fallback member that has since acquired `spot_id`. A map summary made before the five-member threshold still contains a `post:` identity. When the asynchronous membership trigger promotes it to a `spot:` identity, the old badge opens zero notes rather than resolving the current group.

Probe: capture a two-note summary, add three notes and settle membership. Reading the captured group returns total 0; reading its new persistent identity returns total 5.

Fix: resolve a fallback anchor's current persistent membership, return the canonical group metadata, and refresh the selected group identity. Handle a deleted anchor by refreshing summaries rather than treating an outdated identity as a permanently empty place.

### P2 — The nearby panel opens only part of a small group

`LociAR/Features/Map/MapFeatureView.swift:391` matches only a group identity. Individual locked rows have their own `post:` identity before persistent membership; the actual map group uses the first sorted member's identity. If the nearest note is another member, the fallback at line 394 builds a singleton.

Probe: two notes 24 m apart, with the nearer note sorting after the farther anchor. The actual map badge reports 2 notes; following the panel's exact identity/fallback selection opens 1. The request/response path was reproduced in the emulator; this additional probe did not drive the native panel UI.

Fix: resolve the summary containing the selected post ID, not only the summary whose group ID equals that individual row's lock ID. Refresh around the selected place if it is absent from the current viewport summaries.

### P2 — Longitude averaging places antimeridian neighbours on the opposite side of Earth

`functions/src/mapNoteGroups.ts:23` uses ordinary arithmetic averaging for longitude. Neighbours at 179.99995° and −179.99995° are approximately 11 m apart, but their computed group centre is 0° longitude, with radius 20,015,108.88 m. This breaks placement and client proximity checks in the global map.

Fix: average wrapped longitude deltas around an anchor, consistently with the existing fallback read-area calculation. Cover both fallback and persistent group summaries.

## Additional scope limits

- Leaving a place clears the group list, but an already opened `PostPreviewView` holds its original unlocked `LociPost` and does not revalidate proximity. This was established by source review, not a new physical/UI test. Immediate revocation of an already displayed detail is not implemented.
- On-site reads deliberately grant a 30-minute comment session. That session is not a fresh-location check for each subsequent comment request.
- Ordinary AR posts retain the existing policy; the new always-on remote body lock applies to location notes. GPS/Geospatial freshness checks are checks on submitted measurements, not cryptographic proof of physical presence.
- Legacy density cells retain their coarse centre until coordinate reconciliation completes. No production backfill was performed.

## Evidence and boundaries

- TypeScript build: passed with Node 22.
- Five targeted probes reproduced all five findings in a fresh `demo-lociar` Firebase emulator session, using synthetic accounts/posts only. Probe assertions intentionally confirm the defective outcomes; their green TAP status must not be reported as a clean feature acceptance result.
- Reproduction source: `build/glass-map-audit-20261019/probes.mjs`.
- Final log: `build/glass-map-audit-20261019/emulator-final.log`.
- All source hashes in the earlier `build/glass-map-verification-20261019/verification.json` matched this audit's source snapshot. Earlier unit/rules/integration/native/UI evidence is reusable for its original cases; those full suites were not rerun during this audit.
- The emulator was stopped after the probes. No application source fixes, commit, push, production deployment, physical-device acceptance or TestFlight upload occurred during this audit. GitHub/live-service state was not refreshed.

Priorities: repair the P1 access-area discrepancy first; then pagination, identity transition and panel membership; then global longitude handling. Add permanent regressions for these cases alongside the fixes before release.
