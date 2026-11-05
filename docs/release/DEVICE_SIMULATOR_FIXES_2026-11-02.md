# iPhone baseline follow-up — 2 November 2026

Later follow-up: the phone reconnected, two physical native tests passed, and the subsequent solo audit found and fixed additional AR races. The owner-approved invite IAM repair was applied. Latest results and remaining camera/installation limits: [solo app audit](SOLO_APP_BUG_AUDIT_2026-11-02.md). The initial-pass results below are retained chronologically.

## Result and limits

Three specialist agents investigated AR lifecycle, authentication/data recovery and UI layout. Their integrated fixes pass the native suite and seven selected UI tests on the iPhone 14 Pro Max simulator. A signed Debug build for physical iOS also succeeds. Physical runtime acceptance remains open: the first device capture showed a locked phone, and the final `devicectl` inventory reports the physical iPhone unavailable. The new build has not been installed on that phone in this pass.

Existing unrelated working-tree changes were preserved. No commit, push, Firebase deployment or production content write was performed.

## Confirmed defects and changes

| Area | Confirmed source defect | Resulting behavior |
| --- | --- | --- |
| Shared camera view | An underlying SwiftUI update could reparent the singleton ARView away from the foreground sheet. | Attached foreground hosts determine ownership; ordinary underlying updates cannot steal the view. |
| Camera lifecycle | Cancelled frame waits and old screen cleanup could fail or stop a replacement session. | Run generations, separate owner tokens and cancellation checks fence startup, cleanup, background readiness and delayed callbacks. |
| AR viewer | Revocation and deferred resolver cleanup could stop a newer camera owner; detached world-map decoding could mutate a replacement session. | Per-attempt camera leases and owner/run/cancellation checks protect resolver handoffs and map restoration. Existing location/access gates remain. |
| Callable recovery | A forced ID-token refresh failure was swallowed, allowing replay with a stale credential. | Refresh errors propagate; recovery remains bounded to one refresh/retry and cannot replay across account changes. |
| Lists and invites | Raw provider diagnostics reached invite UI; fetch errors could look like empty lists; My Posts dropped existing remote rows on failed refresh. | Localized safe errors, explicit loading/error/empty states, manual retry and account-fenced retention of existing rows. |
| Discover | Fetch failure was presented as “Henüz not yok”; pagination used an inconsistent material rectangle. | Failure gets its own retry state; a shared compact styled pagination button keeps current rows visible. |
| Map preview | A vertical ScrollView accepted its maximum height even for one note. | Height follows scaled row count up to a bounded cap; single-note previews leave more map visible. |
| Accessibility | Outer screen identifiers propagated onto nested controls, hiding the intended test selectors. | Explicit accessibility containers and the identifier on the actual pagination Button preserve independent controls. |
| AR notice | A pre-existing working-tree edit had removed the persistent Google AR notice. | The accessible disclosure control is restored when ARCore is enabled. It is absent in inert simulator fixtures where ARCore is disabled. |

The original physical `021-invite.png` proves raw `UNAUTHENTICATED` reached UI. It does **not** establish whether the deployed rejection originated in Auth, App Check or another provider condition. The fixes above are independently confirmed client defects, not proof of the sole cause of that rejection or the phone's black camera.

The original `028-discover-retry.png` contains populated results after retry; it is not a persistent empty-feed failure. Original screenshot `042` shows a measured location fix despite its filename. Baseline PNGs were not modified.

## Validation

| Check | Final evidence |
| --- | --- |
| Native XCTest suite | 289 executed: **287 passed, 2 skipped, 0 failed** |
| Selected UI suite | **7 passed, 0 failed**: four readability regressions, primary tabs, AR viewer, permission recovery |
| Final simulator run | `build/device-fixes-20261102/verification-r3.xcresult`; `TEST SUCCEEDED` |
| Physical iOS compilation/signing | `build/device-fixes-20261102/device-build.log`; generic iOS Debug `BUILD SUCCEEDED` |
| Localization extractor regressions | `python3 scripts/l10n/test_extract.py`: 2 passed |
| Generated localization consistency | `python3 scripts/l10n/build_catalog.py --check`: 727 source keys × 12 languages |
| Release localization policy | `node scripts/check-localization.mjs --release`: 733 total catalog keys, 12 languages, 0 needs-review |
| Patch whitespace | `git diff --check`: passed |

The two native skips require physical hardware: `testPhysicalCameraFramesResumeAcrossNewPinSessions` and `testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements`. Simulator UI screenshots use explicit inert fixtures; their black AR background is not real camera evidence. Earlier editor/GIF and location-note/surface UI checks passed in the preceding integrated run; the final selected run is the seven-test set listed above.

The preceding run's two UI failures were missing accessibility selectors, before geometry assertions ran. Actual AX evidence showed the pagination control was a 398 × 46 pt Button and the map note row was 44 pt. The final run retains the geometry/hittability assertions and passes after correcting accessibility boundaries.

Translations were added through the 12 JSON tables and catalogs regenerated using the project script. The extractor now excludes stored UserDefaults identifiers from UI keys; regression tests keep real Turkish disclosure text extractable. Private configuration values are not catalog entries.

## Evidence and remaining physical checks

- Screenshot gallery: `build/device-fixes-20261102/index.html`.
- Final screenshots and AX trees: `build/device-fixes-20261102/verified-screenshots/`.
- Agent findings: `build/device-fixes-20261102/{ar,auth,ui}-findings.md` (their intermediate verification notes are superseded by the integrated results above).
- Final connection inventory: `build/device-fixes-20261102/devices-final.json`.

When the phone is available and unlocked, install the signed build without removing app data, then verify normal authenticated operation: Map → AR placement → dismiss → AR tab → Share → camera refinement → dismiss, including quick transitions and background/foreground. Verify live camera frames, plane-ready and explicit approximate placement separately. Retry invites/Discover and inspect sanitized app/provider errors if rejection remains. Confirm live GPS stop/restart and the Google AR disclosure on enabled AR screens. No account mutation or note publication is needed for this acceptance pass.

Smaller-screen and large accessibility-text layout coverage, live GPS/ARCore relocalization and provider acceptance are not established by this selected simulator run.
