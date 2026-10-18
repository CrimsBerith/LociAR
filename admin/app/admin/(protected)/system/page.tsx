import { requireAdmin } from '../../../../lib/admin';
import { adminAuth, adminBucket, adminDb, projectId } from '../../../../lib/firebase-admin';
import AdminDecision from '../AdminDecision';
import { getI18n } from '../../../../lib/i18n-server';

export const dynamic = 'force-dynamic';

type Health = { name: string; ok: boolean; detail: string };

async function check(name: string, run: () => Promise<string>, failed: string): Promise<Health> {
  try {
    return { name, ok: true, detail: await run() };
  } catch {
    return { name, ok: false, detail: failed };
  }
}

export default async function SystemPage() {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  const { t } = await getI18n();
  const flagSnapshot = await adminDb().collection('system').doc('flags').get().catch(() => null);
  const flagsAvailable = flagSnapshot !== null;
  const flags = flagSnapshot?.data() ?? {};
  const killSwitchOn = flags.kill_switch === true;
  const canToggle = admin.permissions.has('system.kill_switch');
  const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
  const functionNames = ['createPost', 'deleteAccount', 'ensureProfile'];
  const checks = await Promise.all([
    check('Firestore', async () => { await adminDb().collection('profiles').limit(1).get(); return t('Service query passed'); }, t('Check failed')),
    check('Auth', async () => { await adminAuth().listUsers(1); return t('Admin API reachable'); }, t('Check failed')),
    check('Storage', async () => { const [exists] = await adminBucket().exists(); if (!exists) { throw new Error(); } return t('Default bucket reachable'); }, t('Check failed')),
    ...functionNames.map(name => check(`Cloud Function · ${name}`, async () => {
      const response = await fetch(`https://${region}-${projectId()}.cloudfunctions.net/${name}`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (![200, 204, 401, 403, 405].includes(response.status)) { throw new Error(); }
      return `${t('Reachable over HTTPS')} · ${response.status}`;
    }, t('Check failed'))),
  ]);

  return (
    <section className="page">
      <div className="pageHeading"><div><p className="eyebrow">{t('Production diagnostics')}</p><h1>{t('System health')}</h1></div><p className="muted">{t('Reachability checks only. Credentials, tokens and secret values are never rendered.')}</p></div>
      <section className="panel">
        <h2>{t('Emergency stop')}</h2>
        <p className={killSwitchOn ? 'healthState down' : 'healthState'}>{!flagsAvailable ? t('Unknown — service configuration could not be read') : killSwitchOn ? `${t('ON')} — ${String(flags.kill_reason ?? '')}` : t('Off')}</p>
        <p className="muted">
          {t('While on, new posts, ARCore tokens, Cloud Anchor registration, avatar uploads and push registration are refused. Viewing, reporting, blocking and account deletion keep working. Instances observe changes within 15 seconds.')}
        </p>
        {canToggle && flagsAvailable ? (
          <AdminDecision
            endpoint="/api/admin/v1/system/kill-switch"
            actions={killSwitchOn
              ? [{ label: 'Turn off', body: { enabled: false }, className: 'secondaryButton' }]
              : [{ label: 'Turn on', body: { enabled: true }, className: 'dangerButton' }]}
          />
        ) : <p className="muted">{flagsAvailable ? t('Requires the system.kill_switch permission.') : t('Retry after service configuration becomes available.')}</p>}
      </section>
      <section className="healthGrid">
        {checks.map(item => (
          <article className="panel healthCard" key={item.name}><span className={`healthState ${item.ok ? '' : 'down'}`}>{item.ok ? t('Operational') : t('Failed')}</span><strong>{item.name}</strong><small className="muted">{item.detail}</small></article>
        ))}
      </section>
    </section>
  );
}
