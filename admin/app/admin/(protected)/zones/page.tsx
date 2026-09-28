import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';

export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  await requireAdmin({ permission: 'anchors.read' });
  let zones: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const snap = await adminDb().collection('protected_zones').orderBy('name').limit(500).get();
    zones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    failed = true;
  }
  return (
    <main className="page">
      <div className="pageHeading"><div><p className="eyebrow">Safety perimeter</p><h1>Restricted zones</h1></div><p className="muted">Inventory only. Zones are loaded with functions/scripts/import-protected-zones.mjs.</p></div>
      <p className="readOnlyNotice">Hard-block policy is enforced by the createPost Cloud Function. This screen cannot create, edit or delete zones.</p>
      <section className="panel">
        <div className="dataRow place header"><span>Zone</span><span>Center</span><span>Policy</span><span>Created</span></div>
        {failed ? <p className="emptyState">Restricted-zone data could not be loaded.</p> : zones.length === 0 ? <p className="emptyState">No restricted zones configured.</p> : zones.map(zone => (
          <div className="dataRow place" key={zone.id}>
            <span><b>{String(zone.name)}</b><small>{String(zone.category)}{zone.active === false ? ' · inactive' : ''}</small></span>
            <span>{formatLatLng(zone.lat, zone.lng)}<small>{Number(zone.radius_meters ?? 0)} m radius</small></span>
            <span>{String(zone.policy ?? 'hard_block').replaceAll('_', ' ')}</span>
            <span>{new Date(iso(zone.created_at)).toLocaleDateString('en-US')}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
