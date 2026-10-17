import { requireAdmin } from '../../../lib/admin';
import { getI18n } from '../../../lib/i18n-server';
import SignOutButton from './SignOutButton';
import AdminNav, { type NavGroup } from './AdminNav';
import LanguageSwitcher from '../LanguageSwitcher';

const navigation: NavGroup[] = [
  { label: 'Overview', items: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/analytics', label: 'Analytics' },
  ] },
  { label: 'Content', items: [
    { href: '/admin/posts', label: 'Posts & media' },
    { href: '/admin/place-notes', label: 'Location notes' },
    { href: '/admin/campaigns', label: 'Brand campaigns' },
  ] },
  { label: 'Trust & safety', items: [
    { href: '/admin/moderation', label: 'Moderation' },
    { href: '/admin/approvals', label: 'Approvals' },
    { href: '/admin/avatars', label: 'Profile photos' },
    { href: '/admin/users', label: 'Users' },
  ] },
  { label: 'Spatial', items: [
    { href: '/admin/anchors', label: 'AR anchors' },
    { href: '/admin/places', label: 'Map & places' },
    { href: '/admin/zones', label: 'Restricted zones' },
  ] },
  { label: 'System', items: [
    { href: '/admin/system', label: 'System health' },
    { href: '/admin/audit', label: 'Audit logs' },
  ] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  const { t } = await getI18n();
  const groups = navigation.map(group => ({
    label: t(group.label),
    items: group.items.map(item => ({ ...item, label: t(item.label) })),
  }));
  return (
    <div className="adminFrame">
      <aside className="sidebar">
        <div className="sidebarBrand"><span className="brandMark small">L</span><span>LociAR</span><small>{t('Admin')}</small></div>
        <AdminNav groups={groups} label={t('Admin navigation')} />
        <div className="sidebarFooter">
          <span>{admin.user.email ?? admin.user.id}</span>
          <small>{admin.roles.join(', ').replaceAll('_', ' ')}</small>
          <small className="securityOk">{admin.assuranceLevel === 'email_code' ? t('Email code verified') : t('MFA verified')}</small>
          <div className="sidebarActions"><LanguageSwitcher /><SignOutButton /></div>
        </div>
      </aside>
      <div className="adminContent">
        <header className="topbar">
          <form action="/admin/search" method="get" role="search">
            <input name="q" aria-label={t('Global search')} placeholder={t('Search users, posts, anchors…')} />
          </form>
          <span className="envBadge">{t('Production controls')}</span>
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
