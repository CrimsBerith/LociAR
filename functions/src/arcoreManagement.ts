import { GoogleAuth } from 'google-auth-library';

/**
 * ARCore Cloud Anchor Management API (https://developers.google.com/ar/develop/cloud-anchors/management-api).
 * Called with the Functions runtime service account (scope arcore.management); no key file.
 * All calls are best effort: anchors also expire on their own (TTL ≤ 365 days).
 */
const API = 'https://arcore.googleapis.com/v1beta2/management/anchors';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/arcore.management'] });

/** Emulators and unit tests never talk to the real ARCore service. */
const disabled = () => process.env.FUNCTIONS_EMULATOR === 'true' || process.env.ARCORE_MANAGEMENT_DISABLED === 'true';

export async function deleteCloudAnchor(anchorId: string | null | undefined): Promise<boolean> {
  if (!anchorId || disabled()) return false;
  try {
    const client = await auth.getClient();
    await client.request({ url: `${API}/${encodeURIComponent(anchorId)}`, method: 'DELETE' });
    return true;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return true; // already gone
    console.error('cloud_anchor_delete_failed', anchorId, status ?? error);
    return false;
  }
}

export type ManagedAnchor = { id: string; createTime: string };

/** One page of hosted anchors, oldest first. */
export async function listCloudAnchors(pageToken?: string): Promise<{ anchors: ManagedAnchor[]; nextPageToken?: string }> {
  if (disabled()) return { anchors: [] };
  const client = await auth.getClient();
  const params = new URLSearchParams({ page_size: '200', order_by: 'create_time' });
  if (pageToken) params.set('page_token', pageToken);
  const response = await client.request<{ anchors?: Array<{ name?: string; createTime?: string }>; nextPageToken?: string }>({
    url: `${API}?${params.toString()}`,
    method: 'GET',
  });
  const anchors = (response.data.anchors ?? [])
    .map((a) => ({ id: String(a.name ?? '').replace(/^anchors\//, ''), createTime: String(a.createTime ?? '') }))
    .filter((a) => a.id.length > 0);
  return { anchors, nextPageToken: response.data.nextPageToken };
}
