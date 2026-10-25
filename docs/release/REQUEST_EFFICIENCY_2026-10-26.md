# Request efficiency and automatic freshness — 26 October 2026

Scope: native iOS request dispatch and presentation freshness on `codex/fix-anonymous-location-audit`, starting at `5a3759f`. No production deployment, feature-flag write, Scheduler deletion or store submission is included.

## Resulting behavior

| Flow | Policy |
| --- | --- |
| Discover, activity, public profiles and post comments | One logical screen refresh at a time. Re-entering within the successful 60-second freshness window reuses that screen's existing in-memory presentation. Explicit refresh cannot start more often than every five seconds. |
| Automatic screen refresh | Runs while the view is mounted/visible and the app is active. The first page refreshes at approximately one-minute intervals. Periodic refresh does not reset an expanded older-page list; explicit refresh, reactivation and content invalidation can revalidate it. Preview/UI-fixture modes load once instead of polling synthetic data. |
| Paging | Each cursor has its own dispatch guard. Different next pages can load immediately; a repeated/failed cursor cannot create a tap-driven request burst. |
| Transient failures | Reads back off at 15, 30, 60 and 120 seconds. Connectivity restoration wakes completed network failures; it does not cancel an already-running request or bypass a server rate-limit cooldown. Permanent denials stop automatic retries. Unknown resource-exhaustion errors do not repeatedly rescan an expensive query. |
| Nearby map summaries | Refresh after 60 seconds while active. Coarse heat summaries refresh after 300 seconds. Existing viewport debounce, coverage reuse, size limits, minimum start gap and one latest pending viewport remain. |
| Map gestures and refresh | A new viewport preempts a sleeping long refresh timer. Explicit refresh taps have a ten-second cooldown and share an in-flight load. Hidden maps and maps covered by their composer/group/camera sheets suspend requests. |
| Composer cancellation | Closing the composer without publishing resumes fresh map data instead of clearing its cache and forcing another request. Successful publishing still invalidates the map and wakes visible feeds. |
| Content and account changes | Successful publishing, deletion, reporting and blocking invalidate visible content. Scope/revision guards discard late first-page and pagination results. Comment scopes include the viewer, post and lock state. Blocking invalidates presentation even if subsequent unfollow cleanup fails. |
| Activity notifications | A recipient-validated foreground push wakes activity freshness without invalidating unrelated discover/profile screens. |
| GIF search | Debounce uses the same trimmed, 50-UTF-16-unit query identity as the repository. An old first/more response cannot populate a changed query during its debounce window. The existing memory cache/provider policy is unchanged. |
| Repeated region discovery | Routine preference and foreground GPS callbacks reuse a successful region discovery for up to five minutes while scope and location remain stable. A new usable fix or significant movement refreshes sooner; the movement threshold is at least 250 m and accounts for coarse-fix uncertainty. |

Region discovery reuse is metadata reuse. Account/preferences scope changes, fresh-fix requests and monitoring recovery bypass it. Explicit silent pushes, refresh-boundary events, background refresh and other existing `synchronize()` callers retain their forced path. Actual arrival delivery still checks current consent, account state and measured location on the server. The foreground preference/consent refresh was not slowed down.

## Safety and acceptance boundaries

`ScreenRefreshGate` stores dispatch timestamps, scope/revision IDs and failure state, not response bodies, location-note grants or authorization decisions. No new disk cache was added. Existing displayed state is scoped to the viewer/resource and cleared on scope/content changes. Every dispatched request continues through the existing authenticated repositories and server checks; the on-site reading and anonymous-block contracts are unchanged.

A logical screen refresh may contain several required backend calls, such as comments plus membership. These guards do not claim one HTTP request for every screen. Automatic refresh deliberately adds bounded updates to an idle visible screen so the user need not keep pulling; the goal is fewer duplicate/bursty requests with bounded freshness, not zero requests or fewer requests in every possible idle scenario.

## Validation

Logs and result bundles: `build/request-efficiency-20261026/`.

- Native tests: 259 total, 257 passed, 2 physical-device-only skips, 0 failures.
- Seventeen additional behavioral tests cover dispatch coalescing/cooldown, expiry, late revisions/viewers, cancellation, network and rate-limit recovery, notification isolation, normalized GIF identity, stationary/moving region discovery and map timer preemption/recovery.
- The stationary successful-region scenario performs **12 discovery batches for 60 one-minute callbacks**, versus the previous unconditional 60. This is an **80% reduction in that scenario's discovery batches**, not an invoice or whole-app savings claim.
- Existing first-page, pagination, privacy, account, proximity and world-map tests remain in the full native run.
- Full 39-test simulator UI validation and final static checks are recorded when complete. GitHub checks must validate the final pushed head separately.

No production traffic experiment or billing before/after comparison was performed. The live map-cell flag and consolidated Scheduler rollout remain separate from this native change. Users receive these behaviors only through an installed iOS build containing the changes and its required matching backend protocol.
