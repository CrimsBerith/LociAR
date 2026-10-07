import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await requireAdmin({ permission: 'dashboard.read' });
  const params = await searchParams;
  const requestedSince = textParameter(params.since, 10);
  const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const date = new Date(`${requestedSince}T00:00:00.000Z`);
  const sinceDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedSince) && Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === requestedSince && date.getTime() <= Date.now() && date.getUTCFullYear() >= 2000
    ? requestedSince : defaultSince;
  const since = Timestamp.fromDate(new Date(`${sinceDate}T00:00:00.000Z`));
  const collection = adminDb().collection('analytics_events');
  const window = collection.where('created_at', '>=', since);
  let page: DocumentPage = { documents: [], next: null, previous: null };
  let allTime = 0;
  let windowCount = 0;
  let events: Array<{ event_name: string; created_at: string; user_id: string | null; post_id: string | null }> = [];
  let failed = false;
  try {
    const cursors = pageCursors(params);
    const [count, windowTotal, loadedPage] = await Promise.all([
      collection.count().get(),
      window.count().get(),
      readDocumentPage(window, { scope: JSON.stringify(['analytics', sinceDate]), cursors, size: 500 }),
    ]);
    allTime = count.data().count;
    windowCount = windowTotal.data().count;
    page = loadedPage;
    events = page.documents.map(d => {
      const data = d.data();
      return { event_name: String(data.event_name), created_at: iso(data.created_at), user_id: data.user_id ?? null, post_id: data.post_id ?? null };
    });
  } catch {
    failed = true;
  }
  const aggregates = new Map<string, { count: number; users: Set<string>; posts: Set<string>; latest: string }>();
  for (const event of events) {
    const current = aggregates.get(event.event_name) ?? { count: 0, users: new Set<string>(), posts: new Set<string>(), latest: event.created_at };
    current.count += 1;
    if (event.user_id) current.users.add(event.user_id);
    if (event.post_id) current.posts.add(event.post_id);
    aggregates.set(event.event_name, current);
  }
  const rows = [...aggregates.entries()].sort((left, right) => right[1].count - left[1].count);

  return (
    <section className="page">
      <div className="pageHeading"><div><p className="eyebrow">Measured behavior</p><h1>Analytics</h1></div><p className="muted">Real analytics_events only. Uncollected reliability metrics are not estimated.</p></div>
      <section className="metricGrid">
        <article className="metricCard"><span>Retained events</span><strong>{allTime.toLocaleString()}</strong></article>
        <article className="metricCard"><span>Events in query window</span><strong>{windowCount.toLocaleString()}</strong><small>Since {sinceDate} UTC · exact server count</small></article>
        <article className="metricCard"><span>Crash-free sessions</span><strong className="notInstrumented">Not instrumented</strong></article>
        <article className="metricCard"><span>AR resolve success</span><strong className="notInstrumented">Not instrumented</strong></article>
      </section>
      <section className="panel actionPanel">
        <p className="readOnlyNotice">Event summaries for this batch of {events.length} records. Counts of known users and posts are distinct within this batch. Use Next records to inspect the entire query window.</p>
        <div className="dataRow analytics header"><span>Event</span><span>Count</span><span>Known users / posts</span><span>Latest</span></div>
        {failed ? <p className="emptyState">Analytics events could not be loaded.</p> : rows.length === 0 ? <p className="emptyState">No analytics events in the last 30 days.</p> : rows.map(([name, value]) => (
          <div className="dataRow analytics" key={name}>
            <span><b>{name}</b></span><span>{value.count.toLocaleString()}</span><span>{value.users.size} / {value.posts.size}</span><span>{new Date(value.latest).toLocaleString('en-US')}</span>
          </div>
        ))}
        {!failed ? <PageNavigation path="/admin/analytics" parameters={{ since: sinceDate }} next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/analytics">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
