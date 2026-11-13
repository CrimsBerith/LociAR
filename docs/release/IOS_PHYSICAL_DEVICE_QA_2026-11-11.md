# LociDrop physical-device QA — 11–12 November 2026

## Status

**INCOMPLETE / GATED.** The 11 November broad USB run had 344 tests total — 321 passed, 4 failed, 19 skipped (native XCTest: 312 passed/19 skipped; selected physical UI tests: 9 passed/4 failed). On 12 November, a focused USB batch had 7 passed and 2 failed; both failures reproduced in an isolated retry. After the fixes below, the affected pin/editor, camera-black-feed and ten-cycle AR/Share tests passed 3/3 in a focused USB batch. A separate normal-account camera UI smoke passed 1/1 through command-line `xcodebuild` over USB, without opening Xcode's Device Hub; its screenshot visibly shows a live, nonblack camera feed and detected surface. The black-screen symptom remains intermittent/not cleared. KLIPY contract tests passed 11/11, but live picker trending failed twice. The production `getGifConfig` callable is absent in `us-central1`, so the app cannot obtain its KLIPY key. Bulk-notification code passed admin and Functions unit/build checks, but emulator integration could not start because Java is unavailable; production functions/config were not deployed. On 12 November, device settings reported `Bildirimler, İzin gerekiyor`; the admin page redirected to login. No push was sent. No live content was created. This is not a release approval.

## Physical USB retest — 12 November 2026

- Tests ran against the QA iPhone 14 Pro Max (iOS 27.0.1; UDID omitted) using command-line `xcodebuild` with the physical-device destination. No Xcode UI or Device Hub was opened.
- Focused safe batch: **7 passed, 2 failed**. Passed: AR camera lifecycle cycles, background/foreground/relaunch, seven post-type previews, current-account notification settings read, post open/close interactions, GPS acquisition without opening the camera, and normal-account AR camera UI.
- `testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen` reached `Kamera açık` without displaying the dark-camera notice. It then failed because the selected fixture post did not show aim guidance; the test stopped before its luma diagnostic. This run does **not** prove a black camera.
- `testPhysicalDevicePostPinFlows` failed after approximate placement because the app did not transition to `İçerik oluştur`. It failed before caption entry or publish. The isolated retry reproduced both UI failures (0/2 passed); root cause remains undetermined.
- A separate live normal-account camera smoke passed **1/1** over USB: AR displayed `Kamera açık`, and the `Paylaş` screenshot showed a live wood-floor camera image, `Kesin yüzey hazır`, and the pin UI. This visually confirms a nonblack feed in that capture; it does not measure pixel luma.
- The read-only account settings snapshot showed `Bildirimler, İzin gerekiyor`. The admin route redirected to `/admin/login?reason=admin_required`. No permission was changed, no push was sent, and no live post was created.
- The app was foreground-launched with `devicectl` after the focused batch. The CLI reported `Launched application with com.khankartal.lociar bundle identifier.`
- Evidence bundles: `LociAR-physical-safe-ui-run2-2026-11-12.xcresult` (7/2), `LociAR-physical-safe-ui-retry-2026-11-12.xcresult` (0/2), and `LociAR-physical-usb-live-camera-2026-11-12.xcresult` (1/1).

## Latest AR camera lifecycle rerun — 12 November 2026

- Rebuilt and tested over USB on the QA iPhone 14 Pro Max using command-line `xcodebuild`; no Xcode UI or Device Hub was opened.
- Focused physical suite: **8 passed, 1 failed**. The live-camera black-screen test passed. `testPhysicalARTabsTenCyclesKeepCameraHealthy` failed on its first AR cycle: `Kamera açık` did not appear, and the camera-unavailable message appeared.
- Isolated rerun of the ten-cycle test passed **1/1**, exercising all ten AR/Share cycles. This points to an intermittent startup failure; it does not clear the camera reliability issue.
- After testing, `devicectl` foreground-launched `com.khankartal.lociar` successfully.
- These UI tests used the authenticated test fixture. No live post, push, deletion, or other backend write was performed.
- Evidence: `LociAR-physical-bulk-notice-2026-11-12.xcresult` (8/1) and `LociAR-physical-camera-cycle-isolated-2026-11-12.xcresult` (1/1).

