/**
 * Minimal blocklist for comments (Guideline 1.2 "method for filtering objectionable material").
 * Matching is on normalised whole words so ordinary text is not caught by substrings.
 * Human review of reports remains the primary moderation path.
 */
const BLOCKED_TERMS = [
  // Turkish
  'amk', 'aq', 'orospu', 'orospuçocuğu', 'piç', 'yarrak', 'yarak', 'sikerim', 'siktir', 'sikik', 'amcık', 'göt', 'götveren',
  'ibne', 'kahpe', 'pezevenk', 'gavat',
  // English
  'fuck', 'fucking', 'motherfucker', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
];

const TERMS = new Set(BLOCKED_TERMS.map(normalize));

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/\$|5/g, 's');
}

export function containsBlockedTerm(text: string): boolean {
  const words = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((word) => TERMS.has(word))) return true;
  // Catch spaced-out spellings such as "s i k t i r".
  const letters = words.filter((word) => word.length === 1).join('');
  return letters.length >= 3 && [...TERMS].some((term) => term.length >= 4 && letters.includes(term));
}
