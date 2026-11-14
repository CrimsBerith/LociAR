/**
 * locidrop.com is the app's public website: only the legal and support pages (and the files they
 * need) are served there. The admin panel, its API and sign-in pages stay on the App Hosting
 * address and answer 404 on the public domain.
 */
export const PUBLIC_SITE_HOSTS = new Set(['locidrop.com', 'www.locidrop.com']);
export const PUBLIC_SITE_HOME = '/support';

const PUBLIC_PATH = /^\/(?:privacy|terms|support)(?:\/en)?\/?$/;
const PUBLIC_ASSET = /^\/(?:_next\/|favicon\.ico$|icon\.png$|apple-icon\.png$|opengraph-image)/;

export type PublicSiteDecision = 'pass' | 'home' | 'not_found';

/** What the proxy does with a request; `pass` for every host other than the public domain. */
export function publicSiteDecision(host: string | null, pathname: string): PublicSiteDecision {
  const name = (host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!PUBLIC_SITE_HOSTS.has(name)) return 'pass';
  if (pathname === '/' || pathname === '') return 'home';
  if (PUBLIC_PATH.test(pathname) || PUBLIC_ASSET.test(pathname)) return 'pass';
  return 'not_found';
}
