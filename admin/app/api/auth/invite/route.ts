import { NextResponse } from 'next/server';
import { adminAuth } from '../../../../lib/firebase-admin';
import { acceptUserInvitation } from '../../../../lib/admin-invite';
import { requireSameOrigin } from '../../../../lib/api';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
function failure(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status, headers });
}

/** Regular-user invitations never grant admin roles or create an admin session cookie. */
export async function POST(request: Request) {
  if (requireSameOrigin(request)) return failure(403, 'origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return failure(415, 'content_type');
  let body: unknown;
  try { body = await request.json(); } catch { return failure(400, 'invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return failure(400, 'invalid_json');
  const { idToken, inviteId } = body as { idToken?: unknown; inviteId?: unknown };
  if (typeof idToken !== 'string' || idToken.length < 32 || idToken.length > 16_384
    || typeof inviteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(inviteId)) return failure(400, 'invalid_request');
  let decoded;
  try { decoded = await adminAuth().verifyIdToken(idToken, true); } catch { return failure(401, 'invalid_session'); }
  if (Date.now() / 1000 - decoded.auth_time > 300) return failure(401, 'stale_sign_in');
  if (decoded.firebase.sign_in_provider !== 'password' || decoded.email_verified !== true) return failure(403, 'verified_email_sign_in_required');
  const error = await acceptUserInvitation(decoded.uid, { email: decoded.email, emailVerified: decoded.email_verified }, inviteId, true);
  if (error) return failure(error === 'invite_accept_failed' ? 500 : 403, error);
  return NextResponse.json({ ok: true }, { headers });
}
