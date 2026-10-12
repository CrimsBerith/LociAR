# App Review notes: location, background modes and notifications

Owner: release manager. Update this file whenever permissions, background modes or notification categories change.

## 1. Paste into App Store Connect → App Review Information → Notes

> Keep under 4,000 characters. Replace `<…>` placeholders before submitting.

```
LociAR lets people leave short anonymous text notes (and AR notes) at the exact place they stand, so the next visitor gets useful local tips: "Wi-Fi password is at the till", "Entrance is around the back", "Ask for the window table".

LOCATION – TWO SEPARATE LEVELS, BOTH OPTIONAL
1) While Using the App (asked when the user first opens the map or leaves a note). Used to show notes around the user, to save a new note at the user's exact position, and to open AR content in the right spot. The app is fully usable with this level.
2) Always (asked only after the user turns on Profile → Settings → Notifications, never at launch). Used for one feature: telling the user about a well-liked note when they arrive at the note's place while the app is closed, e.g. walking into a café brings the "Wi-Fi password is at the till" note. We do this with region monitoring around note areas (and campaign areas, only if the user separately opted in), significant-change updates to keep those regions current, and iOS visit monitoring. Precise GPS runs only for a short window (max 30 minutes, usually under a minute) after the user enters an area, with the blue location indicator visible. We do not store location history. If the user declines Always, nothing breaks: notes still appear in the app; only the closed-app reminders are off.

BACKGROUND MODES
- location: the short precise window above, started only by a region-entry event, to confirm the user is really at the note (phone GPS is 5–30 m off). It stops after the notification, when the user leaves the area, or after 30 minutes.
- remote-notification: silent pushes tell phones in an area to refresh their monitored note areas when a new note or campaign goes live there. No user-visible content.
- fetch: BGAppRefreshTask refreshes the same list a few times a day as a fallback.

NOTIFICATIONS AND MARKETING (Guideline 4.5.4)
- "Notifications" covers likes, comments, follows, location notes and administrator messages.
- Brand campaigns and offers are a separate, off-by-default switch ("Campaigns and offers") with its own consent text. It can be turned off at any time in Profile → Settings. Brands never receive users' locations or identities.
- For campaigns that fire when someone leaves the place where they usually stay, the phone learns that place from iOS visit records on the device only. It is never uploaded and never labelled "home".

USER-GENERATED CONTENT (Guideline 1.2)
Automatic text filter (no links, no blocked terms), report and block on every note and profile, notes reported by several different people are hidden automatically, a 24/7 moderation panel can remove any note, and authors are anonymous to other users. Terms: <https://…/terms>. Support: <https://…/support>.

HOW TO REVIEW
Demo account: <email> / <password> (Settings → Notifications already on).
1. Map tab → "Leave a location note": the position settles within a few seconds; write text and tap "Post here".
2. Map tab: zoom out to see the heat map, zoom in for counts and notes, tap a group to see notes ordered by likes.
3. Profile → Settings: "Notifications" and the separate "Campaigns and offers" switch, each with its explanation.
Arriving at a note with the app closed cannot be reproduced remotely, so we attached a screen recording: <link to video>. It shows the permission prompts, enabling Notifications, upgrading to Always from Settings, walking into a café with the app closed, the notification, and the blue background-location indicator.
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
2. Leave a location note in a café; show "Location ready ±6 m" and the published note.
3. Profile → Settings → turn on Notifications → system prompt → choose "Change to Always Allow" when iOS offers it (or show iOS Settings → LociAR → Location → Always).
4. Show the separate "Campaigns and offers" switch and its text; leave it on for the demo.
5. Close the app (swipe to home, do not force-quit). Walk out and back into the café with a second account's liked note: show the lock-screen notification and the blue background-location indicator.
6. Turn Notifications off in Settings and show that reminders stop.

## 7. Pre-submission checklist

- [ ] Release build uses `LociAR.Release.entitlements` (`aps-environment = production`).
- [ ] App Review notes, demo account and video link filled in.
- [ ] App Privacy answers match section 5.
- [ ] Privacy policy (`/privacy`, `/privacy/en`) live and matches the app.
- [ ] Physical-iPhone check: background arrival, silent push refresh, BG refresh, Always downgrade to When In Use.
