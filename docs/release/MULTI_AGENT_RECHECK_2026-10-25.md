# Multi-agent security and reconciliation recheck — 25 October 2026

Baseline: `cc64ff7ed52a289e75545a674983e4ebfbc91e0d`, branch `codex/fix-anonymous-location-audit`, PR #58. The Mac and fetched remote branch matched before these fixes. The baseline's six Actions checks and SonarCloud check all passed. That baseline CI result does not validate subsequent changes.

## Scope and method

Three specialists investigated (1) Firebase authorization/privacy and index recovery, (2) native iOS/AR/account lifecycle, and (3) admin authorization and payments. They delivered executable reproductions and source evidence under `build/multi-agent-recheck-20261025/{firebase,ios,admin-payments}/`. Agent usage limits interrupted further specialist work; this is not a claim that three complete independent release audits finished. The coordinating agent reviewed the evidence, implemented the remaining fixes and validated them with the real Firestore/Auth/Storage emulators and native XCTest.

No production deployment, live payment transaction, notification send, seed import, main-branch merge or store submission is part of this recheck. Ignored machine configuration and unrelated worktrees were preserved.

## Confirmed findings and fixes

| Severity | Reproduction | Resulting behavior and validation |
| --- | --- | --- |
| P1 | A pending admin-role invitation could still grant a role after its inviter lost role-management permission, had no assignments, or lost their Auth account. The old check accepted any active assignment and skipped an empty assignment set. | `admin/lib/admin-invite.ts` now requires the inviter's current known roles to include `admin_users.write`, an enabled Auth account and no deletion job. Firestore role checks remain inside the acceptance transaction. Real emulator cases cover downgrade, missing/unknown roles, missing grantor, deletion, disabled/deleted Auth, concurrency and accepted replay. Replaying an accepted invitation cannot restore a later revoked role. Ordinary invitations remain independent of admin-role granting. |
| P2 | Both directions of an identity block still allowed a raw Firestore get of that commenter's comment on a third party's post and their profile. Client-side eligibility filtering happened after downloading the comment body. | `firestore.rules` fences profile/comment gets in both block directions and denies raw comment lists. iOS uses `readPublicContent(mode: comments)` to filter commenters on the server. Pages advance through hidden rows with random, viewer/post-scoped, expiring server cursors; blocked IDs and bodies are absent from responses and cursor contents. Emulator tests cover both raw-access directions, anonymous-mute independence, a fully blocked page, 201 comments, cross-viewer/post cursors, expiry and fresh location-note read grants. |
| P2 | A cancelled Firebase Storage download could complete after account cleanup and recreate the deleted world-map cache directory. Cancellation alone did not cancel the SDK continuation. | World-map cache commits and removal share a lock; account deletion invalidates captured and newly constructed handles for that account directory. Downloads recheck cancellation, viewer identity and cache generation after awaits. Native tests reject late/cancelled writes and preserve another directory. The original probe demonstrates file recreation; it does not establish cross-account display or disclosure. |
| P2 | A missed post-deletion trigger left a permanent `map_cell_members`/`map_cells` locator because reconciliation scanned existing posts only. | Bounded reconciliation also scans persistent members with a separate cursor. A real Firestore test deletes the post without a trigger worker, repairs its member/cell entry, advances after a deleted cursor and confirms replay does not decrement the retained count twice. Map bodies already rehydrated live posts; the confirmed defect was stale locator/count retention. |

## Comment protocol rollout

Deploy the matching `readPublicContent` implementation before enabling the new iOS comment client. The rules change closes the old direct-list path, so older installed clients will lose comment listing when those rules are deployed. Account for installed-client compatibility in the release plan; there is no client fallback to downloading blocked bodies.

Comment cursors use server-only `dense_spot_unlocks` documents with `kind: comment_page`, `owner_luid`, a post binding and a 30-minute expiry. They reuse that collection's existing TTL and account-deletion cleanup. They cannot satisfy a `kind: note_read` grant. Each page rechecks post/author visibility and the location-note grant. The existing comments `(post_id, created_at DESC, __name__ DESC)` index supports the query.

## Validation

Raw logs/result bundles live under `build/multi-agent-recheck-20261025/root/` (ignored).

| Check on the changed source | Result |
| --- | --- |
| Functions build / unit tests | Passed / 188 passed |
| Admin typecheck / unit tests / production build | Passed / 43 passed / passed |
| Firestore and Storage rules | 96 passed |
| Cost, comment projection and map recovery regressions | 29 passed |
| Full Functions callable integration | 171 passed |
| Additional authenticated comments HTTP integration | 1 passed |
| Isolated clean-emulator location notes | 29 passed |
| Admin emulator integration, including protected-page Chromium checks | 132 passed |
| Native simulator XCTest | 240 passed, 2 physical-only tests skipped, 0 failed |
| Repository script tests | 57 passed |
| Localization, catalog, secret scan and Git whitespace | Passed |

The new comment HTTP projection passed a separate emulator integration check in addition to the full 171-test run (the test was added after that run started). GitHub's workflow glob includes it in subsequent full runs. The new pushed commit's required CI checks are tracked independently on PR #58; baseline green checks cannot be reused as evidence for the new head.

## Remaining release evidence

The read-only deployed snapshot `build/firebase-readiness/mac-github-recheck-20261025-final-validated.json` remains **not ready**: `map_group_sessions.expires_at` TTL is missing, fourteen expected Functions and three replacement Scheduler jobs are absent, and seven retired Scheduler jobs remain. Separate index comparison found three missing composite indexes. Two support Cloud Run revisions have `HealthCheckContainerError`; the support feature remains disabled. These are production rollout blockers, not failures repaired by committing local source.

Physical iPhone GPS/AR/Cloud Anchors, actual APNs receipt and tap routing, real payment-provider settlement, and TestFlight/App Store behavior were not verified. The paired physical iPhone was unavailable. Simulator/emulator and CI results do not prove these layers.

The activity-ID migration helper's behavior if a legacy activity document disappears between query and migration was flagged for follow-up source review. It has not been independently reproduced or changed in this recheck and is not included among confirmed fixed findings.

## Git and branch boundaries

The earlier reconciliation and Claude/dependency branch decisions remain documented in `MAC_GITHUB_SYNC_2026-10-25.md` and `BRANCH_CONSOLIDATION_2026-10-25.md`. Compatible Claude work is integrated. The Firebase 13 proposal conflicts with the pinned ARCore dependency range, and the ARCore 1.57 artifact failed its official checksum; neither was forced into the project.

All three auxiliary worktrees were checked clean again. Their tips are already ancestors of the integration branch; they intentionally retain their historical detached checkouts. `main` is protected and remains the PR base. A clean matching development branch is distinct from merging main or deploying Firebase.
