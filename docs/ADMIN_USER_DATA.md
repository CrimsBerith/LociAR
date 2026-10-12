# Optional administrator data sharing

The iOS app exposes two separate, off-by-default switches in Profile → Settings:

- Technical and usage sharing: device type, OS/app version, locale, time zone, a random installation identifier, the connection IP observed by Functions, and foreground usage times.
- Administrator location sharing: latest device coordinates, horizontal accuracy, and the device measurement time, while the app is in the foreground. This is independent of AR/post location permission. It explicitly discloses that anonymous posts can be associated with the account on the server.

Existing server events for posts, views and social interactions remain operational records. No address book, advertising identifier, IMEI, other-app activity or new phone authentication is added.

The single off-by-default **Notifications** switch covers social, business-note, campaign and administrator alerts. Nearby GPS entry checks run locally for at most 120 seconds per wake; background operation needs Always permission. Transient entry fixes never update the administrator snapshot. See [BUSINESS_NOTES.md](BUSINESS_NOTES.md) and [BRAND_CAMPAIGNS.md](BRAND_CAMPAIGNS.md) for thresholds, limits and device verification.

`readDataPreferences`, `setDataPreferences` and `recordUserContext` run in `us-central1`, require Auth and production App Check, and fence suspended/deleting accounts. Consent revisions prevent old queued requests from writing after revocation. Conflicting preference updates must refresh and retry. The client persists failed preference changes and pauses sharing until the server confirms them; an offline revocation deletes the snapshot when the device reconnects.

`user_data_preferences`, `user_device_context`, and `user_locations` are server-only. Device reports are limited to one per minute; location reports to one per 30 seconds, with fixes no older than two minutes. One latest snapshot per account is retained; if several installations share an account, the latest accepted reporting installation wins. These are client-reported values, not verified physical identity or guaranteed live position.

The users list and each post detail offer on-demand private data reads. Only the super admin initially has `users.telemetry.read` and `users.location.read`. Reads require MFA, an access reason and a committed audit record; no coordinate or IP is copied into audit snapshots. Responses are private/no-store. Reports older than two minutes are labelled stale. A hidden browser tab clears its displayed result.

Location reports expire after 24 hours; device snapshots after 30 days. Admin reads reject expired records even before Firestore TTL deletes them. Usage events use the existing 180-day expiry. Turning sharing off deletes the corresponding snapshot; account hard deletion also removes preferences and usage events.

Deployment requires the three callable exports, Firebase App Hosting admin build, the updated iOS build, and `firestore.indexes.json` including the new TTL policies and the per-user analytics index. Confirm the live TTL policies are active before release. Updated public privacy pages disclose the new behavior.

Focused emulator checks:

```sh
rtk proxy node --test test/integration/user-context.test.mjs
rtk proxy node --conditions=react-server --import ./tests/register-typescript.mjs --test tests/integration/user-context.test.mjs
```

Run the first from `functions/` with Auth, Functions and Firestore emulators, and the second from `admin/` with Firestore. Run the complete rules suite using `rtk npm run test:rules` from `functions/`.

Departure reminders use the same Notifications switch. A fresh, opted-in location can be retained as a private trigger origin for at most 24 hours in `campaign_departure_regions`; this does not infer home or update the administrator snapshot in the background. The region uses its own revocation epoch, TTL and account-deletion cleanup.