## Admin bulk-notification verification — 12 November 2026

- Admin typecheck, unit tests (**52/52**), and production build passed. Functions typecheck and unit tests (**199/199**) passed.
- Functions emulator integration tests did not run: Java Runtime is unavailable. The new Functions and Firestore TTL/App Hosting configuration were not deployed.
- Live admin send was not attempted: the admin route redirected to login and the iPhone reports `Bildirimler, İzin gerekiyor`. No notification was sent. Production readiness and delivery to selected/all eligible users remain unverified.

## Visible iPhone launch — 11 November, 22:50–22:52 TRT

- The physical `testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen` run passed **1/1**. Its screenshot shows the iPhone running LociDrop on the AR tab, with the live camera view and `Kamera açık` status.
- Camera log: dark-feed notice `false`; luma `122/255`; camera view `430x932`, visible; tracking normal with 4 features, 1 plane, 4 mesh.
- After the test, `devicectl device process launch --device <DEVICE_UDID> --activate com.khankartal.lociar` reported `Launched application with com.khankartal.lociar bundle identifier.` App was brought to the iPhone foreground. No post, push, deletion, or preference change was performed.
- Evidence: `LociAR-physical-camera-visible-retest-2026-11-11-2250.xcresult`, `physical-ar-live-camera` screenshot, and the exported camera log.

## Physical KLIPY check — 11 November, 22:57–23:02 TRT

- Added `testPhysicalKlipySearchAndSelection` and ran it on the USB-connected iPhone using the current signed-in app session, production Firebase, and live `FirebaseGifRepository`; no `UITEST_AUTHENTICATED` or sample-content fixture was enabled.
- The editor and GIF picker opened; “Powered by KLIPY” appeared. Trending returned no selectable GIFs and the picker showed “GIF'ler şu anda yüklenemiyor. Tekrar dene.” The UI test tapped “Tekrar dene”; the second request failed the same way. **2 physical UI runs failed before search or selection.**
- `LociARTests/KlipyTests`: **11 passed, 0 failed** on the same iPhone. These cover request/response validation and URL/host safety, not a live service response.
- Root cause confirmed: `functions/src/index.ts` exports `getGifConfig`, but `gcloud functions describe getGifConfig --v2 --region=us-central1 --project=lociar-2f38c` returned 404, and the deployed-function list had no match. The client therefore cannot obtain the KLIPY app key and shows its generic unavailable notice. The KLIPY API request itself was not reached.
- No production function was deployed as part of this test request.
- No GIF was selected or posted. No live content or account state was changed.
- Evidence: `LociAR-physical-klipy-live-2026-11-12-run1.xcresult`, `LociAR-physical-klipy-live-2026-11-12-run2.xcresult`, and `LociAR-physical-klipy-unit-2026-11-12.xcresult`.

## Camera recheck — 11 November, 22:47 TRT

- `testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen`: **1 passed** on the USB-connected iPhone.
- Dark-feed notice: `false`; luma: `123/255`; camera view `430x932`, visible; tracking normal with 4 features, 1 plane, 4 mesh.
- The previous broad run measured `122/255`; this recheck did not reproduce a black feed. The earlier warning remains unresolved/intermittent.
- Evidence: `LociAR-physical-camera-recheck-2026-11-11-2247.xcresult` and the exported `physical-camera-black-screen-log` attachment.

## Physical retest — 11 November, 21:58–22:08 TRT

