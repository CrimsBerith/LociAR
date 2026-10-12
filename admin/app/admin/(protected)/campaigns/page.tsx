import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { pageCursors, readDocumentPage, type SearchParameters } from '../../../../lib/pagination';
import PageNavigation from '../PageNavigation';
import AdminDecision from '../AdminDecision';
import CampaignForms from './CampaignForms';
import CampaignAudience from './CampaignAudience';
import JourneyEditor, { CodeRedeemForm } from './JourneyEditor';
import { journeyFunnel } from '../../../../lib/campaign-journeys';
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
  const funnels = new Map(await Promise.all(campaigns.documents.filter(c => c.get('audience') === 'zone')
    .map(async c => [c.id, await journeyFunnel(c.id, c.get('steps') ?? [])] as const)));
  return <section className="page"><div className="pageHeading"><div><p className="eyebrow">Brand offers</p><h1>Campaigns</h1></div></div>
    <p className="muted">Offers require approval. A zone campaign (steps below) reaches everyone with Notifications on who leaves their usual place inside the campaign area or enters, stays in or leaves your zones; without steps, you assign people one by one. Users see sponsored text offers; brands cannot read personal locations or target lists.</p>
    {admin.permissions.has('campaigns.write') ? <CampaignForms canBrand={admin.permissions.has('brands.write')} brands={brands.docs.filter(b => b.get('status') === 'active').map(b => ({ id: b.id, name: String(b.get('name')) }))} /> : null}
    {admin.permissions.has('campaigns.write') ? <CodeRedeemForm/> : null}
    <section className="panel"><h2>Brands</h2>{brands.docs.map(b => <p key={b.id}>{String(b.get('name'))} · {b.id} · {String(b.get('status'))}</p>)}</section>
    {campaigns.documents.map(c => <article className="panel" key={c.id}>
      <h2>{String(c.get('name'))}</h2><p>{c.id} · {String(c.get('status'))}</p><p>{String(c.get('message'))}</p><p>{String(c.get('terms'))}</p>
      <p>{c.get('lat')}, {c.get('lng')} · Radius {c.get('radius')} m · Minimum posts {c.get('minPosts')} · Minimum best likes {c.get('minLikes')}</p>
      <p>Arrival entry radius: {c.get('entryRadius') ?? 30} m (+ GPS error, at most 20 m). OS wake-up radius: {c.get('arrivalRadius') ?? 150} m. Audience uses last shared locations up to {c.get('audienceMaxAgeMinutes') ?? 2} minutes old. Doorway entry is not guaranteed.</p>
      <p>{iso(c.get('starts_at'))} → {iso(c.get('ends_at'))} · Views: {Number(c.get('views_count') ?? 0)}</p>
      {admin.permissions.has('campaigns.write') ? <AdminDecision endpoint="/api/admin/v1/campaigns" actions={[
        { label: 'Approve / activate', body: { action: 'status', campaignId: c.id, status: 'active' } },
        { label: 'Pause', body: { action: 'status', campaignId: c.id, status: 'paused' }, className: 'secondaryButton' },
      ]} /> : null}
      {c.get('audience') === 'zone' ? <section><h3>Zone campaign funnel</h3>{(funnels.get(c.id) ?? []).map(f => <p key={f.id}>{f.id} · {f.trigger} · {f.title} · Sent {f.sent} · Codes used {f.redeemed}{f.lastAt ? ` · Last ${f.lastAt}` : ''}</p>)}</section> : null}
      {admin.permissions.has('campaigns.write') ? <JourneyEditor campaignId={c.id} lat={Number(c.get('lat'))} lng={Number(c.get('lng'))} areaRadius={Number(c.get('radius') ?? 1000)}
        saved={c.get('steps') ?? []} timezone={String(c.get('timezone') ?? 'Europe/Istanbul')} canNotify={admin.permissions.has('notifications.send')}/> : null}
      {c.get('audience') !== 'zone' && admin.permissions.has('campaigns.audience') && admin.permissions.has('users.location.read') && admin.permissions.has('notifications.send') ? <CampaignAudience campaignId={c.id} /> : null}
    </article>)}
    <PageNavigation path="/admin/campaigns" next={campaigns.next} previous={campaigns.previous} />
    {assignments ? <section className="panel"><h2>Latest assigned offers</h2>
      <p className="muted">Arrival admitted means the server authorized one reminder. It does not prove device delivery or a store visit.</p>
      {assignments.docs.map(a => <p key={a.id}>{String(a.get('campaign_id'))} · {String(a.get('owner_luid'))} · {String(a.get('notification_mode') ?? 'immediate')}
        {' · '}{a.get('arrival_notified_at') ? `Reminder admitted (${a.get('movement_event') ?? 'entry'}) ${iso(a.get('arrival_notified_at'))}` : 'No reminder admitted'} · Expires {iso(a.get('expires_at'))}</p>)}
    </section> : null}
    {jobs ? <section className="panel"><h2>Latest notification attempts</h2><p className="muted">Accepted means FCM accepted the request. Device delivery and opening are not guaranteed. Up to 3 promotional jobs per user per day.</p>
      {jobs.docs.map(j => <p key={j.id}>{j.id} · {String(j.get('recipient_id'))} · {String(j.get('status'))} · Accepted {Number(j.get('accepted') ?? 0)} · Failed {Number(j.get('failed') ?? 0)} · Attempts {Number(j.get('attempts') ?? 0)}{j.get('no_device') ? ' · No registered device' : ''}</p>)}
    </section> : null}
  </section>;
}
