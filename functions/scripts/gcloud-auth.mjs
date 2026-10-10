import { execFileSync } from 'node:child_process';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

/** OAuth for a named operator identity; never falls back to ambient ADC or prints tokens. */
export function namedGcloudAuth(configuration, { runner = execFileSync } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(configuration ?? '')) throw new Error('Select an authorized gcloud configuration');
  const projectId = 'lociar-2f38c';
  const client = new OAuth2Client();
  client.refreshHandler = async () => {
    const token = runner('gcloud', [`--configuration=${configuration}`, `--project=${projectId}`, '--quiet', 'auth', 'print-access-token'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim();
    if (!token) throw new Error('Selected gcloud identity returned no access token');
    return { access_token: token, expiry_date: Date.now() + 25 * 60_000 };
  };
  return new GoogleAuth({ projectId, authClient: client });
}
