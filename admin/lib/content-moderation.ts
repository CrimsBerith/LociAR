import { parse } from 'tldts';

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

/**
 * Two-letter TLDs that are also common words (Turkish de/ve/ne/ki/mu/da/az, English in/it/to/is/me…). After a
 * missing space ("tamam.de geldim") they are ordinary text; they count as a link only with a path or more labels.
 */
const AMBIGUOUS_TLDS = new Set([
  'de', 've', 'ne', 'ki', 'mu', 'da', 'az', 'in', 'it', 'to', 'us', 'es', 'no', 'at', 'be', 'is', 'so', 'do', 'my',
  'by', 'am', 'as', 'la', 'el', 'le', 'se', 'me',
]);
/**
 * TLDs that make a bare `name.tld` a link: the classic generic ones and those mostly seen in links. Two-letter
 * country codes (except AMBIGUOUS_TLDS) and IDN TLDs count too. Every other ICANN TLD is also an everyday word
 * (.today, .love, .kim, .moda, .how, .istanbul…): after a missing space ("Geldim.Kim gelecek?") it is ordinary
 * text, so it counts as a link only with a scheme, `www.`, a path or more labels ("a.b.today").
 */
const LINK_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'edu', 'gov', 'mil', 'int', 'name', 'pro', 'mobi',
  'io', 'co', 'app', 'dev', 'ai', 'xyz', 'ly', 'gg', 'tv', 'online', 'site', 'tech', 'рф',
]);
const DOTTED_NAME = /(?<![\p{L}\p{N}.-])((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+)([\p{L}\p{N}-]{2,63})(?![\p{L}\p{N}])(:\d{2,5}|\/\S*|[?#]\w\S*)?/gu;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/u;

/**
 * User-authored text never carries URLs; media URLs are constructed separately by the server.
 * A sentence with a missing space after a full stop ("tamam.sonra görüşürüz") is not a link.
 */
export function containsURL(text: string): boolean {
  const clean = text.normalize('NFKC').replace(/\p{Cf}/gu, '')
    // "name[.]com", "name(dot)com", "name (nokta) com" are the same link.
    .replace(/\s*[[(]\s*(?:\.|dot|nokta)\s*[\])]\s*/giu, '.');
  if (clean.includes('://') || /www\.|(?:mailto|javascript|data|tel):/iu.test(clean) || IPV4.test(clean)) return true;
  for (const match of clean.matchAll(DOTTED_NAME)) {
    const tld = match[2].toLowerCase(), labels = match[1].split('.').length - 1, path = match[3] !== undefined;
    if (path) return true;
    if (AMBIGUOUS_TLDS.has(tld) && labels < 2) continue;
    if (!parse(`${match[1]}${match[2]}`).isIcann) continue;
    const linkTld = LINK_TLDS.has(tld) || tld.startsWith('xn--') || /^[a-z]{2}$/.test(tld);
    if (linkTld || labels >= 2) return true;
  }
  return false;
}

export function handleIsBlocked(handle: string): boolean {
  return containsBlockedTerm(handle.replace(/[._]+/g, ' ')) || containsBlockedTerm(handle.replace(/[._]+/g, ''));
}
