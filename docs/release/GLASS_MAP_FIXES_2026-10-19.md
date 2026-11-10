# Cam Katman audit fixes — 19 October 2026

Follow-up to `GLASS_MAP_DEEP_AUDIT_2026-10-19.md`. Changes remain local on `codex/fix-anonymous-location-audit`; no production deployment or distribution action was performed.

## Changes

- Location-note authorization and map summaries use the same current eligible-member geometry, capped at 40 m. Historical spot circles cannot authorize note text after deletions, moves or visibility changes. Single/remote projections remain locked; the AR policy stays separate.
- Pagination freezes ranked IDs in a server-only, viewer-bound `map_group_sessions` record. Each page rechecks current membership, account/block fences and fresh location. Like changes take effect in the ordering on refresh. The token expires after 30 minutes and grants no note-body access by itself. Direct client reads/writes are denied; author/viewer deletion cleans up the relevant sessions.
- Old `post:` groups resolve a newly assigned persistent spot. If an anchor was deleted/hidden, eligible member hints choose a replacement; membership and geometry are still discovered on the server. Responses return current group metadata to the native sheet.
- The nearby panel resolves a selected note by group membership and fetches summaries around that place when the viewport has moved elsewhere. A singleton client hint does not restrict the server to one note.
- Wrapped longitude means cover summaries, persistent-spot seeding/growth and notification cluster centres across ±180°.
- The native group location monitor belongs to its navigation stack, remaining active while a detail is pushed. Leaving, losing a usable fix, permission revocation or backgrounding discards the bodies and clears detail navigation. Late responses are checked against current proximity before display.

## Verification

All five audit findings and the open-detail revocation gap are fixed locally. Final source was verified with Node 22 / Java 21 and native iOS 26.5 on a dedicated iPhone 16 Pro simulator.

| Check | Result |
|---|---|
| Repository scripts | 56 passed |
| Functions build / unit tests | successful / 143 passed |
| Firestore + Storage rules | 87 passed |
| Functions integration, final source | 166 passed |
| Fresh isolated location-note emulator | 29 passed |
| Native iOS | 193 passed; 2 named physical-only cases skipped |
| Real Firebase SDK + native UI against demo emulator | 2 passed |
| Localization | 659 keys × 12 languages; 630 release compiler-extracted keys present |
| Secret scan / whitespace | passed |

The UI scenario exercised glass heat → 10-note badge → remote lock → on-site likes-ranked list → note detail and comments → GPS exit while the detail remained open. The exit popped the detail, removed its text/comments and retained the public count with the approach prompt. Exported screenshots were inspected visually.

Machine evidence and copied logs: `build/glass-map-fixes-verification-20261019/verification.json`. UI screenshots: `build/glass-map-fixes-verification-20261019/ui/`. Immutable native products, result bundles and native summaries: `build/glass-map-fixes-e2e-20261019/`. All 65 frozen backend JavaScript files matched the final compiled backend; native artifact hashes matched before/after SDK/UI acceptance. Test data/accounts were synthetic. The dedicated simulator was shut down/deleted, and the emulators were stopped.

Permanent regressions cover moving likes between pages (all 60 IDs), the 120-note group, token ownership/expiry, missing-token rejection, fresh location on subsequent pages, new mutes/removals, account/session deletion, 2→5 membership promotion, a deleted fallback anchor, singleton hints, the obsolete-circle access defect, date-line centroids and panel membership selection.

## Release boundary

Deploy updated Functions (including `readPublicContent`/account deletion and the density/spot helpers), Firestore rules and `firestore.indexes.json` (`map_group_sessions.expires_at` TTL), with the matching iOS protocol. No new secret is required. Existing location-free 30-minute comment grants remain session-based; this change does not make every comment request prove a fresh GPS position.

Local emulator and simulator evidence does not prove physical GPS/Geospatial accuracy, field AR performance, live source parity or TestFlight readiness. Legacy coordinate reconciliation remains a production rollout task.