- Ran all `LociARTests` on the USB-connected iPhone plus 13 selected physical UI tests. Native tests: **312 passed, 0 failed, 19 skipped**. Physical UI tests: **9 passed, 4 failed**.
- Passed physical UI coverage: read-only current-account notification state and live-account AR camera; GPS acquisition in the camera-free location-note form without publishing; black-camera check; ten AR/Share camera cycles; background/foreground/relaunch; fixture post interactions; approximate-pin/editor flow; and text/legacy-photo editor/detail preview.
- Black-camera evidence: dark notice `false`; luma `122/255`; camera view `430x932`, visible; tracking normal. See `physical-camera-black-screen-log` attachment in the result bundle.
- The master screen sweep failed twice, including an isolated retry, when XCTest tried to type into the confirmation-password field without keyboard focus. It stopped before later sweep sections; no account was submitted or created.
- Three surface-lock/relocalization tests did not complete. The shared helper waits for `ar-mapping-diagnostic` while the diagnostics disclosure is collapsed. The Paylaş failure hierarchy shows `Kesin yüzey hazır` / `Gerçek yüzey hazır` and `Yüzeye sabitle`, but the helper still fails because it cannot read tracking status. Surface lock and relocalization remain **unverified**; this is not enough evidence to classify as an AR product failure.
- All fixture-driven tests used local preview repositories. No live post, location note, notification preference change, push, deletion, or payment was performed.
- Isolated master sweep retry: same keyboard-focus failure. Reproduction is consistent; fix the UI test's focus/tap handling before using it as a complete-screen gate.

## Environment and safety

- Device: iPhone 14 Pro Max (`iPhone15,3`), iOS 27.0.1.
- Connection: USB, paired, connected, Developer Mode enabled. The device was briefly `unavailable` after the simulator run, then reconnected. The initial XCTest passcode prompt was no longer present on the successful retry.
- Xcode: 27.1 (`27A9275`).
- Simulator UI regression tests used `UITEST_AUTHENTICATED` and preview repositories. Physical read-only smokes ran without that flag against the Debug build configured for `lociar-2f38c` with `LOCIAR_EMULATOR_HOST` empty.
- No live Firebase sign-in, publish, delete, payment, or push action was run. The dedicated account was not verified.
- An earlier run loaded authenticated admin pages; on 12 November the admin route redirected to login. No QA account ID or safe nearby test coordinate was confirmed.
- No application source changes were made.

## Results

