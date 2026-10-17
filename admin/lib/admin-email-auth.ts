import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebase-admin';
import { accountDeletionStarted } from './account-lifecycle';
import { isKnownRole } from './rbac';
import { writeAudit } from './ops';
import { ValidationError } from './validation';

export const EMAIL_CHALLENGE_COOKIE = '__admin_email_challenge';
export const EMAIL_CODE_SECONDS = 600;
export const EMAIL_SESSION_SECONDS = 8 * 60 * 60;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const codeDigest = (secret: string, code: string) => createHmac('sha256', secret).update(code).digest('hex');
const matches = (a: unknown, b: string) => typeof a === 'string' && /^[a-f0-9]{64}$/.test(a)
  && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : 0;

export type CodeSender = (to: string, code: string, requestId: string) => Promise<void>;

/** Google sends link emails. Short numeric codes use a separately configured server-only sender. */
export async function sendAdminCode(to: string, code: string, requestId: string) {
  const key = process.env.ADMIN_EMAIL_API_KEY, from = process.env.ADMIN_EMAIL_FROM;
  if (!key || !from) throw new EmailDeliveryError();
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
      body: JSON.stringify({ from, to: [to], subject: `${code} — LociAR yönetici giriş kodu`,
        text: `LociAR yönetici giriş kodun: ${code}\n\nBu kod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Giriş istemediysen bu e-postayı yok say.` }),
    });
  } catch { throw new EmailDeliveryError(); }
  // Never log/return a provider response: it can contain the recipient, code or credentials.
  if (!response.ok) throw new EmailDeliveryError();
  const accepted = await response.json().catch(() => null);
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new EmailDeliveryError();
}

export class EmailDeliveryError extends Error {}
export class EmailRateLimitError extends Error {}

async function userForEmail(email: string) {
  try { return await adminAuth().getUserByEmail(email); }
  catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return null;
    throw error;
  }
}

/** Replaces the previous challenge for this address; the verifier exists only in an HttpOnly cookie. */
export async function requestAdminEmailCode(rawEmail: unknown, source: string, send: CodeSender = sendAdminCode, now = Date.now()) {
  if (typeof rawEmail !== 'string' || rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail.trim())) {
    throw new ValidationError('Geçerli bir e-posta adresi yaz.');
  }
  const email = rawEmail.trim().toLowerCase(), address = digest(email), secret = randomBytes(32).toString('hex');
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0'), generation = randomUUID();
  const db = adminDb(), challenge = db.collection('admin_email_challenges').doc(address);
  // Bound lookup/send work too, including requests for unknown addresses. No client-chosen uid.
  const hour = Math.floor(now / 3_600_000);
  const limits = [[`address_${address}_${hour}`, 5], [`source_${digest(source)}_${hour}`, 30], [`global_${hour}`, 300]] as const;
  await db.runTransaction(async tx => {
    const snapshots = await tx.getAll(...limits.map(([id]) => db.collection('admin_email_limits').doc(id)));
    if (snapshots.some((s, i) => Number(s.get('count') ?? 0) >= limits[i][1])) throw new EmailRateLimitError();
    snapshots.forEach(s => tx.set(s.ref, { count: Number(s.get('count') ?? 0) + 1, expires_at: Timestamp.fromMillis((hour + 2) * 3_600_000) }));
  });
  const user = await userForEmail(email);
  const eligible = await db.runTransaction(async tx => {
    const previous = await tx.get(challenge);
    if (millis(previous.get('requested_at')) > now - 60_000) throw new EmailRateLimitError();
    let allowed = false;
    if (user && !user.disabled && !await accountDeletionStarted(user.uid, tx)) {
      const roles = await tx.get(db.collection('admin_role_assignments').where('user_id', '==', user.uid).where('revoked_at', '==', null));
      allowed = roles.docs.some(d => isKnownRole(d.get('role_key')));
    }
    if (user) tx.update(db.collection('admin_email_limits').doc(limits[0][0]), { owner_uid: user.uid });
    tx.set(challenge, { uid: allowed ? user!.uid : null, owner_uid: user?.uid ?? null, generation, verifier_hash: digest(secret), code_hash: codeDigest(secret, code),
      attempts: 0, ready: false, requested_at: Timestamp.fromMillis(now), expires_at: Timestamp.fromMillis(now + EMAIL_CODE_SECONDS * 1000) });
    return allowed;
  });
  if (eligible) {
    try { await send(email, code, generation); }
    catch {
      await db.runTransaction(async tx => {
        const latest = await tx.get(challenge);
        if (latest.get('generation') === generation) tx.update(challenge, { code_hash: null, ready: false });
      });
      throw new EmailDeliveryError();
    }
    await db.runTransaction(async tx => {
      const latest = await tx.get(challenge);
      if (latest.get('generation') === generation) tx.update(challenge, { ready: true });
    });
  }
  // Identical HTTP response/cookie format for non-admin and unknown addresses.
  return `${address}.${secret}`;
}

