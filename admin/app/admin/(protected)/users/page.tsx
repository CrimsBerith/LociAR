import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { recordPersonalDataRead } from '../../../../lib/ops';
import InviteUserForm from './InviteUserForm';
import AdminDecision from '../AdminDecision';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdmin({ permission: 'users.read' });
  const canSuspend = admin.permissions.has('users.suspend');
  const canManageAdmins = admin.permissions.has('admin_users.write');
  const { q = '' } = await searchParams;
  const term = q.trim().toLowerCase().replace(/^@/, '').slice(0, 40);
  const db = adminDb();
  let users: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const query = term
      ? db.collection('profiles').orderBy('handle').startAt(term).endAt(term + '').limit(50)
      : db.collection('profiles').orderBy('created_at', 'desc').limit(50);
    const snap = await query.get();
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const privateDocs = users.length ? await db.getAll(...users.map(u => db.collection('users_private').doc(u.id))) : [];
    const byId = new Map(privateDocs.map(d => [d.id, d.data() ?? {}]));
    users = users.map(u => ({ ...u, ...(byId.get(u.id) ?? {}) }));
    await recordPersonalDataRead(admin.user.id, 'users', term, users.length);
  } catch {
    failed = true;
  }
  let roles: Array<Record<string, unknown> & { id: string }> = [];
  if (canManageAdmins) {
    roles = await db.collection('admin_role_assignments').where('revoked_at', '==', null).limit(100).get()
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch(() => []);
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Identity & enforcement</p><h1>Users</h1></div>
        <InviteUserForm />
      </div>
      <section className="panel">
        <div className="panelHeader">
          <form method="get" className="inlineSearch">
            <input name="q" defaultValue={q} placeholder="Search by handle prefix" aria-label="Search users by handle" />
            <button>Search</button>
          </form>
        </div>
        {failed ? <p className="emptyState">User data could not be loaded.</p> : (
          <div className="dataTable">
            <div className="dataRow user header"><span>User</span><span>Identity</span><span>Provider</span><span>Created</span><span>Enforcement</span></div>
            {users.length === 0 ? <p className="emptyState">No matching users.</p> : users.map(user => (
              <div className="dataRow user" key={user.id}>
                <span><b>@{String(user.handle)}</b><small>{user.id}</small></span>
                <span>{user.suspended ? 'Suspended' : user.identity_verified ? 'Verified' : 'Unverified'}</span>
                <span>{String(user.auth_provider ?? 'unknown')}</span>
                <span>{new Date(iso(user.created_at)).toLocaleDateString('en-US')}</span>
                <span>{canSuspend ? (
                  <AdminDecision
                    endpoint={`/api/admin/v1/users/${user.id}/suspend`}
                    actions={user.suspended
                      ? [{ label: 'Unsuspend', body: { suspended: false }, className: 'secondaryButton' }]
                      : [{ label: 'Suspend', body: { suspended: true }, className: 'dangerButton' }]}
                  />
                ) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {canManageAdmins ? (
        <section className="panel">
          <div className="panelHeader"><h2>Admin roles</h2></div>
          <div className="dataTable">
            <div className="dataRow user header"><span>Admin</span><span>Role</span><span>Granted</span><span></span><span>Revoke</span></div>
            {roles.length === 0 ? <p className="emptyState">No active admin roles.</p> : roles.map(role => (
              <div className="dataRow user" key={role.id}>
                <span><b>{String(role.email ?? role.user_id)}</b><small>{String(role.user_id)}</small></span>
                <span>{String(role.role_key)}</span>
                <span>{new Date(iso(role.created_at ?? role.granted_at)).toLocaleDateString('en-US')}</span>
                <span></span>
                <span>{role.user_id === admin.user.id ? 'You' : (
                  <AdminDecision endpoint={`/api/admin/v1/roles/${role.id}/revoke`} actions={[{ label: 'Revoke', body: {}, className: 'dangerButton' }]} />
                )}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
