import { requireAdmin } from '../../../../lib/admin';
import { adminAuth, adminBucket, adminDb, projectId } from '../../../../lib/firebase-admin';

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
  await requireAdmin({ permission: 'dashboard.read' });
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
      <section className="healthGrid">
        {checks.map(item => (
          <article className="panel healthCard" key={item.name}><span className={`healthState ${item.ok ? '' : 'down'}`}>{item.ok ? 'Operational' : 'Failed'}</span><strong>{item.name}</strong><small className="muted">{item.detail}</small></article>
        ))}
      </section>
    </main>
  );
}
