import { NextRequest, NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../../lib/api';
import { SESSION_COOKIE } from '../../../../lib/admin';
import { parseJson, ValidationError } from '../../../../lib/validation';
import { EMAIL_CHALLENGE_COOKIE, EMAIL_CODE_SECONDS, EMAIL_SESSION_SECONDS, EmailDeliveryError, EmailRateLimitError,
  requestAdminEmailCode, verifyAdminEmailCode } from '../../../../lib/admin-email-auth';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request: NextRequest) {
  const originFailure = requireSameOrigin(request); if (originFailure) return originFailure;
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:', sameSite: 'strict' as const };
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'JSON gerekli.' }, { status: 415, headers });
    const body = await parseJson(request);
    if (body.action === 'request') {
      if (!process.env.ADMIN_EMAIL_API_KEY || !process.env.ADMIN_EMAIL_FROM) throw new EmailDeliveryError();
      // App Hosting sets x-fah-client-ip; the last X-Forwarded-For hop there is a Google proxy.
      const source = request.headers.get('x-fah-client-ip')?.trim()
        || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
      const challenge = await requestAdminEmailCode(body.email, source);
      const response = NextResponse.json({ ok: true, message: 'Adres yetkiliyse giriş kodu gönderildi. Gelen kutunu ve spam klasörünü kontrol et.' }, { headers });
      response.cookies.set(EMAIL_CHALLENGE_COOKIE, challenge, { ...cookieOptions, path: '/api/auth/email-code', maxAge: EMAIL_CODE_SECONDS });
      return response;
    }
    if (body.action === 'verify') {
      const session = await verifyAdminEmailCode(request.cookies.get(EMAIL_CHALLENGE_COOKIE)?.value, body.code);
      if (!session) return NextResponse.json({ error: 'Kod geçersiz, süresi dolmuş veya deneme sınırına ulaşılmış. Yeni kod iste.' }, { status: 401, headers });
      const response = NextResponse.json({ ok: true, redirect: '/admin/dashboard' }, { headers });
      response.cookies.set(SESSION_COOKIE, session, { ...cookieOptions, path: '/', maxAge: EMAIL_SESSION_SECONDS });
      response.cookies.set(EMAIL_CHALLENGE_COOKIE, '', { ...cookieOptions, path: '/api/auth/email-code', maxAge: 0 });
      return response;
    }
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400, headers });
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
    if (error instanceof EmailRateLimitError) return NextResponse.json({ error: 'Çok fazla istek. Bir süre sonra yeniden dene.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    if (error instanceof EmailDeliveryError) return NextResponse.json({ error: 'Giriş e-postası gönderilemedi. Gönderici hizmetinin yapılandırılması veya kontrol edilmesi gerekiyor.' }, { status: 503, headers });
    console.error('[admin-email-auth] operation_failed');
    return NextResponse.json({ error: 'Giriş işlemi tamamlanamadı.' }, { status: 500, headers });
  }
}
