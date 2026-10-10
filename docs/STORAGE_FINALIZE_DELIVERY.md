# Storage finalization delivery

The existing Firebase bucket `lociar-2f38c.firebasestorage.app` is in `us-east1`.
Functions remain in `us-central1`, matching Firestore `nam5`. Firebase CLI rejects direct
Storage triggers across this pair of regions, and Cloud Storage does not relocate Firebase buckets.

Use Cloud Storage's supported Pub/Sub notifications on `lociar-storage-finalized`.
The notification sends `OBJECT_FINALIZE` identity attributes with payload `NONE`: object
bytes, AR location and Firebase bearer-token metadata are not copied into the topic.
Both finalizers are private, retry-enabled Pub/Sub Functions in `us-central1`; generation
preconditions, deletion fences and token revocation behavior stay intact.

Before the first deploy, using the authorized project identity:

```sh
gcloud storage buckets notifications list gs://lociar-2f38c.firebasestorage.app --project=lociar-2f38c
# Create only if the matching notification is absent:
gcloud storage buckets notifications create gs://lociar-2f38c.firebasestorage.app --project=lociar-2f38c --topic=projects/lociar-2f38c/topics/lociar-storage-finalized --event-types=OBJECT_FINALIZE --payload-format=none
```

The standard command creates the topic if needed and grants only the project's Storage
service agent permission to publish to it. Do not grant public or mobile-client access.
Subsequent deployments use `scripts/firebase-deploy.command` normally. Do not create a
duplicate bucket notification: validate the existing configuration's topic, event type
and payload format first.

Acceptance: notification exists with `NONE` / `OBJECT_FINALIZE`; both Functions are ACTIVE
in `us-central1`, retry enabled and attached to this topic. Observe a synthetic late upload
being removed by the deletion finalizer and a synthetic world-map token being revoked,
then remove only that verification data. Emulator tests call the Pub/Sub handler with
actual Storage-emulator generations; production notification delivery is a separate check.

Source: [Cloud Storage Pub/Sub notifications](https://docs.cloud.google.com/storage/docs/pubsub-notifications).
