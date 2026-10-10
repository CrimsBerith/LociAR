import { createHash } from 'node:crypto';

export const MAX_PUSH_DEVICES = 10;
export const PUSH_TOKEN_RETENTION_DAYS = 30;
export const PUSH_RECEIPT_RETENTION_DAYS = 180;
export const pushTokenId = (token: string): string => createHash('sha256').update(token).digest('hex');
export const pushDeliveryId = (activityId: string, tokenId: string): string => pushTokenId(`${activityId}:${tokenId}`);

export function validPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^[\x21-\x7e]{20,4096}$/.test(token);
}

export function invalidPushTokenCode(code: unknown): boolean {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}

const bodies: Record<string, [string, string, string]> = {
  en: ['Someone liked your post.', 'Someone commented on your post.', 'You have a new follower.'],
  tr: ['Postun beğenildi.', 'Postuna yorum yapıldı.', 'Yeni bir takipçin var.'],
  'zh-Hans': ['有人赞了你的帖子。', '有人评论了你的帖子。', '你有一位新关注者。'],
  hi: ['किसी ने आपकी पोस्ट पसंद की।', 'किसी ने आपकी पोस्ट पर टिप्पणी की।', 'आपका एक नया फ़ॉलोअर है।'],
  es: ['A alguien le gustó tu publicación.', 'Alguien comentó tu publicación.', 'Tienes un nuevo seguidor.'],
  fr: ['Quelqu’un a aimé votre publication.', 'Quelqu’un a commenté votre publication.', 'Vous avez un nouvel abonné.'],
  ar: ['أعجب شخص بمنشورك.', 'علّق شخص على منشورك.', 'لديك متابع جديد.'],
  bn: ['কেউ আপনার পোস্ট পছন্দ করেছেন।', 'কেউ আপনার পোস্টে মন্তব্য করেছেন।', 'আপনার একজন নতুন অনুসরণকারী আছে।'],
  pt: ['Alguém gostou da sua publicação.', 'Alguém comentou na sua publicação.', 'Você tem um novo seguidor.'],
  ru: ['Кому-то понравилась ваша публикация.', 'Кто-то прокомментировал вашу публикацию.', 'У вас новый подписчик.'],
  de: ['Jemand hat deinen Beitrag mit „Gefällt mir“ markiert.', 'Jemand hat deinen Beitrag kommentiert.', 'Du hast einen neuen Follower.'],
  ja: ['あなたの投稿に「いいね」が付きました。', 'あなたの投稿にコメントが付きました。', '新しいフォロワーがいます。'],
};

export function pushLocale(value: unknown): string {
  if (typeof value !== 'string') return 'en';
  const language = value.split(/[-_]/)[0].toLowerCase();
  const normalized = language === 'zh' ? 'zh-Hans' : language;
  return Object.hasOwn(bodies, normalized) ? normalized : 'en';
}

/** Lock-screen text contains no handle, comment text, post title or location. */
export function pushBody(kind: string, locale: unknown): string | null {
  const index = ['like', 'comment', 'follow'].indexOf(kind);
  return index < 0 ? null : bodies[pushLocale(locale)][index];
}

/** Engagement pushes (likes, comments, follows) per recipient and UTC day. Post approval is exempt. */
export const PUSH_DAILY_LIMIT = 3;
export const PUSH_QUOTA_RETENTION_DAYS = 2;
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const pushQuotaId = (luid: string, ms: number): string => `${luid}_${utcDay(ms)}`;

/**
 * Daily cap decision for one activity. Counting is per activity, not per device: further devices
 * of an activity already counted today are allowed without using another slot.
 */
export function pushQuotaDecision(
  stored: { count?: unknown; activity_ids?: unknown } | undefined,
  activityId: string,
  limit = PUSH_DAILY_LIMIT,
): { allow: boolean; next?: { count: number; activity_ids: string[] } } {
  const ids = Array.isArray(stored?.activity_ids) ? stored.activity_ids.filter((id): id is string => typeof id === 'string') : [];
  if (ids.includes(activityId)) return { allow: true };
  const count = typeof stored?.count === 'number' && Number.isFinite(stored.count) ? stored.count : ids.length;
  if (count >= limit) return { allow: false };
  return { allow: true, next: { count: count + 1, activity_ids: [...ids, activityId] } };
}

const approvedBodies: Record<string, string> = {
  en: 'Your post was approved and is now live.',
  tr: 'Postun onaylandı ve yayında.',
  'zh-Hans': '你的帖子已通过审核并已发布。',
  hi: 'आपकी पोस्ट स्वीकृत हो गई है और अब लाइव है।',
  es: 'Tu publicación fue aprobada y ya está visible.',
  fr: 'Votre publication a été approuvée et est en ligne.',
  ar: 'تمت الموافقة على منشورك وأصبح ظاهرًا الآن.',
  bn: 'আপনার পোস্ট অনুমোদিত হয়েছে এবং এখন লাইভ।',
  pt: 'Sua publicação foi aprovada e já está no ar.',
  ru: 'Ваша публикация одобрена и опубликована.',
  de: 'Dein Beitrag wurde freigegeben und ist jetzt sichtbar.',
  ja: '投稿が承認され、公開されました。',
};

/** Lock-screen text for an approved post: no caption, handle or location. */
export function postApprovedBody(locale: unknown): string {
  return approvedBodies[pushLocale(locale)] ?? approvedBodies.en;
}
