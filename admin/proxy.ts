import { NextResponse, type NextRequest } from 'next/server';

// Authorization is intentionally enforced in server components and server actions:
// they validate the Firebase session cookie and admin roles with server-only credentials.

const CONNECT = "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com";
const COMMON = "font-src 'self'; object-src 'none'; frame-src https://*.firebaseapp.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const IMG = "img-src 'self' data: blob:";
// Moderators review GIF posts: admin pages may show GIPHY media (images only, no scripts or frames).
const ADMIN_IMG = `${IMG} https://media.giphy.com`;

/** Admin and sign-in pages are rendered per request, so they get a per-request script nonce. */
function isDynamicAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname === '/login' || pathname.startsWith('/auth');
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  let csp: string;
  let response: NextResponse;
  if (isDynamicAdminPath(request.nextUrl.pathname)) {
    // No 'unsafe-inline' scripts: only scripts carrying this request's nonce (and what they load) run.
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; ${CONNECT}; ${ADMIN_IMG}; ${COMMON}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    // Public legal pages are prerendered at build time (no per-request nonce possible); they hold no
    // forms or secrets, and still forbid every third-party script.
    csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ${CONNECT}; ${IMG}; ${COMMON}`;
    response = NextResponse.next();
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
