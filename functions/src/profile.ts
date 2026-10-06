import { onCall } from 'firebase-functions/v2/https';
import { auth, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, requireCaller } from './core';
import { reasonError } from './errors';
import { handleIsBlocked, isReservedHandle, anyBlocked } from './moderation';
import { handleCooldownRemaining } from './limits';
import { assertAccountNotDeleting } from './profileGuard';

export const HANDLE_PATTERN = /^[a-z0-9_.]{3,30}$/;

export function defaultHandle(luid: string, length = 8): string {
  return `user_${luid.replace(/-/g, '').slice(0, length)}`;
}

/** handles/{handle} → { luid } reserves a username so no two profiles share one. */
export const handleRef = (handle: string) => db.collection('handles').doc(handle);

/** Terms/privacy version the app shows on its consent checkbox, e.g. "2026-10-04". */
export const TERMS_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The consent record to merge into users_private, or null when nothing (valid and newer) was sent.
 * Versions are ISO dates, so string order is date order: an older app build on another device can
 * never replace a newer accepted version (or reset terms_accepted_at).
 */
export function termsConsentUpdate(value: unknown, alreadyAccepted: unknown): { terms_version: string } | null {
  if (typeof value !== 'string' || !TERMS_VERSION_PATTERN.test(value)) return null;
  if (typeof alreadyAccepted === 'string' && TERMS_VERSION_PATTERN.test(alreadyAccepted) && value <= alreadyAccepted) return null;
  return { terms_version: value };
}

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
export const ensureProfile = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const data = (request.data ?? {}) as { handle?: unknown; displayName?: unknown; termsVersion?: unknown };

  // Reject an already accepted deletion before touching custom Auth claims too.
  await db.runTransaction(tx => assertAccountNotDeleting(tx, caller.luid));

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
    await assertAccountNotDeleting(tx, caller.luid);
    const snap = await tx.get(profileRef);
    // Explicit consent (checkbox on the sign-in screen): which terms version was accepted and when.
    // users_private is server-only, so this record cannot be forged by a client write.
    const consent = termsConsentUpdate(data.termsVersion, (await tx.get(privateRef)).data()?.terms_version);
    const consentFields = consent ? { ...consent, terms_accepted_at: FieldValue.serverTimestamp() } : {};
    if (snap.exists) {
      const existing = snap.data()!;
      if (existing.deleted_at) throw new HttpsError('permission-denied', 'Account was deleted');
      // Profiles created before handle reservations existed claim their handle on next sign-in.
      const handle = String(existing.handle ?? '');
      if (HANDLE_PATTERN.test(handle)) {
        const reservation = await tx.get(handleRef(handle));
        if (!reservation.exists) tx.set(handleRef(handle), { luid: caller.luid, created_at: FieldValue.serverTimestamp() });
      }
      tx.set(privateRef, {
        uid: caller.uid, email: caller.email, auth_provider: caller.provider,
        identity_verified: caller.isAppleUser || caller.emailVerified,
        last_seen_at: FieldValue.serverTimestamp(),
        ...consentFields,
      }, { merge: true });
      tx.set(db.collection('account_access').doc(caller.luid), { state: existing.suspended === true ? 'suspended' : 'active' });
      return existing;
    }
    const requested = typeof data.handle === 'string' ? data.handle.trim().toLowerCase() : '';
    const requestedOk = HANDLE_PATTERN.test(requested) && !isReservedHandle(requested) && !handleIsBlocked(requested);
    const candidates = [
      ...(requestedOk ? [requested] : []),
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
      display_name: typeof data.displayName === 'string' && !anyBlocked([data.displayName]) ? data.displayName.trim().slice(0, 60) : null,
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
    tx.set(db.collection('account_access').doc(caller.luid), { state: 'active' });
    tx.set(privateRef, {
      uid: caller.uid, email: caller.email, auth_provider: caller.provider,
      identity_verified: caller.isAppleUser || caller.emailVerified,
      last_seen_at: FieldValue.serverTimestamp(),
      ...consentFields,
    }, { merge: true });
    return { ...created, created_at: null, updated_at: null };
  });

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
export const updateHandle = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  if ((request.data as { userId?: unknown })?.userId !== caller.luid) throw reasonError('permission-denied', 'Profile session changed', 'session_changed');
  const requested = (request.data as { handle?: unknown })?.handle;
  const handle = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!HANDLE_PATTERN.test(handle)) throw new HttpsError('invalid-argument', 'Invalid handle');
  if (isReservedHandle(handle)) throw reasonError('invalid-argument', 'This username is reserved', 'handle_reserved');
  if (handleIsBlocked(handle)) throw reasonError('invalid-argument', 'This username is not allowed', 'handle_not_allowed');

  const profileRef = db.collection('profiles').doc(caller.luid);
  await db.runTransaction(async (tx) => {
    await assertAccountNotDeleting(tx, caller.luid);
    const [profile, reservation] = await Promise.all([tx.get(profileRef), tx.get(handleRef(handle))]);
    if (!profile.exists || profile.data()!.deleted_at) throw reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
    if (profile.data()!.suspended === true) throw reasonError('permission-denied', 'This account cannot publish', 'account_suspended');
    const current = String(profile.data()!.handle ?? '');
    if (current === handle) return;
    const changedAt = profile.data()!.handle_changed_at;
    const remaining = handleCooldownRemaining(changedAt?.toMillis?.(), Date.now());
    if (remaining > 0) throw reasonError('resource-exhausted', 'Username was changed recently', 'handle_cooldown');
    if (!isFree(reservation, caller.luid)) throw reasonError('already-exists', 'Handle is taken', 'handle_taken');
    const previous = current ? await tx.get(handleRef(current)) : null;
    if (previous?.exists && previous.data()!.luid === caller.luid) tx.delete(previous.ref);
    tx.set(handleRef(handle), { luid: caller.luid, created_at: FieldValue.serverTimestamp() });
    tx.update(profileRef, { handle, handle_changed_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
  });
  return { handle };
});
