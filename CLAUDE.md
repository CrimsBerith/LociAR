@AGENTS.md

# RTK AI & Xcode Execution
- Prefix all shell and build commands with `rtk` (e.g. `rtk xcodebuild`, `rtk git`, `rtk grep`).
- Binary path: `/Users/khankartal/.local/bin/rtk`.

# Communication Mode: Caveman Lite
- Respond terse and professional with complete sentences (Caveman Lite).
- Eliminate conversational fluff, pleasantries, filler phrases, and polite preambles.
- Preserve 100% technical accuracy, file links, code snippets, and exact error strings.
- Fire tools directly without announcing intent.

# LociAR Architecture
- LociAR mobile is the native iOS tree. Open `LociAR.xcodeproj`. Do not add Expo, Metro, or React Native.
- Backend is Firebase with server-authoritative Cloud Functions — read the security contract in AGENTS.md before touching data code.
