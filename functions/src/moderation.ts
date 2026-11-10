/**
 * Multilingual lexical filter for user text (Guideline 1.2 "method for filtering objectionable material").
 * Matching is on normalised whole words so ordinary text is not caught by substrings.
 * Human review of reports remains the primary moderation path.
 */
const BLOCKED_TERMS = [
  // Turkish
  'amk', 'aq', 'orospu', 'orospuçocuğu', 'piç', 'yarrak', 'yarak', 'sikerim', 'siktir', 'sikik', 'amcık', 'göt', 'götveren',
  'ibne', 'kahpe', 'pezevenk', 'gavat',
  // English
  'fuck', 'fucking', 'motherfucker', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut',
  // Spanish, French, Portuguese, German and Russian; whole words avoid substring collisions.
  'gilipollas', 'joder', 'mierda', 'puta', 'coño',
  'connard', 'connasse', 'putain', 'merde', 'enculé', 'encule', 'salope',
  'caralho', 'porra', 'foda', 'foder', 'fodase', 'merda',
  'arschloch', 'scheiße', 'scheisse', 'hurensohn', 'wichser', 'fotze',
  'блядь', 'блять', 'сука', 'пизда', 'пиздец', 'хуй', 'хуйня', 'ебать', 'ебаный',
  // Combining marks are part of these words, not token separators.
  'चूतिया', 'चूतिये', 'भोसड़ीके', 'मादरचोद', 'बहनचोद',
  'মাদারচোদ', 'চোদনা', 'খানকি', 'বোকাচোদা', 'চুতিয়া',
  'كسمك', 'كسامك', 'شرموطة', 'شرموط', 'قحبة',

];

const TERMS = new Set(BLOCKED_TERMS.map(normalize));

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Cf}|\u0307/gu, '')
    .replaceAll('\u0131', 'i')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replaceAll('3', 'e')
    .replaceAll('4', 'a')
    .replaceAll(/[$5]/g, 's');
}

export function containsBlockedTerm(text: string): boolean {
  const clean = normalize(text);
  const words = clean.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  if (words.some((word) => TERMS.has(word))) { return true; }
  // High-confidence CJK phrases also occur without spaces. Avoid Japanese conditional forms.
  if (/操你妈|傻逼|狗日的|クソ野郎|糞野郎|(?:死ね|くたばれ)(?![ぁ-ゖァ-ヺー])/u.test(clean)) { return true; }
  // 'retard' is ordinary French for delay; only its English directed-insult context is blocked.
  if (/\b(?:you(?: are)?(?: a)?|fucking)\s+retard\b/u.test(clean)) { return true; }
  // Only contiguous single-letter runs: unrelated initials must not form a new insult.
  let run = '';
  for (const word of [...words, 'end']) {
    if ([...word].length === 1) { run += word; }
    else { if ([...TERMS].some(term => term.length >= 4 && run.includes(term))) { return true; } run = ''; }
  }
  return false;
}

/** Names nobody may claim: they could be mistaken for the team or for system accounts. */
export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'moderator', 'mod', 'staff', 'team',
  'lociar', 'loci', 'loci.ar', 'official', 'security', 'abuse', 'privacy', 'legal', 'apple', 'google', 'null', 'undefined',
]);

export function isReservedHandle(handle: string): boolean {
  const h = handle.toLowerCase();
  return RESERVED_HANDLES.has(h) || RESERVED_HANDLES.has(h.replace(/[._]/g, ''));
}

/** True when any of the texts trips the blocklist (handles are matched with separators removed too). */
export function anyBlocked(texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => typeof t === 'string' && t.length > 0 && containsBlockedTerm(t));
}

/** User-authored text never carries URLs; GIPHY URLs are constructed separately by the server. */
export function containsURL(text: string): boolean {
  const clean = text.normalize('NFKC').replace(/\p{Cf}/gu, '');
  return clean.includes('://') || /www\.|(?:mailto|javascript|data|tel):|[\p{L}\p{N}-]{1,253}\.\p{L}{2,63}(?:\b|$)/iu.test(clean);
}

export function handleIsBlocked(handle: string): boolean {
  return containsBlockedTerm(handle.replace(/[._]+/g, ' ')) || containsBlockedTerm(handle.replace(/[._]+/g, ''));
}
