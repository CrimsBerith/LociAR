# Branch and worktree consolidation — 25 October 2026

The integration branch is `codex/fix-anonymous-location-audit`, reviewed through PR #58. Starting point: `146b825`. All current local branches, fetched `origin` branches and four registered worktrees were inspected. The verified pre-change Git bundle and ref inventory are in `/Users/khankartal/.codex/backups/lociar-branches-20261025-164906/`.

## Which work exists where

| Branch or checkout | Evidence and decision |
| --- | --- |
| `claude/ecstatic-cray-mavett` (`2759223`) | Originally an `origin` tracking ref on the Mac, with no separate local checkout. Merged in `93ff99d`. The same Next.js and production Functions security versions already existed locally. Adopted its newer `ip-address` 10.7.5, `undici` 8.12.3 and `zod` 4.6.7 patches and security documentation. Preserved local support dependencies, scripts, exact Next.js 16.4.3 pin and existing overrides. Kept the newer local UUID transitive version. |
| Dependabot GitHub Actions (`33e87e3`) | Merged in `5368c7c`: setup-node 7.1.0 and setup-java 6.1.0, still pinned by commit SHA. |
| Dependabot admin (`d4a7e0f`) | Merged in `5f5671f`: React/React DOM 19.3.1 and compatible test-tool updates. Kept Next.js 16.4.3 instead of downgrading to the proposed 16.4.2. |
| Dependabot Functions (`59fe3fe`) | Merged in `11c5c3e`: Firebase CLI 15.33.0 while preserving audited overrides and local features. |
| `fix/brand-validator` (`554aa87`) | Its six commits were already squash-merged by PR #53 as `d760dc2`, which is in the integration branch. Independent aggregate patch IDs match exactly: `e260b1792388c29be2586933065968c7d5a79023`. No replay needed. |
| `feat/location-notes`, `codex/anonymous-notes-likes`, `archive/social-media` | Their tips are ancestors of the integration branch. Their historical code is already incorporated. |
| `~/.lociar-seed` (`d069e51`) | Clean detached checkout; its tip is an ancestor of the integration branch. No uncommitted or unique work. |
| `.kilo/worktrees/ajar-headline` and `kaput-rattlesnake` (`2fd7f6b`) | Both are clean detached checkouts; both tips are ancestors of the integration branch. No uncommitted or unique work. |

## Native dependency decisions

Firebase was updated from 12.19.2 to **12.19.3**, with the matching minimum in `project.yml`, regenerated Xcode project and exact resolved revision `42cf1417c51c5e3bfbae5d3ab89b778f8fdc4bb8`. Other transitive revision/version pairs were preserved. The [official release notes](https://firebase.google.com/support/release-notes/ios) identify this as the security patch for the 12.x line.

Two native bot suggestions were deliberately left unmerged:

1. **Firebase 13.0.1 (`d79c25f`): incompatible dependency constraint.** ARCore 1.56.0 and 1.57.0 both declare Firebase `.upToNextMajor(from: "12.0.0")`. Selecting Firebase 13 contradicts that constraint. The old 13.0.1 proposal is also behind the current security patch. The compatible 12.19.3 security update was applied instead. See the locked [ARCore 1.56.0 manifest](https://github.com/google-ar/arcore-ios-sdk/blob/1.56.0/Package.swift) and [Firebase release notes](https://firebase.google.com/support/release-notes/ios).
2. **ARCore 1.57.0 (`5e0f75f`): artifact checksum mismatch.** Xcode package resolution failed for `ARCoreCloudAnchors`; a separate direct download reproduced the same result. The downloaded file is a ZIP, 5,640,576 bytes. Expected SHA-256: `7e37f28420b7586dc3222831e1dc28546f33fdf21caadf8eff3010b337eb28c2`; actual: `4a0bfcd93f5e4eea2e2a2ebf0ddacf9c3f288c09d70937c469268b00de8d538e`. The attempted merge was aborted; ARCore **1.56.0** remains. No checksum was changed or bypassed. Manifest: [ARCore 1.57.0 Package.swift](https://github.com/google-ar/arcore-ios-sdk/blob/1.57.0/Package.swift); artifact URL: `https://dl.google.com/arcore/swiftpm/1.57.0/CloudAnchors.zip`.

The failed resolver log, independent ZIP, both ARCore manifests and attempted patch are preserved under `build/branch-reconciliation-20261025/`. A future ARCore update needs a matching official artifact and checksum; Firebase 13 additionally needs a compatible ARCore dependency declaration.

## Verification

Installed both final npm trees from their lockfiles using `npm ci --ignore-scripts`. Initial and final full-tree npm audits reported zero findings for both Functions and admin. Final package resolution succeeded with Firebase 12.19.3 and ARCore 1.56.0.

| Check | Result |
| --- | --- |
| Functions typecheck / unit tests | Passed / 188 passed |
| Admin typecheck / unit tests / production build | Passed / 43 passed / passed |
| Repository / Python tests | 57 / 33 passed |
| Public admin browser tests | 26 passed |
| Firestore / Storage rules | 95 passed |
| Cost / map regressions | 25 passed |
| Functions callable integration | 171 passed |
| Isolated location-note integration | 29 passed |
| Admin emulator integration | 129 passed |
| Native iOS | 238 passed, 2 physical-device tests skipped, 0 failed |

Full logs are under `build/branch-reconciliation-20261025/`. Existing branches and historical worktrees are retained. The unified source remains on PR #58's integration branch; this action does not deploy Firebase, enable payments or submit a store build. GitHub CI for the final pushed head is separate from these local checks.
