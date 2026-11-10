# iOS Simulator QA Report — 2026-11-05

## Result

**Passed.** The simulator-safe iOS CI workflow completed successfully on an iPhone 17 Pro simulator running iOS 27.0.

| Suite | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---|
| Native iOS tests | 282 | 0 | 2 | Passed |
| Simulator UI tests | 53 | 0 | 0 | Passed |

The UI suite ran for 24m 56s. The complete CI script also passed its localization string-catalog check: 694 extracted keys across 89 files.

## Coverage exercised

- Onboarding, sign-in/sign-up, password recovery, guest access gate, and primary tab navigation.
- Map filters, recentering, location-note composition, surface selection, text-length validation, and camera/location permission recovery.
- AR discovery, sample post viewing, editor preview, and close/reopen flows.
- Discover, profile, profile editing, profile lists, collections, settings, notifications, and translation controls.
- Post safety actions, support/payment state handling with test fixtures, accessibility checks, English and Arabic RTL UI, and composer/settings localization across 12 languages.

The suite exercised the automated screen tours and user flows; it did not blindly activate every control in every possible state. Destructive or external actions were not sent to production services.

## Skips and warnings

The two skipped native tests require real device sensor streams:

- `ArrivalRuntimeTests/testPhysicalCameraFramesResumeAcrossNewPinSessions` — physical iPhone camera frames.
- `ArrivalRuntimeTests/testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements` — physical Core Location measurements.

Non-fatal runtime warnings appeared despite all tests passing:

- `Invalid frame dimension (negative or non-finite)` during the camera-free location-note length test and location-note/surface screen tour.
- A QoS priority-inversion warning during the sample AR-post viewing flow.
- Firebase Installations/FCM could not read a simulator Keychain item (`SecItemCopyMatching -34018`); live push delivery was not validated.

These warnings did not fail assertions, but the frame and QoS warnings should be investigated separately. Real camera tracking, GPS, APNs delivery, production Firebase flows, and physical-device accessibility were outside this simulator run.

## Reproduction

```bash
LOCIAR_IOS_CI_OUTPUT=build/ci-ios/user-qa-2026-11-05 bash scripts/ci-ios.sh
```

Result bundles:

- `../../build/ci-ios/user-qa-2026-11-05/native-tests.xcresult`
- `../../build/ci-ios/user-qa-2026-11-05/simulator-ui.xcresult`
