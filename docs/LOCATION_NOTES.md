# Location notes

A location note is a short anonymous text written at the author's own position. It publishes at once after the automatic text filter (protected zones and rate limits still apply; up to 200 may share a 25 m area). Users can also pin posts to AR surfaces; both kinds appear on the map.

## Writing a note (iOS)

**Map → Leave a location note** opens a map centred on the user's measured position. There is no business or POI search. Fresh map fixes (at most 3 s old) seed the estimate.

GPS measurement starts when the composer opens, so the fix usually settles while the author types (`LocationFixEstimator`, `LocationNotePolicy.swift`):

- Fixes from before the screen opened, older than 3 s, simulated by software, or with invalid accuracy are discarded.
- The position is the inverse-variance weighted mean (`1/accuracy²`) of fixes at most 3 s old and close in accuracy to the best one. Stale samples are pruned during the publish wait and before manual publication; repeated timestamps do not count as new fixes. The reported uncertainty is the larger of the best single accuracy and the largest sample distance from the mean, so conflicting fixes do not claim a precise midpoint. A camera fix also expires after 3 s and falls back to a new GPS measurement.
- **Ready**: best accuracy ≤ 10 m, the last three fixes within 5 m of the estimate, at least 2 s after opening. Outdoors this is typically 3–8 s. Time-to-ready is logged (OSLog category `location-note`) for field calibration.
- **Post here**: published at once when ready; otherwise the app waits at most 10 s. GPS rarely improves after ~10 s, and indoors it does not converge.

| Best accuracy after waiting | Result | `source` | Default radius |
|---|---|---|---|
| ≤ 10 m | Published | `gps` | 20 m |
| 10–15 m | Published | `gps` | 25 m |
| 15–50 m | The author places the pin by hand (map centre), within 50 m of the measurement | `manual` | 30 m |
| > 50 m | Refused: move outside or retry | — | — |

**Refine with camera** (physical iPhones with ARCore): opens the shared AR camera with the Google AR notice; ARCore Geospatial (VPS) localizes against Street View imagery, typically 1–5 m outdoors. A camera fix ≤ 5 m is used automatically, ≤ 15 m on tap, and the note is sent with `source: 'geospatial'` (≤ 5 m gets a 15 m radius, otherwise as GPS). Indoors VPS usually does not localize; GPS and the manual pin remain.

Approximate-location permission triggers a temporary full-accuracy request. `createPlaceNote` re-checks the source, accuracy and pin distance, then applies the normal post admission (anonymous author, text filter, protected zones, rate/density limits) and publishes the note at once. The post stores `note_kind: 'location'`, `location_note {source, accuracy_m, pin_drag_m}`, `notify_radius_m` and `push_state: 'none'`.

## Ranking

Likes decide usefulness. Everywhere notes are listed at a place (map panel, tapped 25 m group, notification choice) they are ordered by likes, newest first on ties. Notes never expire on their own.

## Notifications

A note notifies once `push_state` is `approved`. For user location notes this happens automatically (`autoApproveNote`) when at least `push_like_threshold` (default 3) accounts older than a day like it. Open reports from `report_hide_threshold` (default 3) distinct users hide the note and revoke notifications (`onReportCreated`). Administrators can approve any post (including AR posts), stop notifications or remove a note at any time.

Each person receives each note at most once (`place_note_notification_receipts/post_{luid}_{postId}`, no expiry). There are no daily quotas.

### Entry detection

