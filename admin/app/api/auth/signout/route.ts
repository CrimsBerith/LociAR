import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/admin';
import { randomUUID } from 'node:crypto';
import { adminAuth } from '../../../../lib/firebase-admin';
import { recordAudit } from '../../../../lib/ops';
import { requireSameOrigin } from '../../../../lib/api';
import { readAdminEmailSession, revokeAdminEmailSession, EMAIL_CHALLENGE_COOKIE } from '../../../../lib/admin-email-auth';

export async function POST(request: NextRequest) {
  if (requireSameOrigin(request)) {
    return NextResponse.json({ ok: false, reason: 'origin' }, { status: 403 });
  }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    try {
      const decoded = session.startsWith('email1.')
        ? await readAdminEmailSession(session).then(identity => ({ sub: identity?.uid }))
        : await adminAuth().verifySessionCookie(session);
      if (session.startsWith('email1.')) await revokeAdminEmailSession(session);
      if (!decoded.sub) throw new Error('invalid_session');
      await adminAuth().revokeRefreshTokens(decoded.sub);
      await recordAudit(randomUUID(), {
        actorId: decoded.sub, action: 'admin_sign_out', resourceType: 'admin_session', resourceId: decoded.sub,
        reason: 'Administrator signed out.', permissionKey: 'session.sign_out', riskLevel: 'read',
      }).catch(() => console.error('[admin-audit] write_failed'));
    } catch {
      // Already invalid; clearing the cookie is enough.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  response.cookies.set(EMAIL_CHALLENGE_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/api/auth/email-code', maxAge: 0 });
  return response;
}
