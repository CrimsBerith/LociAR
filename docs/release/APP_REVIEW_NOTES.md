# App Review notes: location, background modes and notifications

Owner: release manager. Update this file whenever permissions, background modes or notification categories change.

## 1. Paste into App Store Connect → App Review Information → Notes

This is the **only** notes text for the submission (it replaces the older text in `APP_STORE_SUBMISSION_GUIDE.md` §6; both together exceed Apple's 4,000-character limit). About 3,600 characters with the video link.

Before pasting: replace `<VIDEO_LINK>` with the screen recording from section 6 (an unlisted link, or attach the file under App Review Information → Attachment and write "see attachment"). The demo account (`apple-review@lociar.app`) and its password go only into the **Sign-In Information** fields, never into these notes. Run `node functions/scripts/seed-review-content.mjs apple-review@lociar.app` once against production so the sample posts and location notes exist.

```
LociAR lets people leave short notes, in AR on real surfaces or at the exact spot where they stand, so the next visitor gets useful local tips ("Wi-Fi password is at the counter"). Notes are text and/or one GIPHY GIF (PG-13 at most): no photos, videos or links. LociAR has no chat or private messaging.

ACCOUNTABILITY
Other users do not see a note's author name, but every note and comment belongs to a Sign in with Apple or verified-email account that moderators see and can suspend. Without an account people can only browse, like, report and block.

HOW TO REVIEW
Sign in with the demo account in the sign-in fields (or Sign in with Apple) and tick the terms checkbox. Sample AR posts and location notes are at Apple Park Visitor Center, Cupertino (37.3327, -122.0053) and in Istanbul.
1. Map: zoom out for the heat map, zoom in for counts; tap a group to see its notes ordered by likes.
2. Map > "Leave a location note": the position settles within seconds (outdoors, "Refine with camera" gives 1-5 m); write text and tap "Post here".
3. Share tab (physical ARKit iPhone): acknowledge the Google AR notice, aim at a surface, tap "Anchor to surface", add text, then "Publish on the surface".
4. Profile > Settings: "Notifications" and the separate "Campaigns and offers" switch, each with its explanation.
Arriving at a note with the app closed cannot be reproduced remotely; see the video: <VIDEO_LINK>

LOCATION: TWO SEPARATE LEVELS, BOTH OPTIONAL
While Using (asked on the map or note composer): shows notes around the user, saves a note at their position, opens AR content in place. The whole app works at this level.
Always (asked only after the user turns on Settings > Notifications, never at launch): tells the user about a liked note when they arrive at its place while the app is closed, e.g. entering a café brings its "Wi-Fi password" note. Region monitoring around note areas (and campaign areas only after a separate opt-in), significant-change updates and visit monitoring keep those areas current at low power. Precise GPS runs only in a short window after an area entry (usually under a minute, at most 30 minutes) with the blue indicator, and stops on notification or exit. No location history is stored. Declining Always only turns off the closed-app reminders.

BACKGROUND MODES
location: only the short window above, started by a region entry, to confirm the user is really at the note (phone GPS is 5-30 m off).
remote-notification: silent pushes that refresh the monitored areas when a note or campaign goes live nearby; no visible content.
fetch: BGAppRefreshTask doing the same refresh a few times a day as a fallback.

MARKETING (4.5.4)
Brand offers have their own off-by-default "Campaigns and offers" switch and consent text, separate from Notifications, and can be turned off at any time. Brands never receive users' locations or identities. For offers that fire when someone leaves the place where they usually stay, that place is learned from iOS visits on the device only; it is never uploaded or labelled home.

SAFETY (1.2)
Every post passes an automatic text filter (no links, blocked terms) before it goes live. Content is hidden automatically when several verified users report it, and moderators review every report. Report and block on every post, comment and profile, handled within 24 hours. Protected zones and 18+ content are blocked on the server. Account deletion: Profile > Permanently delete account.

Support: support@lociar.app, https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support
```

## 2. Why "Always" is justified (for any follow-up from App Review)

| Apple expectation | How LociAR meets it |
|---|---|
| Location must be directly relevant to the app (5.1.5) | Notes are tied to places; the arrival reminder is the core of a location-note app. |
| Explain the purpose in the prompt (5.1.1) | Purpose strings name the feature and give an example (see section 4). |
| Ask in context, not at launch | When In Use is requested from the map/composer; Always only after the user enables Notifications in Settings (`CampaignArrivalService.requestPermissions`). |
| App works without the higher level | All browsing, posting, AR and in-app notes work with When In Use; only closed-app reminders need Always. |
| Background location only for its intended purpose (2.5.4) | Region/visit/significant-change APIs do the waiting at low power; continuous GPS only in a short window after a region entry, `showsBackgroundLocationIndicator = true`, stops on notify/exit/30 min. |
| Respect user control | One switch turns reminders off; marketing is a second, separate switch; iOS Settings can downgrade at any time and the app adapts. |
| Marketing push needs explicit opt-in (4.5.4) | Separate off-by-default "Campaigns and offers" switch with its own consent text and in-app opt-out. |
| Data minimisation (5.1.1, 5.1.2) | No location history; entry fixes are used once to verify and discarded; the usual place never leaves the device; brands see no personal data. |

## 3. Background modes in `Info.plist`

| Mode | Used by | Trigger | Stops |
|---|---|---|---|
| `location` | `CampaignArrivalService.startPreciseWindow` | Region entry/inside state for a note, dense spot or campaign step | Notification sent, area exited, or 10–30 min |
| `remote-notification` | `LociAppDelegate.application(_:didReceiveRemoteNotification:)` | Silent `region_refresh` push on a geohash-4 area topic | After one region refresh |
| `fetch` | `BGAppRefreshTask` `com.khankartal.lociar.regions` | iOS schedules ~every 3 h or later | After one region refresh |

Region monitoring, visit monitoring and significant-change updates do not require a background mode; they need the Always authorization.

## 4. Permission prompts (source: `Info.plist`, translations: `scripts/l10n/infoplist.json`, 12 languages)

- **When In Use** – "LociAR uses your location to show notes and AR content where you are, to place your note exactly where you stand, and to open content in the right spot through the camera. For example, you see a “Wi-Fi password is at the till” note while you are in that café. For AR placement, location is processed with Google ARCore."
- **Always** – "With “Always”, LociAR tells you about a liked note when you arrive at its place, even when the app is closed; for example, entering the café brings the “Wi-Fi password is at the till” note as a notification. If you also turned on campaigns, you may get an offer when you enter a campaign area. Only note and campaign areas are monitored, precise location is used briefly near an area, and your location history is not stored. You can turn notifications off in Settings at any time."
- **Temporary precise location** – "LociAR needs your precise location this time to place your note exactly where you stand and show AR content in the right spot."

## 5. App Store Connect → App Privacy (must match `PrivacyInfo.xcprivacy`)

| Data type | Linked | Tracking | Purposes |
|---|---|---|---|
| Precise Location | Yes | No | App Functionality, Developer's Advertising or Marketing (campaign step verification) |
| Coarse Location | Yes | No | App Functionality, Analytics, Developer's Advertising or Marketing |
| User ID, Email, Name | Yes | No | App Functionality |
| Photos (profile photo) | Yes | No | App Functionality |
| Other User Content (notes, comments) | Yes | No | App Functionality |
| Product Interaction | Yes | No | App Functionality, Analytics |
| Device ID | Yes | No | App Functionality |
| Crash Data, Other Diagnostic Data | No | No | App Functionality |

## 6. Screen recording for reviewers (2–3 minutes)

1. Fresh install → sign in with the demo account → open the Map: When In Use prompt appears in context.
2. Leave a location note in a café; show "Location ready ±6 m" (or "Refine with camera" outdoors) and the published note.
3. Profile → Settings → turn on Notifications → system prompt → choose "Change to Always Allow" when iOS offers it (or show iOS Settings → LociAR → Location → Always).
4. Show the separate "Campaigns and offers" switch and its text; leave it on for the demo.
5. Close the app (swipe to home, do not force-quit). Walk out and back into the café with a second account's liked note: show the lock-screen notification and the blue background-location indicator.
6. Turn Notifications off in Settings and show that reminders stop.

## 7. Pre-submission checklist

- [ ] Release build uses `LociAR.Release.entitlements` (`aps-environment = production`).
- [ ] Seed script run against production; the Apple Park sample notes appear on the map.
- [ ] Video link replaced in the notes; demo account password entered in Sign-In Information only.
- [ ] App Privacy answers match section 5.
- [ ] Privacy policy (`/privacy`, `/privacy/en`) live and matches the app.
- [ ] Physical-iPhone check: background arrival, silent push refresh, BG refresh, Always downgrade to When In Use.
