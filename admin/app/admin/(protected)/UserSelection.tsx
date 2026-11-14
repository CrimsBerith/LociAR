'use client';
import { useEffect, useState } from 'react';
import { useT } from '../I18nProvider';

const KEY = 'lociar-admin-notify-selection', EVENT = 'lociar-admin-notify-selection';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="recipientIds"]')];

/** Users picked for a notification; kept in this tab so the choice survives paging and searching. */
export function readSelection(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && UUID.test(id)) : [];
  } catch { return []; }
}
export function writeSelection(ids: Iterable<string>) {
  try { sessionStorage.setItem(KEY, JSON.stringify([...new Set(ids)].sort((a, b) => (a < b ? -1 : Number(a > b))))); } catch { /* storage unavailable: selection lasts until reload */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useSelectedUsers(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(readSelection());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return ids;
}

export default function UserSelectionControls() {
  const t = useT(), ids = useSelectedUsers();
  useEffect(() => {
    const apply = () => { const selected = new Set(readSelection()); for (const box of boxes()) box.checked = selected.has(box.value); };
    const onChange = (event: Event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement) || box.name !== 'recipientIds') return;
      const next = new Set(readSelection());
      if (box.checked) next.add(box.value); else next.delete(box.value);
      writeSelection(next);
    };
    apply();
    document.addEventListener('change', onChange);
    window.addEventListener(EVENT, apply);
    // A new page of users arrives without reloading this component: re-tick what is already selected.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener('change', onChange); window.removeEventListener(EVENT, apply); observer.disconnect(); };
  }, []);
  return <div className="inlineSearch" role="group" aria-label={t('User selection for notifications')}>
    <button type="button" className="secondaryButton" onClick={() => writeSelection([...readSelection(), ...boxes().filter(box => box.dataset.notify === 'on').map(box => box.value)])}>{t('Select all with notifications on (this page)')}</button>
    <button type="button" className="secondaryButton" onClick={() => writeSelection([])} disabled={ids.length === 0}>{t('Clear selection')}</button>
    <output>{t('{count} users selected', { count: ids.length })}</output>
  </div>;
}
