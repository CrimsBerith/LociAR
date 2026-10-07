import { requireAdmin } from '../../../../lib/admin';
import { recordPersonalDataRead } from '../../../../lib/ops';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import InviteUserForm from './InviteUserForm';
import CreateUserForm from './CreateUserForm';
import AdminDecision from '../AdminDecision';
import PageNavigation from '../PageNavigation';
import { InvalidCursorError, pageCursors, readDocumentPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const admin = await requireAdmin({ permission: 'users.read' });
  const canManageAdmins = admin.permissions.has('admin_users.write');
  const canSuspend = admin.permissions.has('users.suspend');
  const params = await searchParams;
  const q = textParameter(params.q, 40);
  const term = q.toLowerCase().replace(/^@/, '');
  let page: DocumentPage = { documents: [], next: null, previous: null };
  const db = adminDb();
  let users: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  let invalid = false;
  try {
    const query = term ? db.collection('profiles').where('handle', '>=', term).where('handle', '<=', term + '\uf8ff') : db.collection('profiles');
    page = await readDocumentPage(query, { field: term ? 'handle' : 'created_at', direction: term ? 'asc' : 'desc', scope: JSON.stringify(['users', term]), cursors: pageCursors(params), size: 50 });
    users = page.documents.map(d => ({ ...d.data(), id: d.id }));
    const privateDocs = users.length ? await db.getAll(...users.map(u => db.collection('users_private').doc(u.id))) : [];
    const byId = new Map(privateDocs.map(d => [d.id, d.data() ?? {}]));
    users = users.map(u => ({ ...u, ...(byId.get(u.id) ?? {}), id: u.id }));
    await recordPersonalDataRead(admin.user.id, 'users', users.length);
  } catch (error) {
    failed = true;
    invalid = error instanceof InvalidCursorError;
  }

  let rolesPage: DocumentPage = { documents: [], next: null, previous: null };
  let rolesFailed = false;
  if (canManageAdmins) {
    try {
      rolesPage = await readDocumentPage(db.collection('admin_role_assignments').where('revoked_at', '==', null),
        { field: 'role_key', direction: 'asc', scope: 'active-admin-roles', cursors: pageCursors(params, 'roles'), size: 50 });
    } catch { rolesFailed = true; }
  }

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Identity & enforcement</p><h1>Users</h1></div>
        <InviteUserForm />
      </div>
      {admin.permissions.has('users.create') ? <CreateUserForm /> : null}
      <section className="panel" aria-label="User profiles">
        <div className="panelHeader">
          <form method="get" className="inlineSearch">
            <input name="q" defaultValue={q} placeholder="Search by handle prefix" aria-label="Search users by handle" />
            <button>Search</button>
          </form>
        </div>
        {failed ? <p className="emptyState">{invalid ? <>Invalid page link. <a href={`/admin/users?${new URLSearchParams({ q })}`}>Return to the first page.</a></> : 'User data could not be loaded.'}</p> : (
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
        {!failed ? <PageNavigation path="/admin/users" parameters={{ q }} next={page.next} previous={page.previous} /> : null}
      </section>
      {canManageAdmins ? <section className="panel" aria-label="Administrator roles">
        <div className="panelHeader"><h2>Admin roles</h2></div>
        {rolesFailed ? <p className="emptyState">Admin roles could not be loaded. <a href="/admin/users">Return to the first page.</a></p> : <>
          {rolesPage.documents.length === 0 ? <p className="emptyState">No active admin roles.</p> : rolesPage.documents.map(doc => {
            const role = doc.data();
            return <div className="dataRow user" key={doc.id}>
              <span><b>{String(role.email ?? role.user_id)}</b><small>{String(role.user_id)}</small></span>
              <span>{String(role.role_key)}</span>
              <span>{new Date(iso(role.created_at ?? role.granted_at)).toLocaleDateString('en-US')}</span><span />
              <AdminDecision endpoint={`/api/admin/v1/roles/${doc.id}/revoke`} actions={[{ label: 'Revoke', body: {}, className: 'dangerButton' }]} />
            </div>;
          })}
          <PageNavigation path="/admin/users" parameters={{ q }} prefix="roles" next={rolesPage.next} previous={rolesPage.previous} />
        </>}
      </section> : null}
    </section>
  );
}
