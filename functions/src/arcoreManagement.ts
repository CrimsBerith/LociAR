import { GoogleAuth } from 'google-auth-library';
import * as logger from 'firebase-functions/logger';

/**
 * ARCore Cloud Anchor Management API (https://developers.google.com/ar/develop/cloud-anchors/management-api).
 * Called with the Functions runtime service account (scope arcore.management); no key file.
 * All calls are best effort: anchors also expire on their own (TTL ≤ 365 days).
 */
const API = 'https://arcore.googleapis.com/v1beta2/management/anchors';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/arcore.management'] });

/** Emulators and unit tests never talk to the real ARCore service. */
const disabled = () => process.env.FUNCTIONS_EMULATOR === 'true' || process.env.ARCORE_MANAGEMENT_DISABLED === 'true';

/** Minimal client surface so tests can stub the Management API (no real Google calls in CI). */
export type ManagementClient = { request<T = unknown>(options: { url: string; method: string; timeout?: number }): Promise<{ data: T }> };
export type ManagementDeps = { getClient?: () => Promise<ManagementClient> };
const realClient = async (): Promise<ManagementClient> => (await auth.getClient()) as unknown as ManagementClient;

export type DeleteOutcome = { ok: boolean; skipped?: boolean; status?: number; error?: string };

/**
 * 404 counts as already deleted. `skipped` means the API is switched off (emulator / tests);
 * any other failure (403, 5xx, network) returns ok=false with the reason so callers can queue a retry.
 */
export async function deleteCloudAnchorDetailed(anchorId: string | null | undefined, deps: ManagementDeps = {}): Promise<DeleteOutcome> {
  if (!anchorId) return { ok: true, skipped: true };
  if (disabled()) return { ok: false, skipped: true, error: 'management_disabled' };
  try {
    const client = await (deps.getClient ?? realClient)();
    await client.request({ url: `${API}/${encodeURIComponent(anchorId)}`, method: 'DELETE', timeout: 15_000 });
    return { ok: true, status: 200 };
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return { ok: true, status: 404 }; // already gone
    logger.error('cloud_anchor_delete_failed', { code: status ?? 'provider_error' });
    return { ok: false, status, error: status ? `http_${status}` : 'provider_error' };
  }
}

export async function deleteCloudAnchor(anchorId: string | null | undefined, deps: ManagementDeps = {}): Promise<boolean> {
  if (!anchorId) return false;
  return (await deleteCloudAnchorDetailed(anchorId, deps)).ok;
}

export type ManagedAnchor = { id: string; createTime: string };

/**
 * One page of hosted anchors, in the API's default order (the orphan sweep filters by age itself).
 * The documented query is `page_size`, `order_by` and `next_page_token`; the earlier
 * `order_by=create_time` + `page_token` request was refused with HTTP 400 every night (7–14 Nov 2026),
 * so only the size and the documented token parameter are sent.
 */
export async function listCloudAnchors(pageToken?: string, deps: ManagementDeps = {}): Promise<{ anchors: ManagedAnchor[]; nextPageToken?: string }> {
  if (disabled()) return { anchors: [] };
  const client = await (deps.getClient ?? realClient)();
  const params = new URLSearchParams({ page_size: '200' });
  if (pageToken) params.set('next_page_token', pageToken);
  let response: { data: { anchors?: Array<{ name?: string; createTime?: string }>; nextPageToken?: string } };
  try {
    response = await client.request({ url: `${API}?${params.toString()}`, method: 'GET', timeout: 15_000 });
  } catch (error) {
    // Google's own status and message (no user data) make the next failure diagnosable from the logs.
    const detail = (error as { response?: { status?: number; data?: { error?: { status?: string; message?: string } } } }).response;
    logger.error('cloud_anchor_list_failed', {
      code: detail?.status ?? 'provider_error',
      reason: String(detail?.data?.error?.status ?? '').slice(0, 64),
      detail: String(detail?.data?.error?.message ?? '').slice(0, 200),
    });
    throw error;
  }
  const anchors = (response.data.anchors ?? [])
    .map((a) => ({ id: String(a.name ?? '').replace(/^anchors\//, ''), createTime: String(a.createTime ?? '') }))
    .filter((a) => a.id.length > 0);
  return { anchors, nextPageToken: response.data.nextPageToken };
}
