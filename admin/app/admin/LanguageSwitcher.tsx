'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LANG_COOKIE, type Lang } from '../../lib/i18n';
import { useLang, useT } from './I18nProvider';

const OPTIONS: Array<{ value: Lang; label: string; name: string }> = [
  { value: 'tr', label: 'TR', name: 'Türkçe' },
  { value: 'en', label: 'EN', name: 'English' },
];

/** Stores the admin's language for a year and re-renders the current page in it. */
export default function LanguageSwitcher() {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${secure}`;
    document.documentElement.lang = next;
    startTransition(() => router.refresh());
  }

  return (
    <fieldset className="langSwitch" aria-label={t('Language')} aria-busy={pending || undefined}>
      {OPTIONS.map(option => (
        <button key={option.value} type="button" lang={option.value} title={option.name}
          aria-pressed={lang === option.value} onClick={() => choose(option.value)} disabled={pending}>
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
