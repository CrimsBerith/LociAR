'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export type NavGroup = { label: string; items: Array<{ href: string; label: string }> };

/** Sidebar navigation grouped by area; highlights the section the admin is currently in. */
export default function AdminNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  const pathname = usePathname() ?? '';
  const nav = useRef<HTMLElement>(null);
  // Keep the current section visible when the menu is taller than the sidebar.
  useEffect(() => { nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [pathname]);
  return (
    <nav aria-label={label} ref={nav}>
      {groups.map(group => (
        <div className="navGroup" key={group.label}>
          <p className="navGroupLabel">{group.label}</p>
          {group.items.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
