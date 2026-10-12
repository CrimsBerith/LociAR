# Community notes at businesses

On the iOS map, **Leave a business note** opens Apple Maps point-of-interest search. Select a business, confirm its approximate map position and enter up to 220 characters of text. `createPlaceNote` reuses the normal server-authoritative post checks: anonymous authorship, content review, protected zones, rate/density limits and account fences. Notes start pending review and use approximate map placement, without a fabricated AR world lock.

## Business lifecycle in the panel

A normalized name and coordinates rounded to four decimal places generate the initial business ID; notification coordinates retain full precision. This is not a verified merchant identity. The server-only `business_places` catalog records the current name, coordinates, status, notification diameter and revision. Notes retain `business_id`, `business_note.revision` and their private `creator_id`.

**Businesses & notes** displays businesses, the latest ten attached notes, actual author UUIDs and a link to all notes filtered by business. Administrators can edit name/entrance point, set active/paused/closed/moved, adjust the diameter, invalidate a note or submit it for review against the current business revision. Mutations require MFA, the appropriate `places.write`/`posts.moderate` role, reason and audit receipt. Diameter-only adjustments preserve existing notes; name, point or status changes advance the revision.

Closed, paused or moved businesses and revision-mismatched notes immediately fail public projections, note reminders and interaction rules. The retrying `onBusinessChanged` worker flags stale notes in batches; the revision fence applies before the worker finishes. Reopening never silently restores old notes. Explicit revalidation updates the note to the current business point/revision and sets pending review. Publication still requires moderation. Generic admin movement removes the business classification to avoid obsolete reminders.

## Single notification control and GPS

The app has one off-by-default **Notifications** switch, covering social notifications, business notes, brand discounts and administrator messages. Its combined notice is `2026-10-11-notifications`. Administrator location/technical sharing remain separate. Legacy callable preference fields remain only for compatibility; the master flag derives all notification categories. Disabling it stops local monitoring, token registration and server push admission.

`readBusinessNoteRegions` uses a recent foreground fix to find approved public notes within 3 km. Own, reported, blocked, suspended/deleting-author and over-30-day notes are excluded. Queries are bounded to 500 notes/60 identity checks; an over-dense area fails explicitly. Business and campaign regions share the iOS limit of 20 nearest monitored areas, synchronized while open.

The 150 m OS circle only wakes the app. Actual entry uses a configurable **diameter of 2–5 m**, default 5 m (2.5 m radius), centered on the panel's selected point. A short best-accuracy GPS window runs for at most 120 seconds per wake. Foreground GPS updates can also check entry. Background operation requires Always location permission, enabled notifications and internet; background location use is indicated by iOS. No BLE hardware is used. A newly added business cannot trigger until synchronized.

The native service requires two good measurements at least two seconds apart. `recordBusinessNoteVisit` rechecks a fix no older than ten seconds, confirmation time, current business/revision, consent, moderation, blocks, reports, account and emergency switch. Distance plus horizontal uncertainty must fit entirely inside the small radius; uncertain GPS suppresses the alert. These are client-reported measurements, not verified attendance. GPS cannot reliably confirm 2–5 m indoor or doorway entry, and this conservative threshold can miss visits. iOS may delay/suppress wake-ups, especially after force-quit. There is no hardware precision guarantee.

After admission, anonymous in-app activity contains the approved note text; the local notification may show it on the lock screen. Tapping opens the post with reporting/blocking and walking directions. No author identity or coordinates are returned in the alert. Query/entry fixes are transient and never update the administrator location snapshot.

## Limits and release

One reminder per business/user/UTC day, at most three business-note reminders per day, and no repeat of the same post within its 30-day eligibility window. Server-only `place_note_notification_receipts` expire after 2 days (business/day) or 31 days (post); `place_note_push_quota` expires after 2 days. Account deletion removes these records; author deletion removes note-linked activities/receipts for other recipients too. Interruptions after admission may lose the local alert while activity remains.

Deploy the business callables, `onBusinessChanged`, changed existing functions/rules, indexes and TTLs in `firestore.indexes.json`, App Hosting panel and iOS build. Confirm live indexes/TTLs/App Check and physical-iPhone background entry, GPS accuracy, opt-out, closure/relocation and deep links separately. Emulator tests do not contact live FCM or Apple Maps search.
