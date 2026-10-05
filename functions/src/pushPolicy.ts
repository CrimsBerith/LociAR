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
