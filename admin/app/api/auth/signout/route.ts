import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/admin';
import { randomUUID } from 'node:crypto';
import { adminAuth } from '../../../../lib/firebase-admin';
import { recordAudit } from '../../../../lib/ops';

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  if (request.headers.get('origin') !== requestUrl.origin) {
    return NextResponse.json({ ok: false, reason: 'origin' }, { status: 403 });
  }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    try {
      const decoded = await adminAuth().verifySessionCookie(session);
      await adminAuth().revokeRefreshTokens(decoded.sub);
      await recordAudit(randomUUID(), {
        actorId: decoded.sub, action: 'admin_sign_out', resourceType: 'admin_session', resourceId: decoded.sub,
        reason: 'Administrator signed out.', permissionKey: 'session.sign_out', riskLevel: 'read',
      }).catch((error) => console.error('[admin-audit]', error));
    } catch {
      // Already invalid; clearing the cookie is enough.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
