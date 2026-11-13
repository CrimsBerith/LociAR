# iPhone physical-device QA — 6 November 2026

## Device and result

Tested on the wired iPhone 14 Pro Max (`iPhone15,3`, iOS 27.0.1). Physical hardware tests used a Debug build. **The device run is not fully green**: core native/camera/GPS tests passed, while five UI checks and two AR surface-lock checks failed. Emulator-backed sign-up and account flows stopped at the first network-reachability check because iOS reported `Local network prohibited`.

No live Firebase project, App Store service, real user account, or production content was used by the emulator suite. The device E2E script stopped before creating its temporary test account or running dependent flows.

## Results

| Suite | Passed | Failed | Skipped | Notes |
|---|---:|---:|---:|---|
| Native iOS tests on iPhone | 266 | 0 | 18 | 284 total. Both device-only camera-frame and fresh-GPS/restart tests passed. Skips are tests requiring Mac checkout/source inspection or other host-only resources. |
| CI-safe UI tests on iPhone | 46 | 5 | 2 | 53 total. Two tests are simulator-only. The five failures were rerun with Turkish test locale and reproduced. |
| Targeted physical GPS/AR UI tests | 4 | 2 | 0 | Six tests run directly on hardware; details below. |
| Device-to-Firebase-emulator E2E | 0 | 1 | 0 | Auth-emulator reachability failed; dependent sign-up, publishing, sign-in/out, and deletion flows were not run. |

### Passed hardware UI scenarios

- Location-note UI obtained real GPS without opening the camera.
- AR tab showed the live camera instead of a black screen.
- AR camera survived ten AR/share tab cycles.
- AR remained available across background/foreground and app relaunch.
- The native camera-frame test successfully prepared three new pin sessions.
- The native GPS test received fresh real measurements before and after stopping/restarting Core Location.

### Failed or blocked scenarios

CI-safe UI tests, reproduced on retry:

- `testCameraFreeNoteUsesServerUnicodeLengthLimit`: XCTest could not type because the text field had no keyboard focus.
- `testCreateFlowOpensAndCloses`: tapping create did not present the expected “Yüzey seç” screen.
- `testDeviceTranslationKeepsOriginalWhenEngineIsUnavailable`: the expected `note-translation-unavailable` element was absent on this device.
- `testFiveTabNavigationAndLogoutReturnsToAuthGate`: expected `profile-sign-out` control was not found.
- `testMapTabLoadsNearbyPosts`: tapping a map result did not reach the expected “Not” screen.

Physical AR:

- `testPhysicalDeviceFindsAndLocksARealSurface`: no plane/mesh candidate was found within the test window.
- `testPhysicalPaylasTabLocksARealSurface`: the physical surface-lock assertion failed; diagnostic UI was unavailable.

Firebase emulator E2E:

- `testEmulator00AuthEndpointReachable` failed with `NSURLErrorDomain -1009` and `Local network prohibited` when the iPhone tried to reach the Mac's Auth emulator at `192.168.1.157:9099`. The script correctly stopped; no dependent emulator E2E cases ran.
- To retry, enable **Settings → Privacy & Security → Local Network → LociDrop** on the iPhone. The physical plane-lock cases also need the camera aimed and moved over a well-lit, textured surface during the scan window.

## Evidence

Ignored local test artifacts are in `scripts/.e2e/device-20261106-011415-13687/`, including `.xcresult` bundles and logs:

- `native-tests.xcresult`
- `device-ui.xcresult`
- `device-ui-failures-rerun.xcresult`
- `physical-sensors-ui-corrected.xcresult`
- `summary.txt` (device-to-emulator E2E)

The results above cover the original physical-device run; simulator and production-service verification are separate. No source code was changed for that original device run.

## Simulator follow-up after UI fixes — 6 November 2026

The iPhone 17 Pro simulator (iOS 27.0) passed all four targeted UI regression tests after the map and composer fixes:

| Test | Result |
|---|---|
| `testAuthenticatedShellHasFiveTabs` | Passed |
| `testCameraFreeComposerAndNotificationSettingsInAllTwelveLanguages` | Passed |
| `testCameraFreeNoteUsesServerUnicodeLengthLimit` | Passed |
| `testMapTabLoadsNearbyPosts` | Passed |

Total: **4 passed, 0 failed, 0 skipped**. The all-languages test covered 12 languages. XCTest reported one runtime warning, `Invalid frame dimension (negative or non-finite).`, during the Unicode composer test; the test still passed and the warning should be investigated separately.

These are simulator results, not a physical-device retest. The earlier physical failures and emulator network-permission block remain unverified on hardware; repeat those checks when the iPhone is available and Local Network access is enabled.