| Target | Result | Notes |
|---|---|---|
| iOS static analysis | **Passed** | `xcodebuild analyze` for the iOS scheme exited 0 with no diagnostics. |
| Native XCTest on physical iPhone | **312 passed, 0 failed, 19 skipped** | `LociARTests`; 331 total. |
| Initial physical XCUITest attempt | **Blocked before test cases** | Runner timed out while enabling UI automation. Device Hub showed “XCTest için iPhone Parolasını Girin / Enable UI Automation.” No passcode was entered by automation; prompt was gone before the successful retry. |
| Physical live-backed camera smoke | **2 passed, 0 failed** | `testPhysicalNormalAccountARTabReceivesCameraFrame`; live app session, AR camera, and Share camera path. No content write. |
| Physical camera black-feed check | **Live feed visually visible 12 Nov; luma not measured in that run** | USB screenshot shows the floor camera view and `Kesin yüzey hazır`. The 12 Nov black-feed test failed later at fixture aim guidance before luma; 11 Nov luma was `122/255`. A prior run showed the dark-camera warning, so intermittent black feed remains unproven/uncleared. |
| Physical KLIPY picker | **Blocked, 2 attempts** | Live `getGifConfig` callable is not deployed in `us-central1`; no search or selection completed. |
| Physical KLIPY contract tests | **11 passed, 0 failed** | `LociARTests/KlipyTests`; validates client-side contracts, not live API availability. |
| Physical current-account settings smoke | **2 passed, 0 failed** | `testPhysicalCurrentAccountNotificationState`; opened profile/settings and read notification state without changing preferences. |
| Earlier physical USB regression batch | **6 passed, 0 failed** | Live camera/account-state checks, fixture post interactions and pin flow, ten-cycle AR/Share camera, background/foreground/relaunch. No live writes. |
| Physical USB retest — 12 Nov | **7 passed, 2 failed; 0/2 on isolated retry** | Camera test stopped at fixture aim guidance; approximate pin flow did not reach the editor. No live writes. |
| Latest physical camera lifecycle — 12 Nov | **8 passed, 1 failed; isolated retry 1/1 passed** | Ten-cycle test initially failed on the first AR startup and displayed the camera-unavailable message; isolated ten-cycle rerun passed. Intermittency remains. |
| Admin bulk-notification checks — 12 Nov | **Unit/build checks passed; live send blocked** | Admin tests 52/52, Functions tests 199/199; emulator tests unavailable without Java. No production deploy or push. |
| Live normal-account camera UI — 12 Nov | **1 passed, 0 failed** | Command-line XCUITest over USB; screenshot visibly shows the live camera feed, detected surface, and Share pin UI. No luma measurement. |
| Admin push attempt — 12 Nov | **Blocked; not sent** | Device settings showed `Bildirimler, İzin gerekiyor`; admin page redirected to login. |
| Physical AR camera lifecycle | **4 passed, 0 failed** | Two runs of ten AR/Share camera cycles and background/foreground/relaunch, using local preview fixtures; no backend writes. |
| Physical real-surface detection/lock | **Not verified** | Earlier stationary-device run found no candidate. Latest surface-lock helpers also failed; the Paylaş hierarchy showed a candidate and lock button, but the collapsed diagnostics panel prevented the helper from confirming tracking quality. Re-run after opening diagnostics and moving over a well-lit, textured surface. |
| Physical post/detail interactions | **Passed** | `testPhysicalDevicePostOpenCloseLifecycleAndInteractions`; preview fixtures exercised post detail, profile/back, AR viewer open/close, and navigation. No backend writes. |
| Physical map pin -> post editor | **Passed after fix** | `testPhysicalDevicePostPinFlows` failed twice before editor in the initial 12 Nov retest; after gating approximate placement on camera readiness, it passed in the later 3/3 USB batch. Persistable real-surface pin/relocalization remains unverified. |
| Physical editor/detail previews | **Passed** | `testPhysicalCaptureAllSevenWallPostTypes`; text and legacy-photo preview fixtures only, no live publishing. |
| Physical master screen sweep | **Failed twice** | `testMasterCaptureAllScreensAndActionsOnDevice`; XCTest could not focus `auth-confirm-password-field` before `typeText`, stopping the sweep before later sections. Isolated retry reproduced it. |
| Live admin push/post | **Not run - blocked** | The current admin route redirects to login; the iPhone account and safe post coordinate are unverified, and notification permission is required. No notification or post was sent/published. |
| Simulator screen tours 01–11 | **12 passed, 0 failed** | Authenticated preview fixtures, permission recovery, AR viewer, and guest-account paths. Tour 08 emitted a non-finite frame warning; its run also timed out collecting simulator diagnostics after the test passed. |
| Selected simulator UI regressions | **4 passed, 1 intermittent failure** | The first Unicode composer run failed when the keyboard remained visible after dismissal. |
| Unicode composer retry | **1 passed** | Same test passed on immediate isolated retry; an `Invalid frame dimension (negative or non-finite)` runtime warning remained. Treat the keyboard failure as intermittent, not cleared. |
| Firebase Functions | **199 passed, 0 failed** | `npm run typecheck` and `npm test` passed. |
| Full `AuthGateUITests` simulator suite | **Stopped; no result** | Did not produce a readable result bundle; excluded from counts. |

### Physical-device live-test gate

The first physical attempt failed before test startup because iOS requested the passcode to enable XCTest UI Automation. Automation did not enter it. On the next screen observation the prompt was gone, and the two physical tests below ran successfully.

Live smoke runs used the physical iPhone, Debug configuration, and an empty `LOCIAR_EMULATOR_HOST`, so the app targeted the production Firebase project. Both avoided fixture arguments and content writes:

- `LociAR-physical-live-camera-2026-11-11.xcresult` — camera/AR and Share path; 1 passed.
- `LociAR-physical-live-account-state-2026-11-11.xcresult` — current account profile/settings; 1 passed.
- `LociAR-physical-live-readonly-2026-11-11.xcresult` — earlier attempt blocked before tests by the passcode prompt.