/** Atomic consumption and session creation make concurrent use of one code succeed at most once. */
export async function verifyAdminEmailCode(challengeCookie: unknown, code: unknown, now = Date.now()) {
  if (typeof challengeCookie !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(challengeCookie)
      || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return null;
  const [address, secret] = challengeCookie.split('.'), db = adminDb();
  const ref = db.collection('admin_email_challenges').doc(address);
  const session = `email1.${randomBytes(32).toString('hex')}`;
  const initial = await ref.get(), uid = initial.get('uid');
  if (typeof uid !== 'string') return null;
  let user;
  try { user = await adminAuth().getUser(uid); } catch { return null; }
  if (user.disabled || !user.email || digest(user.email.toLowerCase()) !== address) return null;
  return db.runTransaction(async tx => {
    const challenge = await tx.get(ref);
    if (challenge.get('uid') !== uid || !matches(challenge.get('verifier_hash'), digest(secret)) || !challenge.get('ready')
        || millis(challenge.get('expires_at')) <= now || Number(challenge.get('attempts')) >= 5 || challenge.get('consumed_at')
        || millis(challenge.get('requested_at')) < Date.parse(user.tokensValidAfterTime ?? '1970-01-01')) return null;
    if (!matches(challenge.get('code_hash'), codeDigest(secret, code))) {
      const attempts = Number(challenge.get('attempts') ?? 0) + 1;
      tx.update(ref, { attempts, ...(attempts >= 5 ? { code_hash: null, ready: false } : {}) });
      return null;
    }
    if (await accountDeletionStarted(uid, tx)) return null;
    const roles = await tx.get(db.collection('admin_role_assignments').where('user_id', '==', uid).where('revoked_at', '==', null));
    if (!roles.docs.some(d => isKnownRole(d.get('role_key')))) return null;
    tx.update(ref, { consumed_at: Timestamp.fromMillis(now), code_hash: null, ready: false });
    tx.create(db.collection('admin_email_sessions').doc(digest(session)), { uid, owner_uid: uid, email: user.email!.toLowerCase(),
      authenticated_at: Timestamp.fromMillis(now), expires_at: Timestamp.fromMillis(now + EMAIL_SESSION_SECONDS * 1000) });
    writeAudit(tx, randomUUID(), { actorId: uid, action: 'admin_sign_in', resourceType: 'admin_session', resourceId: uid,
      after: { method: 'email_code', secondFactor: false }, reason: 'Administrator verified a one-time email code.', permissionKey: 'session.sign_in', riskLevel: 'sensitive' });
    return session;
  });
}

export async function readAdminEmailSession(session: string, now = Date.now()) {
  if (!/^email1\.[a-f0-9]{64}$/.test(session)) return null;
  const stored = await adminDb().collection('admin_email_sessions').doc(digest(session)).get();
  if (!stored.exists || millis(stored.get('expires_at')) <= now || typeof stored.get('uid') !== 'string') return null;
  try {
    const user = await adminAuth().getUser(stored.get('uid'));
    if (user.disabled || user.email?.toLowerCase() !== stored.get('email')
        || millis(stored.get('authenticated_at')) < Date.parse(user.tokensValidAfterTime ?? '1970-01-01')) return null;
    return { uid: user.uid, email: user.email };
  } catch { return null; }
}

export async function revokeAdminEmailSession(session: string) {
  if (/^email1\.[a-f0-9]{64}$/.test(session)) await adminDb().collection('admin_email_sessions').doc(digest(session)).delete();
}