1. `readPlaceNoteRegions` returns up to 15 wake regions: approved notes within 3 km that this user has not received, grouped within 25 m around the most-liked note. Completed clusters do not use one of iOS's 20 monitored regions; a reserved alert pending local queueing remains recoverable. A coarse fix (≤ 1 km, ≤ 5 min old) is enough, so the list also refreshes in the background.
2. Significant-location-change monitoring (~500 m) wakes the app to refresh regions while it is in the background.
3. iOS wakes the app when it enters a cluster's 300–400 m circle, ahead of the note so GPS can settle (entry and exit are both monitored; the state is requested on registration, so a user already inside is detected). This wake circle does not expand the note's 15–100 m notification radius.
4. A precise window runs until a notification is sent, the user leaves the wake circle, or 10 minutes pass. Far from every note it uses 10 m accuracy and a 10 m filter; within 40 m of a note circle it switches to best accuracy. In the background it keeps a `CLBackgroundActivitySession`.
5. **Entry rule** (client and server): `distance ≤ radius + min(accuracy, 20 m)` and `accuracy ≤ 35 m`. The visitor's uncertainty circle may touch the note circle. Fixes that are older than 10 s, simulated, or moving faster than 2.5 m/s are ignored.
6. The native client requires 10 s of agreeing fixes inside the note circle. Leaving it, receiving an invalid fix or a gap longer than 5 s restarts confirmation. Repeated/older fixes never advance the timer. Only timing is retained on the device; no location history is uploaded.
7. `recordPlaceNoteVisit` re-checks the fix, the confirmation window (10 s–10 min), consent, kill switch, approval, moderation, blocks, reports and the author's account, then picks the most-liked unseen approved note the visitor is inside. It writes the receipt and an anonymous activity in one transaction. Network failures retry after 2, 5 and 10 s while the user is still inside; a stale or unconfirmed server fix requests a fresh measurement and allows another attempt after 2 s.
8. The local notification title counts new notes at the spot; the body leads with the most-liked note and its likes. Notifications for one cluster share a thread.

### Interrupted delivery recovery

The current iOS client persists a random `deliveryId` **before** calling `recordPlaceNoteVisit`. Its account-scoped, 24-hour journal contains only random IDs and successful local queue IDs, never note text or GPS fixes. A retry uses the same ID, so a lost response returns the same note rather than consuming the next one. Server replay rebuilds the response from current content and rechecks consent, moderation, author access, blocks, reports, freshness and distance; a locked dense spot remains text-free.

Once `UNUserNotificationCenter.add` succeeds, the client persists that queue result and schedules `action: 'acknowledge'` with the same ID. The acknowledgement pump runs independently of region refresh: at most three requests per batch, a 5 s callable timeout and a 60 s cooldown after a failure. New ACKs can proceed while older failures cool down. Account changes or revoked consent cancel the pump; late completions cannot edit a new session. Existing pending/delivered notification identifiers suppress requeueing after an interrupted local write. GPS stops only after queueing succeeds. **Queued does not mean displayed or read**: iOS notification settings, Focus and execution constraints still apply. Legacy clients without a delivery ID keep their original one-attempt behavior. Different IDs never consume a reserved note twice, including races between devices.

Both client and server stop retrying after 24 hours. New server receipts store `retry_until`; existing pending receipts derive their deadline from `created_at`, so no data migration is required. An explicit deadline cannot extend the one-day bound. Expired pending notes no longer occupy wake regions, and native recovery removes their cached/monitored regions before requesting replacements. The permanent post receipt is kept and has **no TTL**: expiry never allows the same note to be claimed again. A late acknowledgement of an already queued notification is still accepted.

The server reads post receipts in one batch before author/report checks. Profile and deletion checks are shared by distinct author within the current transaction; only active authors need block reads. Both directions of ordinary and anonymous blocks are checked. Report queries remain separately bounded per note and run concurrently, so duplicate reports cannot conceal another note's report. Dense-spot receipts are batched too. No permission result is cached across requests or transaction retries.

`place_note_visit` server logs contain only outcome, reason and elapsed milliseconds; `nearby_query` logs contain strategy, candidate count and duration. No IDs, note text or coordinates are added to these operational records. Use these measurements for latency tuning before increasing minimum instance counts or changing GPS windows.

Phone GPS is usually 5–30 m off, and worse indoors. Use 15–25 m radii outdoors, 30–60 m indoors and up to 100 m for large venues. The rule cannot prove that someone entered a door. iOS may delay or suppress wake-ups, especially after force-quit.

**Shop example (13 October 2026):** someone leaves an anonymous product-quality note at their measured position in a shop. Another opted-in visitor stays inside that note's GPS circle for 10 s, then receives the most-liked approved unseen note. A 10–15 s delivery target starts at the first accepted fix in the circle, not at the physical doorway, and depends on fresh GPS, iOS execution time and the network. A passer-by can also be inside the circle. Door-level indoor presence requires a separately validated proximity signal; GPS geofencing alone cannot guarantee it. Apple documents that [region events can be delayed](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/RegionMonitoring/RegionMonitoring.html).

