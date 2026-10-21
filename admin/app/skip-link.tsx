'use client';

import { useEffect, useRef, type MouseEvent } from 'react';

export default function SkipLink() {
  const stopWaiting = useRef<() => void>(() => {});

  function focusWhenVisible() {
    stopWaiting.current();
    const focus = () => {
      const main = document.getElementById('main');
      if (!main || main.getClientRects().length === 0) return false;
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start' });
      return document.activeElement === main;
    };
    if (focus()) return;
    // A streamed route can still be hidden when the keyboard activates the link.
    const observer = new MutationObserver(() => { if (focus()) stopWaiting.current(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timeout = window.setTimeout(() => stopWaiting.current(), 10_000);
    stopWaiting.current = () => { observer.disconnect(); window.clearTimeout(timeout); };
  }

  useEffect(() => {
    const followHash = () => { if (window.location.hash === '#main') focusWhenVisible(); };
    followHash(); // Native activation before hydration retains the user's intent.
    window.addEventListener('hashchange', followHash);
    return () => { stopWaiting.current(); window.removeEventListener('hashchange', followHash); };
  }, []);

  function focusContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    focusWhenVisible();
  }

  return <a className="skipLink" href="#main" lang="tr" onClick={focusContent}>İçeriğe geç</a>;
}
