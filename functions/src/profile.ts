import { onCall } from 'firebase-functions/v2/https';
import { auth, db, FieldValue, HttpsError, requireCaller } from './core';

export const HANDLE_PATTERN = /^[a-z0-9_.]{3,30}$/;

export function defaultHandle(luid: string): string {
  return `user_${luid.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Called by the app after every sign-in. Guarantees:
 *  - the `luid` custom claim exists (Security Rules depend on it),
 *  - a public profile document exists at profiles/{luid},
 *  - a private record at users_private/{luid} maps back to the Firebase UID.
 * Returns `claimsUpdated: true` when the client must force-refresh its ID token.
 */
export const ensureProfile = onCall(async (request) => {
  const caller = requireCaller(request);
  const data = (request.data ?? {}) as { handle?: unknown; displayName?: unknown };

  const userRecord = await auth.getUser(caller.uid);
  const claims = { ...(userRecord.customClaims ?? {}) } as Record<string, unknown>;
  let claimsUpdated = false;
  if (claims.luid !== caller.luid) {
    claims.luid = caller.luid;
    await auth.setCustomUserClaims(caller.uid, claims);
    claimsUpdated = true;
  }

  const profileRef = db.collection('profiles').doc(caller.luid);
  const privateRef = db.collection('users_private').doc(caller.luid);

  const profile = await db.runTransaction(async (tx) => {
    const snap = await tx.get(profileRef);
    if (snap.exists) {
      const existing = snap.data()!;
      if (existing.deleted_at) throw new HttpsError('permission-denied', 'Account was deleted');
      return existing;
    }
    const requested = typeof data.handle === 'string' ? data.handle.trim().toLowerCase() : '';
    const handle = HANDLE_PATTERN.test(requested) ? requested : defaultHandle(caller.luid);
    const created = {
      id: caller.luid,
      handle,
      display_name: typeof data.displayName === 'string' ? data.displayName.slice(0, 80) : null,
      avatar_url: null,
      bio: null,
      follower_count: 0,
      following_count: 0,
      public_post_count: 0,
      suspended: false,
      deleted_at: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    tx.set(profileRef, created);
    return { ...created, created_at: null, updated_at: null };
  });

  await privateRef.set(
    {
      uid: caller.uid,
      email: caller.email,
      auth_provider: caller.provider,
      identity_verified: caller.isAppleUser || caller.emailVerified,
      last_seen_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    luid: caller.luid,
    handle: String(profile.handle),
    avatarURL: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
    claimsUpdated,
  };
});
