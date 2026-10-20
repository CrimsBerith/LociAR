# LociAR full follow-up audit — 20 October 2026

Follow-up implementation and newer verification: [CONTINUATION_FIXES_2026-10-20.md](CONTINUATION_FIXES_2026-10-20.md).

Scope: current dirty Mac worktree, recent heatmap/proximity/translation changes, 12-language UI evidence,
backend/admin tests, GitHub PR #58, live Firebase metadata and public legal/support endpoints.
This audit changes no application code, merges no branch and performs no deployment or seed import.

## Findings and remaining work

1. **Release blocker: live backend is older than the new map protocol.** Live `readPublicContent` revision
   `readpubliccontent-00005-kap` was updated at **18 October 2026 02:49 Europe/Istanbul**. The current local
   map-group/pagination/proximity implementation is from 19–20 October and has not been deployed by this work.
   The read-only Firebase readiness check fails on one concrete finding: **`map_group_sessions.expires_at`
   has no ACTIVE TTL policy**. Session reads enforce expiration in code, so missing TTL does not itself extend
   access; it leaves expired records without the intended automatic cleanup. Deploy the matching Functions,
   rules/index configuration and verify the TTL reaches ACTIVE before shipping this map build. Metadata is
   not a source-equivalence or live user-flow test. Evidence: `live-public-content-version.json` and the
   owner-only `build/firebase-readiness/full-audit-20261020.json`.

2. **P2: heat queries omit visible notes across ±180° longitude.**
   `NoteDensityClient.cells` in `LociAR/Features/Map/NoteDensity.swift:69–71` clamps one bounding box to
   `[-180, 180]`. For a viewport centred at **179.9°**, span **0.4°**, a note at **−179.95°** is visible
   (wrapped separation 0.15°), but the request only covers **179.7°…180°**. The counterpart west of −180°
   fails symmetrically. Split wrapped viewports into two boxes and merge cells by id; keep full-world spans
   as one global box. This affects the distant density layer, independently of the already-wrapped group
   centroids. No remote note-body exposure was found in this case. Counterexample:
   `build/full-audit-20261020/dateline-heat-repro.json` (source-level query-bound reproduction).

3. **Translation coverage is narrower than all displayed content.** The new component covers post cards,
   on-site group rows and post details. AR textures still render `post.messageText`/`post.caption` directly
   (`LociAR/ARCore/SpatialContentRenderer.swift:164–184`); AR nearby previews and saved/profile-list previews
   also retain the original. Comments use `Text(comment.text)` (`PostPreviewView.swift:201`). These are
   coverage limits, not evidence that the existing inline component failed. Bengali is unsupported in the
   current host-Mac Apple availability probe; the app checks every pair on the actual device and retains
   the original for unavailable pairs/OS versions. There is no paid translation fallback.

4. **Physical acceptance remains open.** The paired iPhone reports tunnel **unavailable** (iOS 26.7.1).
   Actual Apple model download/permission, translation output, original toggle and offline translation were
   not exercised on that phone. Simulator fallback/state tests and unsigned iPhoneOS compilation do not
   establish this. Physical GPS/AR behaviour and live APNs delivery/tap navigation are separate acceptance
   gates too; this run provides no new physical evidence for them.

5. **GitHub and Mac contain different work.** Mac HEAD is `716f236`; PR #58 HEAD is `7313e7a` (one commit
   ahead). The latter adds **52 business fact notes** (`landmark-businesses`) and is not integrated into this
   dirty checkout. The Mac also has uncommitted heatmap/proximity/translation changes. All seven PR checks
   pass and merge state is CLEAN, but those checks do not certify these local uncommitted features. Preserve
   the worktree while reconciling both sets before committing/pushing. Remote commit details are saved in
   `remote-commits.log`; no checkout, reset, stash or merge was performed.

6. **Sonar gate OK does not mean no findings.** The current PR query returns **3 unresolved issues**:
   one CRITICAL maintainability issue (cognitive complexity 20 versus 15) in the remote-only
   `scripts/seed/landmark_businesses.py:265`, plus two MINOR declaration-style issues in PR-version
   `NoteDensity.swift:109`. These are code-quality findings, not three demonstrated security vulnerabilities.
   The gate and issues are recorded separately in `quality-gate.json` / `sonar-issues.json`.

7. **Earlier launch-plan prerequisites remain incomplete.** No mobile `admin_managed` official badge wiring
   was found; `publicContent.row` does not project that field. The local seed directory contains only the
   world-capitals batch: **322 notes + 46 AR**, 17 approximate capitals requiring owner map checks. A/B
   Istanbul/Turkey seed files are absent. The remote business batch is additional content, not a replacement
   for those A/B layers. This audit did not inspect live users/notes or certify that the guide identity,
   protected zones or seed imports are complete.

## Checks

Fresh checks ran under Node 22 / Java 21. Integration and isolated note gates used separate clean demo
emulator runs; no real users, production writes or message sending were involved.

| Check | Result |
|---|---|
| Repository scripts | 56 passed |
| Functions build + unit tests | Passed / 143 passed |
| Firestore and Storage rules | 87 passed |
| Functions integration, including anonymity/block differential regressions | 166 passed |
| Isolated location-note acceptance | 29 passed |
| Admin typecheck / unit tests | Passed / 41 passed |
| Full production + development dependency audits, Functions and admin | Clean |
| Catalog generator / release localization | 670 Localizable + 6 InfoPlist keys × 12 languages; no pending translations |
| Store metadata / world-capital seed generator | Passed / passed |
| Secret scan / whitespace | Passed / passed |
| Live Firebase metadata | FAIL: one missing TTL policy, described above |
| Live public `/privacy`, `/terms`, `/support` | HTTP 200, CSP present; availability check, not legal-content approval |
| GitHub PR #58 | Seven successful checks; head differs from Mac |
| Sonar | Gate OK; 3 unresolved issues |

The recent final native evidence was reopened from its actual `.xcresult` bundles rather than inferred from
CI: **200 passed, 2 physical-only tests skipped**, map SDK/UI scenario passed, **12 language iterations in
the settings/composer UI test passed**, and final original-fallback detail passed. All nine translation
acceptance source hashes still match the current files. Backend, rules and map-domain sources from the
prior full glass audit also remain unchanged; the new translation/UI changes have the newer matching
acceptance. No simulator rerun is represented as an Apple engine translation.

Evidence: `build/full-audit-20261020/verification.json`, fresh logs in that directory, and the linked
`build/device-translation-20261020/verification.json` / `device-translation-final-e2e-20261020` bundles.
The exact native and live boundaries remain documented in `ON_DEVICE_TRANSLATION_2026-10-20.md` and
`GLASS_MAP_FIXES_2026-10-19.md`. TestFlight/App Store state was not queried or changed in this audit.
