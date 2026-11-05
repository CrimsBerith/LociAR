# iPhone Liquid Glass Retest — 3 Nov 2026

## Device and build

- iPhone 14 Pro Max, iOS 27.0.1, connected over USB.
- Built and installed `com.khankartal.lociar` version 1.0.0 (build 1), then launched it on the phone. Xcode build succeeded; install and launch completed. The app was updated in place, preserving app data.
- Installed executable SHA-256: `77ad5146d90056d065a5e3112938935590c4993da07cf69d96c6bb0e1c8cae36`.

## Physical-device observations

- **Liquid Glass:** Native translucent glass is visible on the tab bar and floating map/AR controls. The content cards remain mostly opaque; glass treatment is applied to app chrome and floating controls rather than every surface.
- **Discover:** The signed-in feed populated after opening and retained results while navigating. A “Show more” pill visibly overlaps the lower feed card in the captured viewport; review its safe-area/list placement.
- **Invites:** The authenticated invite page loaded successfully. Cloud Run recorded HTTP 200 with App Check and Auth both valid. The UI listed three codes. Values are intentionally excluded from this report and its shared screenshots.
- **Location Note:** The composer opened from the map. It showed the map and pin-adjustment options, text field and anonymous-sharing switch enabled by default. No note was submitted.
- **AR navigation:** AR discovery, a nearby post viewer, and the new-pin screen opened and returned without a stuck transition. The Google AR sensor-data notice was visible.
- **Camera / AR tracking:** The camera preview remained black on the fresh install. Expanded diagnostics showed limited tracking, mapping not started, and zero detected features, planes, or meshes; the sampled luma was 16. The AR view filled its host. The owner had also reported that Apple’s Camera preview remained black after restarting the phone. This retest does not establish a LociAR-only camera defect or verify a camera repair.
- **Profile / Settings:** Both screens opened and returned normally.

## Evidence and limits

- Build log: `build/iphone-retest-20261103/build.log`.
- Install/launch evidence: `build/iphone-retest-20261103/install-r2.json`, `launch-r2.json`, and `installed-build-evidence.json`.
- Discover and invite request status evidence: `build/iphone-retest-20261103/discover-request-statuses.json` and `invite-request-statuses.json`.
- Device screenshots: `build/iphone-retest-20261103/01-map.png`, `04-discover-result.png`, and `07-ar-camera-diagnostic.png`. `03-invite-private.png` is excluded because it contains private invite codes.
- This is a manual physical-device retest of the listed flows. It does not validate camera hardware, other devices, all app paths, or production behavior beyond the observed requests.
