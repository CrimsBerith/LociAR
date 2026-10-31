# Prepared Google Cloud support evidence — not sent

Project: `lociar-2f38c` (`696514892783`). Region: `us-central1`, unchanged. Resource: Cloud Functions gen2 `supportCheckoutReturn`, managed Cloud Run service `supportcheckoutreturn`. Runtime: Node.js 22, automatic base-image updates.

Problem: Cloud Build succeeds, image import and resource allocation report success, but all tested revisions fail `Ready / ContainerHealthy` with `HealthCheckContainerError` after the port-8080 startup timeout. Application boot markers are absent from logs. Please investigate why no application process reaches its first startup marker after allocation/import succeeds.

Current failing revision: `supportcheckoutreturn-00008-f7x`. [Revision logs](https://console.cloud.google.com/logs/query?project=lociar-2f38c&query=resource.type%3D%22cloud_run_revision%22%20AND%20resource.labels.service_name%3D%22supportcheckoutreturn%22%20AND%20resource.labels.revision_name%3D%22supportcheckoutreturn-00008-f7x%22).

Checks already performed:

- Node 22 Functions Framework `5.0.5` starts locally; the isolated static return function serves HTTP 200 and the webhook rejects GET with 405.
- The exact uploaded source passed Linux startup on the same Google Node 22 runtime base image in Cloud Build, UID 33. Build `51ca420c-c0b2-47fd-921a-46a90031da49` succeeded.
- A diagnostic using the actual built runtime/launcher layers passed in Cloud Build, with source mounted at `/workspace` (not an independent verification of the exact in-image source/default process). Build `00ea5f58-3dc5-41cb-a7e9-5c3699822ffb` succeeded.
- An isolated return module importing no Admin SDK, database or processor modules still failed: revision `00005-muh`.
- A direct dependency-free Node HTTP server bound to `0.0.0.0`, `process.env.PORT || 8080`, also failed: `00006-5rw`.
- Normal entry point in the gen2 execution environment with 512 MiB also failed: `00007-krm`.
- Automatic versus on-deploy base-image policy and 256/512 MiB checks did not resolve startup.
- Billing is enabled; the runtime service account is enabled. Project IAM contains the Cloud Run and Cloud Functions service-agent role bindings. No permission-denied audit evidence identifying a required missing grant was found.
- Architecture, working directory, source permissions and package/lock consistency were inspected. No region, rules or App Check weakening was used.

Diagnostic command/arguments and execution-environment changes were reverted; final config is normal entry point, default execution environment, 256 MiB, 1 CPU, maximum two instances, no minimum warm instance. No live payments are active. This draft contains no credentials or customer transaction data.
