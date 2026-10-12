# Location notes

A location note is a short anonymous text written at the author's own position. Users can also pin posts to AR surfaces; both kinds appear on the map and can notify nearby visitors once an administrator approves them.

## Writing a note (iOS)

**Map → Leave a location note** opens a map centred on the user's measured position. There is no business or POI search.

GPS measurement starts when the composer opens, so the fix usually settles while the author types (`LocationFixEstimator`, `LocationNotePolicy.swift`):

- Fixes from before the screen opened, older than 3 s, simulated by software, or with invalid accuracy are discarded.
- The position is the inverse-variance weighted mean (`1/accuracy²`) of the last 10 s of fixes close to the best one. The reported accuracy is the best single fix; averaging does not claim extra precision.
- **Ready**: best accuracy ≤ 10 m, the last three fixes within 5 m of the estimate, at least 2 s after opening. Outdoors this is typically 3–8 s. Time-to-ready is logged (OSLog category `location-note`) for field calibration.
- **Post here**: published at once when ready; otherwise the app waits at most 10 s. GPS rarely improves after ~10 s, and indoors it does not converge.

| Best accuracy after waiting | Result | `source` | Default radius |
|---|---|---|---|
| ≤ 10 m | Published | `gps` | 20 m |
| 10–15 m | Published | `gps` | 25 m |
| 15–50 m | The author places the pin by hand (map centre), within 50 m of the measurement | `manual` | 30 m |
| > 50 m | Refused: move outside or retry | — | — |

Approximate-location permission triggers a temporary full-accuracy request. `createPlaceNote` re-checks the source, accuracy and pin distance, then applies the normal post admission (anonymous author, review, protected zones, rate/density limits). The post stores `note_kind: 'location'`, `location_note {source, accuracy_m, pin_drag_m}`, `notify_radius_m` and `push_state: 'none'`. The server also accepts `geospatial` (≤ 5 m → 15 m radius) for a future AR-screen entry point.

## Ranking

Likes decide usefulness. Everywhere notes are listed at a place (map panel, tapped 25 m group, notification choice) they are ordered by likes, newest first on ties. Notes never expire on their own.

## Notifications

A note can notify only after an administrator approves it (`push_state: 'approved'`). Notes with at least the configured number of likes (default 3, `system/place_notes.push_like_threshold`) appear in the admin candidate queue. AR posts can be approved the same way.

Each person receives each note at most once (`place_note_notification_receipts/post_{luid}_{postId}`, no expiry). There are no daily quotas.

### Entry detection

1. `readPlaceNoteRegions` returns up to 15 wake regions: approved notes within 3 km that this user has not received, grouped within 25 m around the most-liked note. Seen clusters do not use one of iOS's 20 monitored regions. A coarse fix (≤ 1 km, ≤ 4 min old) is enough, so the list also refreshes in the background.
2. Significant-location-change monitoring (~500 m) wakes the app to refresh regions while it is in the background.
3. iOS wakes the app when it enters a cluster's 150–400 m circle (entry and exit are both monitored; the state is requested on registration, so a user already inside is detected).
4. A precise window runs until a notification is sent, the user leaves the wake circle, or 10 minutes pass. Far from every note it uses 10 m accuracy and a 10 m filter; within 40 m of a note circle it switches to best accuracy. In the background it keeps a `CLBackgroundActivitySession`.
5. **Entry rule** (client and server): `distance ≤ radius + min(accuracy, 20 m)` and `accuracy ≤ 35 m`. The visitor's uncertainty circle may touch the note circle. Fixes that are older than 10 s, simulated, or moving faster than 2.5 m/s are ignored.
6. Two agreeing fixes at least 5 s apart (the first at most 2 min old) confirm the entry.
7. `recordPlaceNoteVisit` re-checks the fix, the confirmation window (5 s–10 min), consent, kill switch, approval, moderation, blocks, reports and the author's account, then picks the most-liked unseen approved note the visitor is inside. It writes the receipt and an anonymous activity in one transaction. Network failures retry after 2, 5 and 10 s while the user is still inside.
8. The local notification title counts new notes at the spot; the body leads with the most-liked note and its likes. Notifications for one cluster share a thread.

Phone GPS is usually 5–30 m off, and worse indoors. Use 15–25 m radii outdoors, 30–60 m indoors and up to 100 m for large venues. The rule cannot prove that someone entered a door. iOS may delay or suppress wake-ups, especially after force-quit.

## Dense spots

A spot is a geohash precision-8 cell (~38 × 19 m). When it holds at least `dense_threshold` public notes (default 30, `system/place_notes`), it is a dense spot:

- **Locked text.** `readPublicContent` returns only the place, likes and `dense_spot {cell, count, unlock_radius_m}` for other people's notes there; caption, text and GIF are withheld. Authors always read their own notes.
- **Open on site.** The map banner's **Open here** sends the best fresh fix to `unlockDenseSpot`: the AR camera's Geospatial position when it is localized and better (1–5 m outdoors), otherwise GPS. The spot opens for 30 minutes when `distance to the cell ≤ unlock_radius_m + min(accuracy, 5 m)` (default 15 m, admin range 2–50 m). A 2–5 m setting is reliable only with the AR camera outdoors; phone GPS alone needs about 15 m.
- **"Many notes here" alert.** Dense spots also appear in the wake-region list. Entering 25 m (+ GPS tolerance) of an unalerted spot sends one text-free alert per 30 days (`dense_spot_receipts`), when no approved note is due there.

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

**Location notes** (`/admin/place-notes`) lists candidates and approved notes by likes. Moderators approve or stop notifications, remove notes (soft delete), set the like threshold, dense-spot size and unlock radius, and an optional end date (`ends_at`; `expireScheduledNotes` removes the note every 15 minutes once due). Place operators (`places.write`) set the 15–100 m radius. **Posts → Create** can place a location note at any coordinate and approve it in the same audited step. Every change requires MFA, a reason and an audit receipt.

## Release

Deploy Functions (`createPlaceNote`, `readPlaceNoteRegions`, `recordPlaceNoteVisit`, `readNoteDensity`, `unlockDenseSpot`, `onPostDensityWritten`, `reconcileNoteDensity`, `expireScheduledNotes`), the new indexes (`push_state + geohash`, `status + likes_count`, `note_density precision + cell`), App Hosting and the iOS build. Field checks on physical iPhones: time-to-ready outdoors and indoors, background wake from 150 m, entry at 15/25/50 m radii, drive-by suppression, exit ending the window, battery over a 10-minute window, approximate-location prompt, and opt-out.
