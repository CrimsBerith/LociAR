import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { pageCursors, readDocumentPage, type SearchParameters } from '../../../../lib/pagination';
import PageNavigation from '../PageNavigation';
import AdminDecision from '../AdminDecision';
import CampaignForms from './CampaignForms';
import CampaignAudience from './CampaignAudience';
import JourneyEditor, { CodeRedeemForm } from './JourneyEditor';
import { journeyFunnel } from '../../../../lib/campaign-journeys';
import { getI18n } from '../../../../lib/i18n-server';
export const dynamic = 'force-dynamic';

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const admin = await requireAdmin({ permission: 'campaigns.read' }), db = adminDb(), parameters = await searchParams;
  const [brands, campaigns, jobs, assignments] = await Promise.all([
    db.collection('brands').orderBy('created_at', 'desc').limit(100).get(),
    readDocumentPage(db.collection('campaigns'), { scope: 'campaigns', cursors: pageCursors(parameters), size: 25 }),
    admin.permissions.has('notifications.send') ? db.collection('admin_notification_jobs').orderBy('created_at', 'desc').limit(25).get() : null,
    admin.permissions.has('campaigns.audience') && admin.permissions.has('users.location.read') && admin.permissions.has('notifications.send')
      ? db.collection('campaign_targets').orderBy('created_at', 'desc').limit(25).get() : null,
  ]);
  const { t } = await getI18n();
  const funnels = new Map(await Promise.all(campaigns.documents.filter(c => c.get('audience') === 'zone')
    .map(async c => [c.id, await journeyFunnel(c.id, c.get('steps') ?? [])] as const)));
  return <section className="page"><div className="pageHeading"><div><p className="eyebrow">{t('Brand offers')}</p><h1>{t('Campaigns')}</h1></div></div>
    <p className="muted">{t('Offers require approval. A zone campaign (steps below) reaches everyone with Notifications on who leaves their usual place inside the campaign area or enters, stays in or leaves your zones; without steps, you assign people one by one. Users see sponsored text offers; brands cannot read personal locations or target lists.')}</p>
    {admin.permissions.has('campaigns.write') ? <CampaignForms canBrand={admin.permissions.has('brands.write')} brands={brands.docs.filter(b => b.get('status') === 'active').map(b => ({ id: b.id, name: String(b.get('name')) }))} /> : null}
    {admin.permissions.has('campaigns.write') ? <CodeRedeemForm/> : null}
    <section className="panel"><h2>{t('Brands')}</h2>{brands.empty ? <p className="muted">{t('No brands registered yet.')}</p> : brands.docs.map(b => <p key={b.id}>{String(b.get('name'))} · {b.id} · {t(String(b.get('status')))}</p>)}</section>
    {campaigns.documents.length === 0 ? <p className="panel emptyState">{t('No campaigns yet. Create a draft above.')}</p> : null}
    {campaigns.documents.map(c => <article className="panel" key={c.id}>
      <h2>{String(c.get('name'))}</h2><p>{c.id} · {t(String(c.get('status')))}</p><p>{String(c.get('message'))}</p><p>{String(c.get('terms'))}</p>
      <p>{c.get('lat')}, {c.get('lng')} · {t('Radius')} {c.get('radius')} m · {t('Minimum posts')} {c.get('minPosts')} · {t('Minimum best likes')} {c.get('minLikes')}</p>
      <p>{t('Arrival entry radius: {entry} m (+ GPS error, at most 20 m). OS wake-up radius: {wake} m. Audience uses last shared locations up to {age} minutes old. Doorway entry is not guaranteed.', { entry: c.get('entryRadius') ?? 30, wake: c.get('arrivalRadius') ?? 150, age: c.get('audienceMaxAgeMinutes') ?? 2 })}</p>
      <p>{iso(c.get('starts_at'))} → {iso(c.get('ends_at'))} · {t('Views')}: {Number(c.get('views_count') ?? 0)}</p>
      {admin.permissions.has('campaigns.write') ? <AdminDecision endpoint="/api/admin/v1/campaigns" actions={[
        { label: 'Approve / activate', body: { action: 'status', campaignId: c.id, status: 'active' } },
        { label: 'Pause', body: { action: 'status', campaignId: c.id, status: 'paused' }, className: 'secondaryButton' },
      ]} /> : null}
      {c.get('audience') === 'zone' ? <section><h3>{t('Zone campaign funnel')}</h3>{(funnels.get(c.id) ?? []).map(f => <p key={f.id}>{f.id} · {f.trigger} · {f.title} · {t('Sent')} {f.sent} · {t('Codes used')} {f.redeemed}{f.lastAt ? ` · ${t('Last')} ${f.lastAt}` : ''}</p>)}</section> : null}
      {admin.permissions.has('campaigns.write') ? <JourneyEditor campaignId={c.id} lat={Number(c.get('lat'))} lng={Number(c.get('lng'))} areaRadius={Number(c.get('radius') ?? 1000)}
        saved={c.get('steps') ?? []} timezone={String(c.get('timezone') ?? 'Europe/Istanbul')} canNotify={admin.permissions.has('notifications.send')}/> : null}
      {c.get('audience') !== 'zone' && admin.permissions.has('campaigns.audience') && admin.permissions.has('users.location.read') && admin.permissions.has('notifications.send') ? <CampaignAudience campaignId={c.id} /> : null}
    </article>)}
    <PageNavigation path="/admin/campaigns" next={campaigns.next} previous={campaigns.previous} />
    {assignments ? <section className="panel"><h2>{t('Latest assigned offers')}</h2>
      <p className="muted">{t('Arrival admitted means the server authorized one reminder. It does not prove device delivery or a store visit.')}</p>
      {assignments.empty ? <p className="muted">{t('No offers assigned yet.')}</p> : null}
      {assignments.docs.map(a => <p key={a.id}>{String(a.get('campaign_id'))} · {String(a.get('owner_luid'))} · {String(a.get('notification_mode') ?? 'immediate')}
        {' · '}{a.get('arrival_notified_at') ? `${t('Reminder admitted')} (${a.get('movement_event') ?? 'entry'}) ${iso(a.get('arrival_notified_at'))}` : t('No reminder admitted')} · {t('Expires')} {iso(a.get('expires_at'))}</p>)}
    </section> : null}
    {jobs ? <section className="panel"><h2>{t('Latest notification attempts')}</h2><p className="muted">{t('Accepted means FCM accepted the request. Device delivery and opening are not guaranteed. Up to 3 promotional jobs per user per day.')}</p>
      {jobs.empty ? <p className="muted">{t('No notification attempts yet.')}</p> : null}
      {jobs.docs.map(j => <p key={j.id}>{j.id} · {String(j.get('recipient_id'))} · {t(String(j.get('status')))} · {t('Accepted')} {Number(j.get('accepted') ?? 0)} · {t('Failed')} {Number(j.get('failed') ?? 0)} · {t('Attempts')} {Number(j.get('attempts') ?? 0)}{j.get('no_device') ? ` · ${t('No registered device')}` : ''}</p>)}
    </section> : null}
  </section>;
}
