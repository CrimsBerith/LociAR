import { createPrivateKey, sign } from 'node:crypto';

/**
 * Sign in with Apple token revocation done by the server (App Store 5.1.1(v)). Configured with
 * APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID (bundle id) and APPLE_PRIVATE_KEY (the .p8
 * contents, from Secret Manager). Without them the server cannot revoke and relies on the
 * client's attestation (see deleteAccount).
 */
export type AppleConfig = { teamId: string; keyId: string; clientId: string; privateKey: string };

export function appleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const { APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_CLIENT_ID: clientId, APPLE_PRIVATE_KEY: key } = env;
  if (!teamId || !keyId || !clientId || !key) return null;
  return { teamId, keyId, clientId, privateKey: key.replace(/\\n/g, '\n') };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

export function appleClientSecret(config: AppleConfig, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: config.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: config.clientId,
  }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: createPrivateKey(config.privateKey), dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(signature)}`;
}

export type RevokeDeps = { fetchImpl?: typeof fetch; now?: () => number };

/** Exchanges the authorization code for a refresh token and revokes it. Throws on any failure. */
export async function revokeAppleAuthorization(config: AppleConfig, authorizationCode: string, deps: RevokeDeps = {}): Promise<void> {
  const doFetch = deps.fetchImpl ?? fetch;
  const secret = appleClientSecret(config, Math.floor((deps.now?.() ?? Date.now()) / 1000));
  const post = async (path: string, params: Record<string, string>) => {
    const response = await doFetch(`https://appleid.apple.com/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, ...params }).toString(),
    });
    if (!response.ok) throw new Error(`apple_${path}_${response.status}`);
    return response;
  };
  const tokens = (await (await post('token', { code: authorizationCode, grant_type: 'authorization_code' })).json()) as { refresh_token?: string };
  if (!tokens.refresh_token) throw new Error('apple_no_refresh_token');
  await post('revoke', { token: tokens.refresh_token, token_type_hint: 'refresh_token' });
}