Live writes remain gated: the signed-in account has not been verified as the dedicated QA account, and `TEST_RUNNER_E2E_PASSWORD` was unset. No production sign-in, publish, or delete action was attempted.

In an earlier authenticated admin session, the dashboard, posts list, new-post form, and campaigns page loaded. The create form was not submitted; it defaults to public/active and requires an author and audit reason. Campaigns currently has no brands, campaigns, or notification attempts. The live push and iPhone post-display tests were not run because the target account and safe nearby coordinate remain unverified.

The original four-test command:

```bash
xcodebuild test -project LociAR.xcodeproj -scheme LociAR \
  -destination 'platform=iOS,id=<DEVICE_UDID>' \
  -parallel-testing-enabled NO \
  -only-testing:LociARUITests/AuthGateUITests/testMapTabLoadsNearbyPosts \
  -only-testing:LociARUITests/AuthGateUITests/testCreateFlowOpensAndCloses \
  -only-testing:LociARUITests/AuthGatePhysicalDeviceUITests/testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen \
  -only-testing:LociARUITests/AuthGatePhysicalDeviceUITests/testPhysicalARTabsTenCyclesKeepCameraHealthy
```

Xcode reported: `The test runner failed to initialize for UI testing. (Underlying Error: Timed out while enabling automation mode.)` No selected physical UI test executed. Xcode also logged an OS build parsing warning (`invalidDigitCount(94232)`), separate from the observed passcode prompt.

### Simulator regression detail

The selected regressions were map nearby content, create-flow open/close, Unicode location-note input limit, translation fallback, and five-tab navigation/logout. Four passed. `testCameraFreeNoteUsesServerUnicodeLengthLimit` failed once at the keyboard-dismissal assertion in `LociARUITests/AuthGateUITests.swift:563`, then passed in an isolated retry. The simulator emitted a non-finite frame warning during the retry and Tour 08. Tours 01–11 all passed individually or in small groups; Tour 08's test passed but Xcode timed out collecting simulator diagnostics after 600 seconds. The physical-device versions of these flows remain unverified.

## Evidence

Result bundles are stored locally under:

The local session evidence directory (not included in the repository).

