# Orphan AR upload cleanup

`cleanupPostMedia` keeps the existing 48-hour orphan-upload grace period. Its world-map
scan now resumes from `system/world_map_orphan_cursor`; valid old posts consume the scan
budget and the next invocation continues after them. A folder split across pages remains
unfinished until every sibling is seen. The cursor wraps at the end, so inserts behind it
are reached on a later cycle.

Each invocation scans at most five pages of 300 objects and finishes at most 300 folders.
GCS requests explicitly use `autoPaginate: false`. The name bookmark uses `startOffset`
and an extra request slot for the inclusive bookmark; a deleted bookmark does not skip
its successor. The former `maxResults: 5000` call was automatically paginated by the SDK;
the old starvation bug came from selecting the first 300 eligible folders before checking
whether their posts existed.

Before reclaiming a candidate, a Firestore transaction checks `posts/{postId}` and creates:

- `storage_reclamations/{postId}`: server-only pending claim, later a reclaimed marker.
- `storage_reclamation_queue/{postId}`: resumable validation/deletion progress.

`createPost` reads the same claim in its publication transaction. A pending or reclaimed
draft fails with `failed-precondition` and the machine reason `draft_expired`; an existing
committed post still permits an idempotent replay. Storage rules block new/replacement
world-map uploads while the claim exists. These guards close the publish/cleanup race.

The job validates every object in the world-map and four closed legacy AR folders before
deleting anything. A fresh object or unknown metadata cancels validation and reopens the
draft. Validation resumes across invocations for arbitrarily large folders. Deletion also
resumes in bounded pages and uses each object's generation precondition, preserving
unexpected replacements made outside client rules. Deletion failures keep the job and
claim. Jobs rotate by attempt time; a 15-minute lease prevents simultaneous workers from
processing the same job. At most five jobs and 20 storage pages are processed per run.

Reclaimed markers have **no TTL**: an offline draft can retry after an unlimited delay.
The user must create a new draft after reclamation. Account deletion removes that
account's claims and queue rows. Client rules deny all writes to both collections.
Their queue ordering uses the ordinary single-field `updated_at` index.

For a future live rollout, pause the cleanup schedule while applying the `createPost`
claim guard and Storage rules; enable the new cleanup only after both are active. This
repository change has not been deployed to the live Firebase project.

Regression coverage is in `functions/test/orphanUploads.test.mjs`,
`functions/test/integration/cleanup.test.mjs`, and
`functions/test/rules/storage-reclamation.rules.test.mjs`. It covers 300 valid folders
before an orphan, large folders, fresh siblings across page boundaries, transaction
claims, durable restarts, failures, generation changes, and cursor wrap/mutations.

Firebase Storage emulator 15.32.1 ignores the GCS `startOffset` request parameter and
delete-generation preconditions. The local adapter uses its inclusive name `pageToken`
for ordinary pagination; production uses the GCS name-range cursor. Actual emulator tests
verify generation metadata and resumable deletion, while fault-model unit tests exercise
replacement-generation rejection and deletion of a scan bookmark. These emulator checks
do not prove Cloud Storage's generation-precondition enforcement.
