import { NextResponse } from 'next/server';
import { apiError, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { adminBucket, adminDb } from '../../../../../../../lib/firebase-admin';
import { uuid } from '../../../../../../../lib/validation';

const AVATAR_PATH = /^avatars\/[0-9a-f-]{36}\/(current|pending)\/[0-9a-f-]{36}\.jpg$/;

/**
 * Streams the photo under review through the admin server instead of a signed URL, so the App
 * Hosting service account never needs permission to sign blobs as itself.
 */
export async function GET(_request: Request, context: { params: Promise<{ luid: string }> }) {
  const access = await requireAdminApi('users.suspend');
  if (!access.ok) return unauthorized(access);
  try {
    const { luid: rawLuid } = await context.params;
    const luid = uuid(rawLuid, 'luid').toLowerCase();
    const review = await adminDb().collection('avatar_reviews').doc(luid).get();
    const path = String(review.data()?.path ?? '');
    if (!AVATAR_PATH.test(path) || !path.startsWith(`avatars/${luid}/`)) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }
    const [bytes] = await adminBucket().file(path).download();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch (error) {
    return apiError(error);
  }
}