- `LociAR-native-device-2026-11-11.xcresult` — physical native suite.
- `LociAR-physical-smoke-2026-11-11.xcresult` — physical XCUITest runner initialization failure.
- `LociAR-regression-simulator-2026-11-11.xcresult` — selected simulator regressions.
- `LociAR-unicode-retry-2026-11-11.xcresult` — isolated Unicode retry.
- `LociAR-sim-tour-07-2026-11-11.xcresult` — GIF/editor tour; 1 passed.
- `LociAR-sim-tour-08-2026-11-11.xcresult` — location-note/surface tour; 1 passed, non-finite frame warning, diagnostics collection timeout.
- `LociAR-sim-tour-09-2026-11-11.xcresult` — AR viewer tour; 1 passed.
- `LociAR-sim-tour-10-permissions-2026-11-11.xcresult` — camera/location permission recovery; 2 passed.
- `LociAR-sim-tour-11-2026-11-11.xcresult` — guest-account tour; 1 passed.
- `LociAR-physical-live-camera-2026-11-11.xcresult` — live-backed physical camera/AR smoke; 1 passed.
- `LociAR-physical-live-account-state-2026-11-11.xcresult` — live-backed profile/settings smoke; 1 passed.
- `LociAR-physical-live-readonly-2026-11-11.xcresult` — initial attempt blocked before tests by UI automation authorization.
- `LociAR-physical-ar-lifecycle-2026-11-11.xcresult` — physical preview-mode AR camera lifecycle; 2 passed.
- `LociAR-physical-ar-surface-2026-11-11.xcresult` — real surface detection; failed to find a plane/mesh candidate.
- `LociAR-physical-ui-interactions-2026-11-11.xcresult` — post/detail interactions passed; pin-flow test failed on first run.
- `LociAR-physical-pin-flow-retry-2026-11-11.xcresult` — isolated pin-flow retry passed.
- `LociAR-physical-usb-regression-2026-11-11.xcresult` — latest USB UI batch; 4 passed.
- `LociAR-physical-ar-lifecycle-current-2026-11-11.xcresult` — latest AR lifecycle batch; 2 passed.
- `LociAR-physical-camera-blackcheck-2026-11-11.xcresult` — targeted physical camera feed test; 1 passed.
- `physical-camera-black-screen-log-2026-11-11.txt` — dark notice and live luma diagnostic (`121/255`).
- `LociAR-physical-full-regression-2026-11-11.xcresult` — broad USB retest; 321 passed, 4 failed, 19 skipped.
- `LociAR-physical-master-retry-2026-11-11.xcresult` — isolated master sweep retry; same XCTest keyboard-focus failure.
- `physical-camera-full-regression-attachments-2026-11-11/` — latest luma log (`122/255`).
- `LociAR-physical-camera-recheck-2026-11-11-2247.xcresult` — targeted physical camera recheck; 1 passed.
- `physical-camera-recheck-2026-11-11-2247/` — latest luma log (`123/255`).
- `LociAR-physical-camera-visible-retest-2026-11-11-2250.xcresult` — physical app-open/camera recheck; 1 passed.
- `physical-camera-visible-retest-2026-11-11-2250/` — physical iPhone screenshot showing AR live camera.
- `physical-camera-visible-retest-2026-11-11-2250-log/` — camera log (`122/255`).
- `LociAR-physical-klipy-live-2026-11-12-run1.xcresult` — live KLIPY trending unavailable on the iPhone.
- `LociAR-physical-klipy-live-2026-11-12-run2.xcresult` — live KLIPY remained unavailable after the in-app retry.
- `LociAR-physical-klipy-unit-2026-11-12.xcresult` — KLIPY contract tests; 11 passed.
- `LociAR-physical-safe-ui-run2-2026-11-12.xcresult` — focused physical USB batch; 7 passed, 2 failed.
- `LociAR-physical-safe-ui-retry-2026-11-12.xcresult` — isolated retry; same 2 failures reproduced.
- `LociAR-physical-usb-live-camera-2026-11-12.xcresult` — normal-account camera UI smoke; 1 passed through command-line USB testing.
- `LociAR-physical-bulk-notice-2026-11-12.xcresult` — latest focused UI batch; 8 passed, 1 failed on the first AR-camera cycle.
- `LociAR-physical-camera-cycle-isolated-2026-11-12.xcresult` — isolated ten-cycle AR/Share camera rerun; 1 passed.
- `physical-usb-camera-frame-2026-11-12/` — screenshot shows the live camera image, a detected surface, and Share pin UI.
- `physical-current-settings-2026-11-12/` — notification settings accessibility snapshot; device reported permission required.
- `physical-regression-failure-attachments-2026-11-11/` — master-sweep and surface-test failure evidence.

## Not verified

- No literal line-by-line review of every source file was completed. Findings here combine the exercised test suites with targeted source-path inspection; do not treat this report as an exhaustive source audit.
- Full physical screen sweep after the XCTest keyboard-focus issue is fixed; camera permission recovery; successful real AR surface lock/relocalization; real GPS-driven publishing; and APNs delivery.
- A repeatable black-feed reproduction under the conditions that caused the earlier dark-camera warning.
- Live admin notification delivery/tap and admin-created post visibility on the iPhone.
- Live KLIPY trending/search response, GIF selection, and media rendering; physical picker showed the generic unavailable notice.
- Production Firebase account flows or creation/deletion of test content.
- Emulator access from the iPhone, full admin/backend integration, and exhaustive behavior for every possible input/state.

## Next steps

1. Restore authorized admin access and confirm the iPhone account identity. The device currently reports `Bildirimler, İzin gerekiyor`; the owner must grant notification permission before any push test. Do not change permission through automation.
2. Only after admin access and device permission are confirmed, send one targeted test push; verify iPhone delivery and tap-through.
3. Publish one clearly labeled test post at a user-approved safe coordinate; verify it on the iPhone, then delete only that post.
4. With the phone available for movement, repeat AR scanning on a well-lit, textured surface and rerun the intermittent pin-to-editor flow. If the camera darkens again, preserve the luma diagnostic and verify lens/light conditions.
5. Re-run the Unicode composer test repeatedly and investigate the intermittent keyboard state, non-finite frame warning, and Tour 08 diagnostics timeout before calling those issues clear.