Background delivery requires Notifications, Always location, Precise Location, Background App Refresh and internet. Settings show missing permission/refresh requirements. On a location-triggered cold launch the app delegate restores Firebase and the account's acknowledged preferences before SwiftUI bootstrap. Cached regions request their state immediately; campaign consent and device-only usual-place learning are restored separately from location-note consent. Pending preference changes fail closed. Significant changes refresh both notes and campaigns, even if only campaigns are enabled. Turning off a category removes its monitored regions immediately.

Physical-device acceptance must separately cover Home/locked screen, an iOS-terminated process, user force-quit, reboot, permission downgrade, disabled Background App Refresh, approximate location and offline arrival. Simulator tests do not prove wake timing or APNs delivery.

## Dense spots

A spot is a server-side cluster (`note_spots`): a public note joins the nearest spot whose centre is within 25 m; five unclustered notes within 25 m start a new spot. The centre is the running mean of its notes and the circle grows to cover them, at most 40 m (`syncSpotMembership`, also run by the hourly reconciler). When a spot holds at least `dense_threshold` notes (default 30, 5–1000), it is a dense spot:

- **Locked text.** `readPublicContent` returns only the place, likes and `dense_spot {cell, count, unlock_radius_m}` for other people's notes there; caption, text and GIF are withheld. Authors always read their own notes.
- **Open on site.** The map banner's **Open here** sends the best fresh fix to `unlockDenseSpot`: the AR camera's Geospatial position when it is localized and better (1–5 m outdoors), otherwise GPS. **Open with camera** starts the AR camera from the banner for this. The spot opens for 30 minutes when the distance to its circle is at most `unlock_radius_m + min(accuracy, 5 m)` (default 15 m, admin range 2–50 m). A 2–5 m setting is reliable only with the AR camera outdoors; phone GPS alone needs about 15 m.
- **"Many notes here" alert.** Dense spots also appear in the wake-region list. Entering within 10 m of the spot circle (+ GPS tolerance) sends one text-free alert per 30 days (`dense_spot_receipts`); tapping it opens the map at the spot. An approved note inside a locked spot is also announced without its text, and its activity entry stays closed.

## Map

| Visible width | Layer | Data |
|---|---|---|
| > 50 km | Heat | `note_density` precision 4 |
| 5–50 km | Heat | precision 5 |
| 1–5 km | Heat | precision 6 |
| 300 m–1 km | Count bubbles | precision 7 (~150 m) |
| < 300 m | Notes, grouped within 25 m | `readPublicContent` nearby |

`onPostDensityWritten` keeps one server-only counter per geohash cell for every public active post. A per-post member record (`note_density_members`) makes replays and out-of-order events converge; `reconcileNoteDensity` re-checks 500 posts per hour and seeds counters for older posts. `readNoteDensity` reads only non-empty cells with at most 12 prefix range queries.

## Administration

**Location notes** (`/admin/place-notes`) lists candidates and approved notes by likes. Moderators approve or stop notifications, remove notes (soft delete), set the like threshold, dense-spot size and unlock radius, and an optional end date (`ends_at`; `expireScheduledNotes` removes the note every 15 minutes once due). Place operators (`places.write`) set the 15–100 m radius. **Posts → Create** can place a location note at any coordinate (click the OpenStreetMap picker or type coordinates) and approve it in the same audited step. Every change requires MFA, a reason and an audit receipt.

## Release

Deploy Functions (`createPlaceNote`, `readPlaceNoteRegions`, `recordPlaceNoteVisit`, `readNoteDensity`, `unlockDenseSpot`, `onPostDensityWritten`, `reconcileNoteDensity`, `expireScheduledNotes`), the new indexes (`push_state + geohash`, `status + likes_count`, `note_density precision + cell`), App Hosting and the iOS build. Field checks on physical iPhones: time-to-ready outdoors and indoors, background wake from 300 m, entry at 15/25/50 m radii, continuous 10 s confirmation, gaps/outside restarting confirmation, drive-by suppression, exit ending the window, battery over a 10-minute window, approximate-location prompt, and opt-out.
