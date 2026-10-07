import { NextResponse, type NextRequest } from 'next/server';
import { getAdminContext, SESSION_COOKIE } from './lib/admin';

// Resolve page authorization before loading boundaries can begin streaming. Server components
// and API handlers still independently enforce their session, MFA and permission checks.
const PAGE_PERMISSIONS: Record<string, string> = {
  users: 'users.read', posts: 'posts.read', moderation: 'posts.read', avatars: 'users.suspend',
  approvals: 'posts.metrics.write', anchors: 'anchors.read', places: 'anchors.read',
  zones: 'anchors.read', audit: 'audit.read',
};

async function protectedPageRedirect(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith('/admin/') || ['/admin/login', '/admin/mfa', '/admin/unauthorized'].includes(pathname)) return null;
  const admin = await getAdminContext(request.cookies.get(SESSION_COOKIE)?.value ?? null);
  if (!admin) return NextResponse.redirect(new URL('/admin/login?reason=admin_required', request.url));
  if (admin.assuranceLevel !== 'aal2') return NextResponse.redirect(new URL('/admin/mfa', request.url));
  const permission = pathname === '/admin/posts/new'
    ? 'posts.create'
    : PAGE_PERMISSIONS[pathname.split('/')[2]] ?? 'dashboard.read';
  if (!admin.permissions.has('dashboard.read') || !admin.permissions.has(permission)) {
    return NextResponse.redirect(new URL('/admin/unauthorized', request.url));
  }
  return null;
}

const CONNECT = "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com";
const COMMON = "img-src 'self' data: blob:; font-src 'self'; object-src 'none'; frame-src https://*.firebaseapp.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Admin and sign-in pages are rendered per request, so they get a per-request script nonce. */
function isDynamicAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname === '/login' || pathname.startsWith('/auth');
}

export async function proxy(request: NextRequest) {
  const earlyRedirect = await protectedPageRedirect(request);
  const isDev = process.env.NODE_ENV === 'development';
  let csp: string;
  let response: NextResponse;
  if (isDynamicAdminPath(request.nextUrl.pathname)) {
    // No 'unsafe-inline' scripts: only scripts carrying this request's nonce (and what they load) run.
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; ${CONNECT}; ${COMMON}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    response = earlyRedirect ?? NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    // Public legal pages are prerendered at build time (no per-request nonce possible); they hold no
    // forms or secrets, and still forbid every third-party script.
    csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ${CONNECT}; ${COMMON}`;
    response = earlyRedirect ?? NextResponse.next();
  }
  if (earlyRedirect) response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = {
  matcher: [
    // Protected pages also enforce the gate for router prefetch requests.
    '/admin/:path*',
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
