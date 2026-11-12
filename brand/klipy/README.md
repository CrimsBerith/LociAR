# KLIPY brand attribution assets

Source: KLIPY's official "KLIPY Brand Attributions" Google Drive folder (owner support@klipy.com), downloaded 12 Nov 2026.
Guideline: "Klipy Attribution Guideline" (same folder). Meeting it is a condition for KLIPY's production key approval.

| Rule | Status in app |
|---|---|
| Search bar placeholder "Search KLIPY", KLIPY fully capitalised (required) | `GifPickerView` `.searchable(prompt:)` |
| "Powered by KLIPY" logo near the search bar, visible while the picker is open (optional) | `KlipyPoweredByMark` in `GifPickerView` and the create-post GIF card |
| Semi-transparent white KLIPY watermark, bottom-left of a sent GIF card (optional, strongly recommended) | `KlipyWatermark` on `PostCard` and the create-post preview |

App assets (vector PDF converted from these SVGs, `preserves-vector-representation`):
- `Assets.xcassets/KlipyPoweredBy` ← `picker/powered-by-klipy-horizontal-yellow-black.svg` (light) and `-yellow-white.svg` (dark)
- `Assets.xcassets/KlipyWatermark` ← `watermark/klipy-text-light.svg`

`previews/` holds PNG renders on gray for review only.
