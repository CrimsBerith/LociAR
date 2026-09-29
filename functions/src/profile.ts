import { onCall } from 'firebase-functions/v2/https';
import { auth, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, requireCaller } from './core';
import { reasonError } from './errors';

export const HANDLE_PATTERN = /^[a-z0-9_.]{3,30}$/;

export function defaultHandle(luid: string, length = 8): string {
  return `user_${luid.replace(/-/g, '').slice(0, length)}`;
}

/** handles/{handle} → { luid } reserves a username so no two profiles share one. */
export const handleRef = (handle: string) => db.collection('handles').doc(handle);

function isFree(snap: FirebaseFirestore.DocumentSnapshot, luid: string): boolean {
  return !snap.exists || snap.data()!.luid === luid;
}

/**
 * Called by the app after every sign-in. Guarantees:
 *  - the `luid` custom claim exists (Security Rules depend on it),
 *  - a public profile document exists at profiles/{luid},
 *  - a private record at users_private/{luid} maps back to the Firebase UID.
 * Returns `claimsUpdated: true` when the client must force-refresh its ID token.
 */
export const ensureProfile = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
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
      // Profiles created before handle reservations existed claim their handle on next sign-in.
      const handle = String(existing.handle ?? '');
      if (HANDLE_PATTERN.test(handle)) {
        const reservation = await tx.get(handleRef(handle));
        if (!reservation.exists) tx.set(handleRef(handle), { luid: caller.luid, created_at: FieldValue.serverTimestamp() });
      }
      return existing;
    }
    const requested = typeof data.handle === 'string' ? data.handle.trim().toLowerCase() : '';
    const candidates = [
      ...(HANDLE_PATTERN.test(requested) ? [requested] : []),
      defaultHandle(caller.luid),
      defaultHandle(caller.luid, 12),
      defaultHandle(caller.luid, 25),
    ];
    const reservations = await Promise.all(candidates.map((h) => tx.get(handleRef(h))));
    const index = reservations.findIndex((r) => isFree(r, caller.luid));
    if (index < 0) throw new HttpsError('aborted', 'Could not reserve a username; retry');
    const handle = candidates[index];
    tx.set(handleRef(handle), { luid: caller.luid, created_at: FieldValue.serverTimestamp() });
    const created = {
      id: caller.luid,
      handle,
      display_name: typeof data.displayName === 'string' ? data.displayName.slice(0, 80) : null,
      avatar_url: null,
      avatar_preset: null,
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
    avatarPreset: typeof profile.avatar_preset === 'string' ? profile.avatar_preset : null,
    claimsUpdated,
  };
});

/**
 * Changes the caller's username. Reservation and profile update happen in one transaction, so
 * two users can never end up with the same handle. Denormalised copies are updated by
 * onProfileUpdated.
 */
export const updateHandle = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = requireCaller(request);
  const requested = (request.data as { handle?: unknown })?.handle;
  const handle = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!HANDLE_PATTERN.test(handle)) throw new HttpsError('invalid-argument', 'Invalid handle');

  const profileRef = db.collection('profiles').doc(caller.luid);
  await db.runTransaction(async (tx) => {
    const [profile, reservation] = await Promise.all([tx.get(profileRef), tx.get(handleRef(handle))]);
    if (!profile.exists || profile.data()!.deleted_at) throw reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
    if (profile.data()!.suspended === true) throw reasonError('permission-denied', 'This account cannot publish', 'account_suspended');
    const current = String(profile.data()!.handle ?? '');
    if (current === handle) return;
    if (!isFree(reservation, caller.luid)) throw reasonError('already-exists', 'Handle is taken', 'handle_taken');
    const previous = current ? await tx.get(handleRef(current)) : null;
    if (previous?.exists && previous.data()!.luid === caller.luid) tx.delete(previous.ref);
    tx.set(handleRef(handle), { luid: caller.luid, created_at: FieldValue.serverTimestamp() });
    tx.update(profileRef, { handle, updated_at: FieldValue.serverTimestamp() });
  });
  return { handle };
});
