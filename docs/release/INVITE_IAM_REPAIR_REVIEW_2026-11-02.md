# Invite platform access failure — review before live change

## Confirmed failure

The installed iPhone app can load Discover after manual retry, while Invite fails repeatedly with an authentication error. Read-only checks independently confirm platform-level denial:

| Cloud Run service | `allUsers` → `roles/run.invoker` | Unauthenticated GET |
| --- | --- | --- |
| `createinvites` | absent | 403 HTML (platform Forbidden) |
| `redeeminvite` | absent | 403 HTML (platform Forbidden) |
| `readpubliccontent` (working comparison) | present | 400 JSON (callable protocol reached) |

Evidence: `build/device-fixes-20261102/invite-platform-evidence.json`. Firebase client credentials do not replace the separate Cloud Run IAM invoker identity. See [Firebase callable protocol/authentication](https://firebase.google.com/docs/functions/callable) and [Cloud Run functions invocation IAM](https://docs.cloud.google.com/functions/docs/securing/authenticating).

## Deployed application guards verified

Downloaded the exact deployed `createInvites` source generation `1792280605925961` from its function metadata (read only), then inspected the compiled files in the archive without executing them:

- `lib/invites.js:58`: `createInvites` uses `enforceAppCheck: ENFORCE_APP_CHECK`; its handler immediately calls `requireCaller`, checks verified identity and checks active account before transaction writes. Invite gate and lifetime allocation limit remain.
- `lib/invites.js:89`: `redeemInvite` uses the same App Check option, requires the caller before parsing input, then enforces attempt limits and transaction policies. Its separate deployed source generation `1792280681776352` was also downloaded and inspected; the relevant compiled invite/core files match the createInvites archive exactly.
- `lib/core.js:77`: App Check enforcement is enabled outside `FUNCTIONS_EMULATOR=true`.
- `lib/core.js:100`: `requireCaller` rejects missing Firebase authentication and account mutation mismatches.

These observations do not establish successful live authenticated or App Check acceptance. The current invoker denial happens before those guards can execute for mobile requests.

Both functions' deployed `FUNCTIONS_EMULATOR` environment flags are unset, so the inspected production App Check expression evaluates to true. File hashes and guard checks: `build/device-fixes-20261102/deployed-invite-guards.json`.

## Minimal repair — owner approved and applied

The owner explicitly approved adding only these two service-level bindings in this chat, and both commands below completed successfully. They make the callable protocol reachable in the same way as the working Firebase callables; Firebase Auth, App Check, account fences, rate limits and server-only writes stay enforced. No application/backend deployment was performed.

```sh
gcloud run services add-iam-policy-binding createinvites \
  --project=lociar-2f38c --region=us-central1 \
  --member=allUsers --role=roles/run.invoker

gcloud run services add-iam-policy-binding redeeminvite \
  --project=lociar-2f38c --region=us-central1 \
  --member=allUsers --role=roles/run.invoker
```

Before applying, rechecked both exact deployed source generations and the production emulator flag, and saved the original IAM policies (`createinvites-iam-before.json`, `redeeminvite-iam-before.json`). After repair, both endpoints reject POST requests with no Firebase/App Check credentials with HTTP 401 and JSON callable `UNAUTHENTICATED`, instead of the platform HTML denial. Evidence: `build/device-fixes-20261102/invite-guards-after-repair.json`. This checks rejection with both credentials missing; it does not separately exercise each guard with the other credential valid.

Normal authenticated iPhone acceptance is recorded in the solo audit report. Loading Invite may allocate the caller's remaining codes under the existing server contract. No code redemption, note publication or account change is needed or performed for this repair.

Rollback removes only the newly added `allUsers` invoker binding on the two named services, preserving unrelated bindings. Final saved policies: `createinvites-iam-after.json`, `redeeminvite-iam-after.json` in the evidence directory.
