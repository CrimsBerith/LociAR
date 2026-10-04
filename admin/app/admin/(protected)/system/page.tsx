import { requireAdmin } from '../../../../lib/admin';
import { adminAuth, adminBucket, adminDb, projectId } from '../../../../lib/firebase-admin';
import AdminDecision from '../AdminDecision';

export const dynamic = 'force-dynamic';

type Health = { name: string; ok: boolean; detail: string };

async function check(name: string, run: () => Promise<string>): Promise<Health> {
  try {
    return { name, ok: true, detail: await run() };
  } catch {
    return { name, ok: false, detail: 'Check failed' };
  }
}

export default async function SystemPage() {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  const flags = (await adminDb().collection('system').doc('flags').get().catch(() => null))?.data() ?? {};
  const killSwitchOn = flags.kill_switch === true;
  const canToggle = admin.permissions.has('system.kill_switch');
  const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
  const functionNames = ['createPost', 'deleteAccount', 'ensureProfile'];
  const checks = await Promise.all([
    check('Firestore', async () => { await adminDb().collection('profiles').limit(1).get(); return 'Service query passed'; }),
    check('Auth', async () => { await adminAuth().listUsers(1); return 'Admin API reachable'; }),
    check('Storage', async () => { const [exists] = await adminBucket().exists(); if (!exists) throw new Error(); return 'Default bucket reachable'; }),
    ...functionNames.map(name => check(`Cloud Function · ${name}`, async () => {
      const response = await fetch(`https://${region}-${projectId()}.cloudfunctions.net/${name}`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (response.status >= 500) throw new Error();
      return `Reachable over HTTPS · ${response.status}`;
    })),
  ]);

  return (
    <main className="page">
      <div className="pageHeading"><div><p className="eyebrow">Production diagnostics</p><h1>System health</h1></div><p className="muted">Reachability checks only. Credentials, tokens and secret values are never rendered.</p></div>
      <section className="panel">
        <h2>Emergency stop</h2>
        <p className={killSwitchOn ? 'healthState down' : 'healthState'}>{killSwitchOn ? `ON — ${String(flags.kill_reason ?? '')}` : 'Off'}</p>
        <p className="muted">
          While on, new posts, ARCore tokens, Cloud Anchor registration, avatar uploads and push registration are refused.
          Viewing, reporting, blocking and account deletion keep working.
        </p>
        {canToggle ? (
          <AdminDecision
            endpoint="/api/admin/v1/system/kill-switch"
            actions={killSwitchOn
              ? [{ label: 'Turn off', body: { enabled: false }, className: 'secondaryButton' }]
              : [{ label: 'Turn on', body: { enabled: true }, className: 'dangerButton' }]}
          />
        ) : <p className="muted">Requires the system.kill_switch permission.</p>}
      </section>
      <section className="healthGrid">
        {checks.map(item => (
          <article className="panel healthCard" key={item.name}><span className={`healthState ${item.ok ? '' : 'down'}`}>{item.ok ? 'Operational' : 'Failed'}</span><strong>{item.name}</strong><small className="muted">{item.detail}</small></article>
        ))}
      </section>
    </main>
  );
}
