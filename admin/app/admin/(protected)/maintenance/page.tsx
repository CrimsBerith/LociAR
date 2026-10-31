import { requireAdmin } from '../../../../lib/admin';
import { getI18n } from '../../../../lib/i18n-server';
import { readMaintenanceOverview } from '../../../../lib/maintenance';
import AdminDecision from '../AdminDecision';

export const dynamic = 'force-dynamic';

type Overview = Awaited<ReturnType<typeof readMaintenanceOverview>>;
type Task = Overview['tasks'][number];

export default async function MaintenancePage() {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  const { t, locale } = await getI18n();
  const canOperate = admin.permissions.has('system.maintenance');
  const overview: Overview | null = await readMaintenanceOverview().catch(() => null);
  const when = (value: string | null) => value
    ? new Date(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })
    : t('Never');
  const summary = (result: Record<string, number>) => Object.entries(result).map(([key, value]) => `${key} ${value}`).join(' · ');
  const label = (name: string) => overview?.tasks.find(task => task.name === name)?.label ?? name;

  function state(task: Task): { text: string; down: boolean } {
    if (task.running) return { text: t('Running now'), down: false };
    if (task.lastStatus === 'failed') return { text: t('Last run failed'), down: true };
    if (task.paused) return { text: t('Automatic runs paused'), down: true };
    if (task.lastStatus === 'ok') return { text: t('Healthy'), down: false };
    return { text: t('Not run yet'), down: false };
  }

  function requestStatus(status: string) {
    switch (status) {
      case 'queued': return t('Queued');
      case 'running': return t('Running now');
      case 'done': return t('Done');
      case 'failed': return t('Failed');
      case 'busy': return t('Skipped: already running');
      case 'rejected': return t('Rejected');
      default: return status;
    }
  }

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">{t('Production operations')}</p><h1>{t('Maintenance tasks')}</h1></div>
        <p className="muted">{t('Three free Cloud Scheduler jobs run these tasks automatically. Run a task now or pause its automatic runs here; every action needs a reason and is written to the audit log.')}</p>
      </div>
      {overview ? (
        <>
          <section className="panel">
            <div className="panelHeader"><div><p className="eyebrow">{t('Backend tasks')}</p><h2>{t('Status and controls')}</h2></div></div>
            <div className="dataTable">
              <div className="dataRow maintenance header"><span>{t('Task')}</span><span>{t('Status')}</span><span>{t('Last run')}</span><span>{t('Waiting')}</span><span>{t('Actions')}</span></div>
              {overview.tasks.map(task => {
                const current = state(task);
                return (
                  <div className="dataRow maintenance" key={task.name}>
                    <span><b>{t(task.label)}</b><small>{t(task.description)}</small><small>{t(task.schedule)}</small></span>
                    <span>
                      <span className={`healthState ${current.down ? 'down' : ''}`}>{current.text}</span>
                      {task.lastStatus === 'failed' && task.lastCode ? <small>{t('Error code')}: {task.lastCode} · {t('Failures in a row')}: {task.consecutiveFailures}</small> : null}
                      {task.paused ? <small>{t('“Run now” still works while paused.')}</small> : null}
                    </span>
                    <span>
                      <b>{when(task.lastFinishedAt)}</b>
                      {task.lastTrigger ? <small>{task.lastTrigger === 'admin' ? t('Started by an administrator') : t('Automatic')}{task.lastDurationMs === null ? '' : ` · ${Math.round(task.lastDurationMs / 1000)} ${t('s')}`}</small> : null}
                      {Object.keys(task.lastResult).length ? <small>{summary(task.lastResult)}</small> : null}
                    </span>
                    <span><b>{task.backlog ?? '—'}</b></span>
                    <span>
                      {canOperate ? (
                        <>
                          <AdminDecision endpoint="/api/admin/v1/system/maintenance/run" actions={[{ label: 'Run now', body: { task: task.name }, className: 'secondaryButton' }]} />
                          {task.pausable ? (
                            <AdminDecision endpoint="/api/admin/v1/system/maintenance/pause" actions={task.paused
                              ? [{ label: 'Resume automatic runs', body: { task: task.name, paused: false }, className: 'secondaryButton' }]
                              : [{ label: 'Pause automatic runs', body: { task: task.name, paused: true }, className: 'dangerButton' }]} />
                          ) : <small>{t('Cannot be paused: Apple requires accepted account deletions to finish.')}</small>}
                        </>
                      ) : <small>{t('Requires the system.maintenance permission.')}</small>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panelHeader"><div><p className="eyebrow">{t('Audit')}</p><h2>{t('Recent manual runs')}</h2></div></div>
            {overview.requests.length ? (
              <div className="dataTable">
                <div className="dataRow audit header"><span>{t('Task')}</span><span>{t('Status')}</span><span>{t('Requested')}</span><span>{t('Finished')}</span></div>
                {overview.requests.map(request => (
                  <div className="dataRow audit" key={request.id}>
                    <span><b>{t(label(request.task))}</b>{Object.keys(request.result).length ? <small>{summary(request.result)}</small> : null}</span>
                    <span>{requestStatus(request.status)}{request.code ? <small>{request.code}</small> : null}</span>
                    <span>{when(request.createdAt)}</span>
                    <span>{request.finishedAt ? when(request.finishedAt) : '—'}</span>
                  </div>
                ))}
              </div>
            ) : <p className="emptyState">{t('No manual runs yet.')}</p>}
          </section>
        </>
      ) : <section className="panel"><p className="emptyState">{t('Maintenance status could not be read. Retry in a moment.')}</p></section>}
    </section>
  );
}
