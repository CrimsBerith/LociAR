import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  await requireAdmin({ permission: 'dashboard.read' });
  const since = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const collection = adminDb().collection('analytics_events');
  let allTime = 0;
  let events: Array<{ event_name: string; created_at: string; user_id: string | null; post_id: string | null }> = [];
  let failed = false;
  try {
    const [count, snap] = await Promise.all([
      collection.count().get(),
      collection.where('created_at', '>=', since).orderBy('created_at', 'desc').limit(5000).get(),
    ]);
    allTime = count.data().count;
    events = snap.docs.map(d => {
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
    <main className="page">
      <div className="pageHeading"><div><p className="eyebrow">Measured behavior</p><h1>Analytics</h1></div><p className="muted">Real analytics_events only. Uncollected reliability metrics are not estimated.</p></div>
      <section className="metricGrid">
        <article className="metricCard"><span>All-time events</span><strong>{allTime.toLocaleString()}</strong></article>
        <article className="metricCard"><span>Events, last 30 days</span><strong>{events.length.toLocaleString()}</strong><small>{events.length === 5000 ? 'Display capped at latest 5,000' : 'Complete query window'}</small></article>
        <article className="metricCard"><span>Crash-free sessions</span><strong className="notInstrumented">Not instrumented</strong></article>
        <article className="metricCard"><span>AR resolve success</span><strong className="notInstrumented">Not instrumented</strong></article>
      </section>
      <section className="panel actionPanel">
        <div className="dataRow analytics header"><span>Event</span><span>Count</span><span>Known users / posts</span><span>Latest</span></div>
        {failed ? <p className="emptyState">Analytics events could not be loaded.</p> : rows.length === 0 ? <p className="emptyState">No analytics events in the last 30 days.</p> : rows.map(([name, value]) => (
          <div className="dataRow analytics" key={name}>
            <span><b>{name}</b></span><span>{value.count.toLocaleString()}</span><span>{value.users.size} / {value.posts.size}</span><span>{new Date(value.latest).toLocaleString('en-US')}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
