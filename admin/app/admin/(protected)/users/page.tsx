import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import InviteUserForm from './InviteUserForm';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin({ permission: 'users.read' });
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
  } catch {
    failed = true;
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
            <div className="dataRow user header"><span>User</span><span>Identity</span><span>Provider</span><span>Created</span></div>
            {users.length === 0 ? <p className="emptyState">No matching users.</p> : users.map(user => (
              <div className="dataRow user" key={user.id}>
                <span><b>@{String(user.handle)}</b><small>{user.id}</small></span>
                <span>{user.suspended ? 'Suspended' : user.identity_verified ? 'Verified' : 'Unverified'}</span>
                <span>{String(user.auth_provider ?? 'unknown')}</span>
                <span>{new Date(iso(user.created_at)).toLocaleDateString('en-US')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
