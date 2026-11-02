# Mac / GitHub reconciliation — 25 October 2026

The current development branch is `codex/fix-anonymous-location-audit` (PR #58). Before reconciliation, the Mac was at `60afbca702fbf5f27e1fd47f24db6d42f8337c48`; GitHub was five commits ahead at `5c371185c373d4287e2996a95983aea4f573e1b5`. The branch had no upstream configured. The Mac also contained 93 modified tracked files and 117 new, non-ignored files.

## Preservation and merge

- Saved the original file hashes, binary patches, changed-file archive and verified Git bundle under `/Users/khankartal/.codex/backups/lociar-sync-20261025-163604/`.
- Preserved all 210 local changes in commit `daa9267` before merging the five remote commits. No original file was deleted. Ignored machine configuration, credentials, build outputs and other worktrees were left in place.
- Resolved conflicts in `MapFeatureView.swift` and `publicContent.ts`. Retained the remote map-cell index and consolidated maintenance scheduling alongside the local privacy, account, support and cost work.
- Kept `MapRequestCoordinator` as the single viewer-scoped map-summary cache; publishing and explicit refresh invalidate it. Its existing tests cover reuse, expiry, account changes and rejection of late responses. The older unscoped group cache and its superseded test were omitted.
- Applied fresh request-scoped author checks to indexed map reads. Kept the `summaryVersion`, completeness and circle-coverage metadata required by the local coordinator.
- Preserved `includeOwnNearby` for both the scan and index paths, including nearby owned posts outside the first 100 public results. Extended the regression to cover both pending and public owned posts, and to exclude distant owned posts.
- Configured this branch to track `origin/codex/fix-anonymous-location-audit`. History is merged without a force push.

## Validation

Logs and the native result bundle are in `build/git-sync-20261025/` (ignored).

| Check | Result |
| --- | --- |
| Functions typecheck / unit tests | Passed / 188 passed |
| Admin typecheck / unit tests / production build | Passed / 43 passed / passed |
| Repository script tests | 57 passed |
| Python script tests | 33 passed |
| Firestore and Storage rules | 95 passed |
| Cost and map regression tests | 25 passed |
| Selected Functions integration: map cells, maintenance, anonymous content, anonymity differential | 10 passed |
| Admin emulator integration | 129 passed |
| Native iOS tests | 238 passed, 2 physical-device tests skipped, 0 failed |
| Localization / catalog / secret scan / Git whitespace | Passed |

This reconciles source history on the existing development branch. `main` remains the base of open PR #58. GitHub CI for the new head must be assessed separately. No Firebase deployment, support-feature enablement, seed import or store submission was performed.
