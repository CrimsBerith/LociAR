# On-device note translation — 20 October 2026

Owner selected free Apple on-device translation. Implementation remains local and uncommitted on
`codex/fix-anonymous-location-audit`; no deployment, TestFlight upload or translation billing change.

## Behaviour

- iOS 18+ readable post cards and on-site map-group rows translate into the app language when the pair's
  models are already installed. Automatic translation defaults on and can be disabled in Profile → Settings.
- Post detail offers Translate when supported models need downloading. Only that user action allows Apple's
  download/permission UI; scrolling never starts a model download. Successful detail translations offer an
  Original / Translation toggle. Content continues to use literal text, independently of UI string localization.
  Detail text has no line limit, so expanded translations remain fully readable; preview cards keep their limit.
- iOS 26.4+ explicitly uses the on-device low-latency strategy. Earlier supported versions use the framework's
  original strategy. There is no cloud provider, API key, per-character translation charge or paid fallback.
- Unsupported pairs, ambiguous/failed availability checks and older iOS versions retain the original. Language
  support is checked on the device. The 12 UI languages do not imply 12 universally available translation pairs.
- Original Firestore text, moderation, likes and ordering are unchanged. Translation state lives in the view;
  there is no application translation cache on disk. Content/language changes, disappearance or backgrounding
  discard results. Generation and request checks reject stale completions. Locked text never enters the framework.
- Group rows are lazy so long paginated groups do not immediately start a translation session for every note.

## Evidence

Artifacts: `build/device-translation-20261020/` and `build/device-translation-final-e2e-20261020/`.

| Check | Result |
|---|---|
| iPhoneOS Debug build, signing disabled | Passed, including the physical-device-only availability path |
| iOS Simulator build-for-testing | Passed |
| Translation framework linkage | Both Translation and its SwiftUI overlay are weak-linked; iOS minimum stays 17.0 |
| Native tests | 200 passed, 2 named physical-camera/GPS tests skipped; includes 7 new translation regressions |
| Real Firebase SDK/UI against disposable demo emulators | 2 passed: session setup and map-group proximity/ranking/detail revocation |
| UI localization / original fallback | Passed: settings/composer flow in all 12 languages; English detail retains the original when Translation is unavailable |
| Localization generator / release check | 670 Localizable + 6 InfoPlist keys × 12 languages, no pending entries |
| iPhoneOS compiler-extracted localization | All 646 extracted keys present |
| Localization script regressions / secret scan / whitespace | 6 passed / passed / passed |
| Frozen backend parity | All 65 compiled JavaScript files match the current backend |

The 12-language UI run and English original-fallback result are in `translation-ui.xcresult` (2 test methods,
12 language iterations). Captures are in `ui/`; English and Arabic/RTL settings and the original-fallback detail
were inspected visually. This covers the relevant screens, not the entire application in every language.
That run used the preceding frozen `device-translation-focused-e2e-20261020/Products` build. The final
presentation adjustment removes the detail's line limit; settings and localization sources are unchanged.
The final build repeated the native and SDK proximity scenarios, with its original-fallback detail rechecked
separately in `final-detail-ui.xcresult`.
Machine summary: `build/device-translation-20261020/verification.json`. Final frozen app hashes match before
and after SDK acceptance. Demo emulators were stopped and the disposable simulator was shut down/deleted.

The new native regressions cover unreadable/oversized/empty input, app-language and script selection, exact
original recovery, empty results, same-language detection, and late completions after lock, navigation, note
replacement or language changes. This is state/policy evidence, not a synthetic translation engine result.

A real host-Mac LanguageAvailability probe with the same low-latency strategy reported supported English pairs
for `tr`, `zh-Hans`, `hi`, `es`, `fr`, `ar`, `pt`, `ru`, `de`, `ja` (and English → Turkish); `bn` was unsupported.
These models were not installed. This is current host availability evidence, not an iPhone language matrix or
successful machine translation. See `mac-language-availability.json`.

## Physical acceptance still required

Apple's Translation engine does not run in iOS simulators. No physical iPhone was available for this run.
The simulator deliberately retains the original and reports unavailability; it never fabricates translated text.
Verify on a connected iPhone: first Turkish → English model download/permission, resulting English note and
original toggle, subsequent automatic/offline translation, disabled preference, download rejection/retry,
unsupported Bengali, and leaving/backgrounding during translation. The unsigned iPhoneOS build proves
compilation, not installation or this acceptance.

References: [Apple integration guide](https://developer.apple.com/documentation/translation/translating-text-within-your-app),
[Translation API session](https://developer.apple.com/videos/play/wwdc2024/10117/),
[low-latency strategy](https://developer.apple.com/documentation/translation/translationsession/strategy/lowlatency).
