import Link from 'next/link';
import { requireAdmin } from '../../../lib/admin';
import SignOutButton from './SignOutButton';

const navigation = [
  { href: '/admin/dashboard', label: 'Dashboard', enabled: true },
  { href: '/admin/users', label: 'Users', enabled: true },
  { href: '/admin/posts', label: 'Posts & media', enabled: true },
  { href: '/admin/approvals', label: 'Approvals', enabled: true },
  { href: '/admin/moderation', label: 'Moderation', enabled: true },
  { href: '/admin/avatars', label: 'Profile photos', enabled: true },
  { href: '/admin/anchors', label: 'AR anchors', enabled: true },
  { href: '/admin/places', label: 'Map & places', enabled: true },
  { href: '/admin/zones', label: 'Restricted zones', enabled: true },
  { href: '/admin/analytics', label: 'Analytics', enabled: true },
  { href: '/admin/system', label: 'System health', enabled: true },
  { href: '/admin/audit', label: 'Audit logs', enabled: true },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  return (
    <div className="adminFrame">
      <aside className="sidebar">
        <div className="sidebarBrand"><span className="brandMark small">L</span><span>LociAR</span></div>
        <nav aria-label="Admin navigation">
          {navigation.map(item => item.enabled
            ? <Link key={item.href} href={item.href}>{item.label}</Link>
            : <span className="navPending" key={item.href} title="Planned for the next operations phase">{item.label}<small>Planned</small></span>
          )}
        </nav>
        <div className="sidebarFooter">
          <span>{admin.user.email ?? admin.user.id}</span>
          <small>{admin.roles.join(', ').replaceAll('_', ' ')}</small>
          <small className="securityOk">MFA verified</small>
          <SignOutButton />
        </div>
      </aside>
      <div className="adminContent">
        <header className="topbar">
          <form action="/admin/search" method="get" role="search">
            <input name="q" aria-label="Global search" placeholder="Search users, posts, anchors…" />
          </form>
          <span className="envBadge">Production controls</span>
        </header>
        {children}
      </div>
    </div>
  );
}
