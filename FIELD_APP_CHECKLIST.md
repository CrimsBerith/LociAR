# LociAR — App field / QA checklist

Use this before shipping or after UI changes. Goal: **no crashes**, **no button overlap**, **nothing under the status clock**.

## A. Safe area (status bar / clock)

| # | Check | Pass? |
|---|--------|-------|
| A1 | Camera tab: header icons fully below Dynamic Island / clock | |
| A2 | Map: header + search not under status bar | |
| A3 | Explore: brand header clear of status bar | |
| A4 | Activity: same | |
| A5 | Profile: same | |
| A6 | Create: title/step chips clear of status bar | |
| A7 | Place detail / Collections: back header clear | |
| A8 | Dev backend banner (if shown) does **not** cover header buttons | |

## B. No button / control overlap

| # | Check | Pass? |
|---|--------|-------|
| B1 | Tab bar items: 5 tabs, no double-tap targets stacked | |
| B2 | Camera: ModeToolDock + shutter not on top of each other | |
| B3 | Camera: social bar (like/comment/save) not over shutter | |
| B4 | Map: place row “Open in AR” / “Place” not stacked illegibly | |
| B5 | AR status pill not covering header menu/target | |
| B6 | Create: step chips + Pin button reachable without overlap | |

## C. Crash / stability

| # | Check | Pass? |
|---|--------|-------|
| C1 | Cold launch → tabs switch without crash | |
| C2 | Open Create → back to Camera | |
| C3 | Open AR unlock path with no GPS still shows UI (no white crash) | |
| C4 | Permission deny camera: soft banner, not freeze | |
| C5 | Profile scroll long content no freeze | |
| C6 | Rapid tab switch 10× no crash | |

## D. Core flows (happy path)

| # | Check | Pass? |
|---|--------|-------|
| D1 | Map shows pins / empty state | |
| D2 | Explore filters change list | |
| D3 | Activity loads list or empty | |
| D4 | Create pin (device) or soft fail with message | |
| D5 | Publish offline path shows “Saved offline” not crash | |
| D6 | Pin/Content/Place/Publish rail sits directly under “NEW AR Post” | |
| D7 | Create step rail and editor sheet remain separate; neither intersects the bottom tab area | |
| D8 | Pin finishes within ~12s (FOC/plane); spinner does not spin forever | |

## E. Simulator notes

- **Camera / ARKit** limited or black on Simulator — expected; not a crash.
- Prefer **iPhone 17 Pro** or **iPhone 15** sim for notch layout.
- Home indicator: tab bar must sit above it.

## Automated checks in repo

```bash
# Swift Unit Tests (Architecture, Security, Storage, Contracts)
xcodebuild -project LociAR.xcodeproj -scheme LociAR -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:LociARTests test

# UI & Accessibility Tests
xcodebuild -project LociAR.xcodeproj -scheme LociAR -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:LociARUITests test
```

Manual: Xcode üzerinden `LociAR` şemasını seçip iPhone Simülatörü veya fiziksel cihazda çalıştırın, ardından A–D adımlarını izleyin.
