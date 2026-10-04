import { NextRequest, NextResponse } from 'next/server';
import { acceptPendingAdminInvite } from '../../../../lib/admin-invite';
import { activeRoles, SESSION_COOKIE } from '../../../../lib/admin';
import { randomUUID } from 'node:crypto';
import { adminAuth, adminDb } from '../../../../lib/firebase-admin';
import { recordAudit } from '../../../../lib/ops';

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
const SESSION_HOURS = 8;

function failure(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status, headers: noStoreHeaders });
}

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie (admins only). */
export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  if (request.headers.get('origin') !== requestUrl.origin) return failure(403, 'origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return failure(415, 'content_type');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, 'invalid_json');
  }
  const { idToken } = body as { idToken?: unknown };
  if (typeof idToken !== 'string' || idToken.length < 32 || idToken.length > 16_384) {
    return failure(400, 'invalid_id_token');
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    return failure(401, 'invalid_session');
  }
  // Only a sign-in from the last five minutes may mint a session cookie.
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return failure(401, 'stale_sign_in');

  const inviteFailure = await acceptPendingAdminInvite(decoded.uid, { email: decoded.email, emailVerified: decoded.email_verified });
  if (inviteFailure) return failure(500, inviteFailure);
  const roles = await activeRoles(decoded.uid);
  if (roles.length === 0) return failure(403, 'admin_required');

  const expiresIn = SESSION_HOURS * 60 * 60 * 1000;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  const secondFactor = (decoded.firebase as { sign_in_second_factor?: string }).sign_in_second_factor;
  const response = NextResponse.json(
    { ok: true, redirect: secondFactor ? '/admin/dashboard' : '/admin/mfa' },
    { status: 200, headers: noStoreHeaders },
  );
  await recordAudit(randomUUID(), {
    actorId: decoded.uid, action: 'admin_sign_in', resourceType: 'admin_session', resourceId: decoded.uid,
    after: { secondFactor: Boolean(secondFactor) }, reason: 'Administrator signed in.', permissionKey: 'session.sign_in', riskLevel: 'sensitive',
  }).catch((error) => console.error('[admin-audit]', error));
  await auditMfaEnrollment(decoded.uid).catch((error) => console.error('[admin-audit]', error));
  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || requestUrl.protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: expiresIn / 1000,
  });
  return response;
}

/**
 * Records new second factors: the enrolled-factor ids are compared with the set seen at the
 * previous sign-in (admin_mfa_state/{uid}), so every TOTP enrollment leaves an audit entry.
 */
async function auditMfaEnrollment(uid: string) {
  const user = await adminAuth().getUser(uid);
  const factors = (user.multiFactor?.enrolledFactors ?? []).map((f) => f.uid).sort();
  const ref = adminDb().collection('admin_mfa_state').doc(uid);
  const known: string[] = ((await ref.get()).data()?.factor_ids as string[] | undefined) ?? [];
  const added = factors.filter((id) => !known.includes(id));
  const removed = known.filter((id) => !factors.includes(id));
  if (added.length === 0 && removed.length === 0) return;
  await recordAudit(randomUUID(), {
    actorId: uid, action: added.length ? 'admin_mfa_enrolled' : 'admin_mfa_removed', resourceType: 'admin_mfa', resourceId: uid,
    before: { factors: known.length }, after: { factors: factors.length, added: added.length, removed: removed.length },
    reason: 'Second-factor enrollment changed.', permissionKey: 'session.mfa', riskLevel: 'sensitive',
  });
  await ref.set({ factor_ids: factors, updated_at: new Date() });
}
