import 'server-only';
import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, localeFor, resolveLang, translator, type Lang } from './i18n';

/** Language of the current admin request: the saved choice, else the browser's preferred language. */
export async function getI18n(): Promise<{ lang: Lang; locale: string; t: ReturnType<typeof translator> }> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value, headerStore.get('accept-language'));
  return { lang, locale: localeFor(lang), t: translator(lang) };
}