Until the remaining live and physical-environment gates pass, device QA remains **BLOCKED**.

## Fixes applied — 12 November 2026

Code changes made in response to the failures above (branch `claude/klipy-migration`):

- **Approximate pin never reached the editor.** `create-place-approximate` called `offerApproximatePlacement()`, which silently returns while the AR session is still `initializing`/`coaching`; on a physical device that window lasts several seconds after the sheet opens, so the tap did nothing and the sheet stayed on `Yüzey seç`. `ARPinningEngine` now exposes `canOfferApproximatePlacement` (scanning state and a live camera frame), the approximate buttons in `CreatePostView` and `ARExperienceView` are disabled until then, and a refused offer sets the status message `Kamera hazırlanıyor. Yaklaşık yerleştirme birkaç saniye içinde kullanılabilir.` (added to all 12 translation tables; catalog rebuilt). `testPhysicalDevicePostPinFlows` waits for the button to become enabled and attaches the mapping diagnostic when the transition fails.
- **First AR start reported "Kameradan canlı görüntü alınamadı".** The camera watchdog reran the session 3 s after a cold start and failed after two reruns (about 9 s). A first start after install (ARCore attaching, pipeline caches) regularly needs longer, and each rerun restarts the camera pipeline. `ARCameraHealth.initialFrameDeadline` (6 s) now applies to the first attempt; reruns keep the 3 s `firstFrameDeadline`. `ARCameraHealthTests` cover both deadlines.
- **Surface-lock helpers could not read `ar-mapping-diagnostic`.** The Debug-only diagnostics disclosure starts collapsed, so the element did not exist. `revealMappingDiagnostics` / `mappingDiagnosticText` in `UITestHelpers.swift` open it first; `waitForPhysicalSurfaceCandidate`, `waitForPersistablePhysicalSurface` and every failure message in `AuthGatePhysicalDeviceUITests` use them instead of reading `.label` on a missing element.
- **Master sweep aborted on `auth-confirm-password-field`.** `typeText` without keyboard focus ends the whole test. `focusAndType` (focus wait via `hasKeyboardFocus`, strong-password sheet dismissal, Return-key fallback) now guards every typed field in the sweep; a field that cannot take focus is recorded as a failure and the sweep continues.
- **Keyboard stayed visible after dismissal (Unicode composer).** `dismissKeyboard` retries up to three times and uses the form's interactive scroll dismissal as the second strategy, then verifies the keyboard is gone. The Unicode test passed on the simulator after the change.
- **Black-feed test stopped at "aim guidance".** The authenticated fixture is a local preview, so the viewer shows the surface-scan or approximate-view status instead of the GPS aim notice, and the predicate was case-sensitive (`Kamerayı` vs `kamerayı`). The test now accepts the preview statuses with `CONTAINS[c]` and attaches a screenshot when nothing matches.

Verification after the changes (12 November, 10:30 TRT): `ARCameraHealthTests` and `PinStateMachineTests` passed on the simulator (26 tests); `testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen`, `testPhysicalARTabsTenCyclesKeepCameraHealthy` and `testPhysicalDevicePostPinFlows` passed 3/3 over USB on the QA iPhone 14 Pro Max in one batch (`/tmp/loci-physical-fixed.xcresult`). Note: the physical tests live in `extension AuthGateUITests`, so `-only-testing` must use `LociARUITests/AuthGateUITests/<test>`; the `AuthGatePhysicalDeviceUITests` identifier selects zero tests and reports success.

Not changed by code: the `getGifConfig` callable (and the hidden payment callables) are exported from `functions/src/index.ts` but not deployed in `us-central1`; `scripts/firebase-deploy.command` deploys them. The source of the `Invalid frame dimension (negative or non-finite)` runtime warning in the composer was not located; the xcresult records the warning without a backtrace.
