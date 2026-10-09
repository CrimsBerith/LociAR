import { randomInt } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, logEvent, requireCaller } from './core';
import { reasonError } from './errors';

/**
 * Beta invite codes (growth plan 2.1). Server-authoritative like every other write:
 *  - invites/{CODE}: { code, creator_id, created_at, redeemed_by, redeemed_at }, single use;
 *  - users_private/{luid}: invites_created, invite_redeemed_at, invited_by, invite_exempt.
 * Publishing is gated only while LOCIAR_INVITE_REQUIRED=true, so App Review and the closed beta
 * can be switched independently. Mark the App Review demo account `invite_exempt: true`.
 */
export const INVITE_REQUIRED = process.env.LOCIAR_INVITE_REQUIRED === 'true';
export const INVITES_PER_USER = 3;
export const MAX_FAILED_REDEEMS_PER_HOUR = 10;
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
// No 0/O/1/I, so codes can be read aloud or typed from a screenshot.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function generateInviteCode(rand: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return code;
}

/** Upper-cases and strips spaces/hyphens; returns null when the result is not a valid code. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

/** 'invite_required' when publishing is gated and the user neither redeemed a code nor is exempt. */
export function inviteGate(
  userPrivate: FirebaseFirestore.DocumentData | undefined,
  required: boolean,
): 'invite_required' | null {
  if (!required) return null;
  if (userPrivate?.invite_exempt === true || userPrivate?.invite_redeemed_at != null) return null;
  return 'invite_required';
}

type AttemptState = { windowStart: number; count: number };

/** Failed-redeem counter per user and hour. */
export function attemptState(stored: { window_start?: number; count?: number } | undefined, now: number): AttemptState {
  const windowStart = typeof stored?.window_start === 'number' ? stored.window_start : 0;
  if (!stored || now - windowStart >= ATTEMPT_WINDOW_MS) return { windowStart: now, count: 0 };
  return { windowStart, count: typeof stored.count === 'number' ? stored.count : 0 };
}

const attemptsAllowed = (state: AttemptState) => state.count < MAX_FAILED_REDEEMS_PER_HOUR;

async function requireActiveProfile(luid: string, tx: FirebaseFirestore.Transaction) {
  const profile = await tx.get(db.collection('profiles').doc(luid));
  if (!profile.exists || profile.data()!.deleted_at) {
    throw reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
  }
  if (profile.data()!.suspended === true) throw reasonError('permission-denied', 'This account cannot publish', 'account_suspended');
}

/** Creates the caller's remaining invite codes (3 per user, ever) and returns all of them. */
export const createInvites = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  if (!identityVerified(caller)) {
    throw reasonError('permission-denied', 'A verified Apple or email identity is required', 'identity_unverified');
  }
  const privateRef = db.collection('users_private').doc(caller.luid);

  await db.runTransaction(async (tx) => {
    await requireActiveProfile(caller.luid, tx);
    const priv = await tx.get(privateRef);
    // Only people who got in themselves can invite others.
    if (inviteGate(priv.data(), INVITE_REQUIRED)) {
      throw reasonError('permission-denied', 'An invite code is required', 'invite_required');
    }
    const created = Number(priv.data()?.invites_created ?? 0);
    const missing = Math.max(0, INVITES_PER_USER - created);
    if (missing === 0) return;
    const codes = Array.from({ length: missing }, () => generateInviteCode());
    const refs = codes.map((code) => db.collection('invites').doc(code));
    const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (existing.some((snap) => snap.exists)) throw new HttpsError('aborted', 'Could not allocate invite codes; retry');
    codes.forEach((code, i) => tx.set(refs[i], {
      code, creator_id: caller.luid, created_at: FieldValue.serverTimestamp(), redeemed_by: null, redeemed_at: null,
    }));
    tx.set(privateRef, { invites_created: created + missing }, { merge: true });
  });

  const snap = await db.collection('invites').where('creator_id', '==', caller.luid).get();
  return { invites: snap.docs.map((d) => ({ code: String(d.id), redeemed: d.get('redeemed_by') != null })) };
});

/** Redeems a code once for the caller; repeating it after success is a no-op. */
export const redeemInvite = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const code = normalizeInviteCode((request.data as { code?: unknown } | null)?.code);
  if (!code) throw reasonError('invalid-argument', 'Invalid invite code', 'invite_invalid');

  const attemptsRef = db.collection('invite_attempts').doc(caller.luid);
  const now = Date.now();
  const before = attemptState((await attemptsRef.get()).data() as { window_start?: number; count?: number } | undefined, now);
  if (!attemptsAllowed(before)) throw reasonError('resource-exhausted', 'Too many invalid codes; try again later', 'rate_limited');

  const privateRef = db.collection('users_private').doc(caller.luid);
  const inviteRef = db.collection('invites').doc(code);
  try {
    const result = await db.runTransaction(async (tx) => {
      await requireActiveProfile(caller.luid, tx);
      const [invite, priv] = await Promise.all([tx.get(inviteRef), tx.get(privateRef)]);
      if (priv.data()?.invite_redeemed_at != null) return { ok: true, alreadyRedeemed: true };
      // One reason for unknown, used and own codes, so the response is not an oracle.
      if (!invite.exists || invite.get('redeemed_by') != null || invite.get('creator_id') === caller.luid) {
        throw reasonError('failed-precondition', 'Invalid invite code', 'invite_invalid');
      }
      tx.update(inviteRef, { redeemed_by: caller.luid, redeemed_at: FieldValue.serverTimestamp() });
      tx.set(privateRef, { invite_redeemed_at: FieldValue.serverTimestamp(), invited_by: invite.get('creator_id') }, { merge: true });
      return { ok: true, alreadyRedeemed: false };
    });
    // Funnel event for the admin analytics page; never blocks the redeem.
    if (!result.alreadyRedeemed) await logEvent({ userId: caller.luid, name: 'invite_redeemed' }).catch(() => undefined);
    return result;
  } catch (error) {
    const reason = (error as { details?: { reason?: string } }).details?.reason;
    if (reason === 'invite_invalid') {
      await attemptsRef.set({ owner_luid: caller.luid, window_start: before.windowStart, count: before.count + 1 });
    }
    throw error;
  }
});
