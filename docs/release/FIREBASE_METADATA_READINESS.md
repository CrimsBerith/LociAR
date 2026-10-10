# Firebase metadata acceptance

`qa-live-firebase.py` collects read-only operational metadata or validates an already saved JSON report.
It never enables APIs, changes IAM, deploys Functions, modifies data, reads an Apple key value or starts an interactive login.
Python 3 is required. This work does not require macOS/Xcode.

Reports are stored only in `build/firebase-readiness/`, created with owner-only directory permissions. Supply a plain `.json` filename; directory components, existing output files and symlinks are refused. Existing directories must have mode 700. After an authorized GCP identity has been connected, run:

```sh
python3 -B scripts/qa-live-firebase.py \
  --gcloud-configuration <authorized-configuration> \
  --report firebase-metadata.json
```

In a managed environment the configuration must match exactly one GCP connection in the version-1
`OIC_MANIFEST_PATH` manifest. Empty, ambiguous, malformed or unsupported selectors fail before `gcloud`
executes. The script selects the supplied configuration/credential **paths**; it does not inspect their
contents or fall back to platform bootstrap credentials. Inherited proxy, CA trust and runtime guard
variables are preserved. Emulator selectors are rejected for live collection.

Validate the saved report without GCP, credentials or `gcloud`:

```sh
python3 -B scripts/qa-live-firebase.py \
  --from-report firebase-metadata.json \
  --report firebase-metadata-checked.json
```

Exit `0` means every modeled criterion passed; exit `1` means a criterion failed, an observation is
unknown, a command failed or the input could not be checked. A failed collection still writes its
sanitized report when possible. Raw CLI diagnostics, environment variables and secret payloads are
excluded. `--report` creates an owner-only JSON file in the fixed report directory; omitting it writes JSON to stdout.

The version-2 report contains `schema_version`, the fixed `project_id`, `collected_at`,
`resources`, per-resource `commands` (`status`, `return_code`), and `readiness` (`ready`, `findings`).
Findings contain a stable `code`, resource identifier and short explanation. `validation_mode` makes
live collection versus offline validation explicit; revalidating a saved report does not refresh its
observations. JSON fields beyond the metadata projection are discarded.

| Observation | Acceptance |
|---|---|
| Project | `lociar-2f38c`, `ACTIVE`; observed project number is accepted in canonical resource names |
| APIs | The main required API block in `google-cloud-setup.command`, plus `fcm.googleapis.com`, is enabled |
| Firestore | The default database in the same project, `nam5`, `FIRESTORE_NATIVE` |
| TTL | Every `ttl: true` field in `firestore.indexes.json` is `ACTIVE`; deployment in progress fails |
| Functions | Every export in `functions/src/index.ts` exists in `us-central1`, `ACTIVE`, `GEN_2`, `nodejs22` |
| Scheduler | Every exported `onSchedule` has an `ENABLED` Firebase job in the same region, correct schedule and explicit timezone |
| Storage | The configured Firebase bucket has unrestricted 30-day `Delete` rules for all four retired media prefixes |
| Storage notifications | Full-bucket `OBJECT_FINALIZE` identity notifications, payload `NONE`, to the topic derived from `storageFinalizeEvents.ts` |
| Storage finalizers | Pub/Sub Functions in `us-central1`, correct topic, retry enabled; see [delivery setup](../STORAGE_FINALIZE_DELIVERY.md) |
| Apple private key | At least one `APPLE_PRIVATE_KEY` Secret Manager version in the same project is `ENABLED`; only version metadata is read |
| GIPHY key | At least one `GIPHY_API_KEY` version is `ENABLED`; only metadata is read |
| Collection | All ten metadata commands succeeded; missing/failed observations cannot pass |

This is an infrastructure metadata gate. It does not attest source-code revision, deployed Rules
contents, composite-index build state, IAM permissions used by the running application, Apple token
exchange, real TOTP/App Check, APNs delivery or physical AR behavior. Those runtime/native gates remain
in [RELEASE_READINESS.md](RELEASE_READINESS.md).

Offline regressions are included in the repository script test suite:

```sh
node --test scripts/test/firebase-readiness.test.mjs
python3 -B -m unittest discover -s scripts/test -p firebase_readiness_test.py
```

They use synthetic metadata and command stubs. Passing them is not a claim that live Firebase is ready.
