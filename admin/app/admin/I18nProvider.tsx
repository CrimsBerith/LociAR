'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { localeFor, translator, type Lang } from '../../lib/i18n';

const LangContext = createContext<Lang>('en');

export function I18nProvider({ lang, children }: Readonly<{ lang: Lang; children: ReactNode }>) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** Translator for client components; keys are the English source strings. */
export function useT() {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}

export function useLocale(): string {
  return localeFor(useLang());
}
