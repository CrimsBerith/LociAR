# LociAR — Full App Liquid Glass Pass

Date: 3 Nov 2026

## Changes

- Applied the shared glass surface to content cards, post cards, status/notice pills, action tiles, fields, and floating AR/map controls. Native list and form rows use translucent material with a subtle glass edge.
- Updated the RealityKit AR message texture with a translucent deep teal fill, soft upper reflection, and a light edge while keeping the message text opaque and readable.
- Preserved the existing iOS 17 material fallback and the Reduce Transparency opaque fallback.

## Local verification

- iOS Simulator Debug build succeeded on iPhone 17 Pro / iOS 27.0.
- UI screen tours: primary tabs, location note composer/surface, and AR viewer passed (3 tests); the final isolated location-note screen tour passed after the list-row glass update (1 test).
- `GifPostTests.testGifBubbleReportsTheGifAreaForTheARVideo` passed and attached a rendered AR glass note texture preview.
- Screenshot gallery: `build/glass-all-app-20261103/index.html`.

## Evidence boundary

The simulator does not establish live camera tracking, physical surface readability, Cloud Anchor/VPS behavior, or performance on a device. The AR texture preview composites the exact rendered message texture on a two-color background to show its transparency; it is not a live camera frame. The simulator UI tests use inert preview data and did not submit a note.
