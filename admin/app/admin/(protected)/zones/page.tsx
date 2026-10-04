import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';
import AdminDecision from '../AdminDecision';
import ZoneForm from './ZoneForm';

export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  const admin = await requireAdmin({ permission: 'anchors.read' });
  const canWrite = admin.permissions.has('zones.write');
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
      <div className="pageHeading"><div><p className="eyebrow">Safety perimeter</p><h1>Restricted zones</h1></div><p className="muted">createPost hard-blocks new posts inside every active zone. Bulk import: functions/scripts/import-protected-zones.mjs.</p></div>
      {canWrite ? <section className="panel"><h2>Add a zone</h2><ZoneForm /></section> : <p className="readOnlyNotice">Adding or disabling zones requires the zones.write permission.</p>}
      <section className="panel">
        <div className="dataRow place header"><span>Zone</span><span>Center</span><span>Policy</span><span>Created</span>{canWrite ? <span>Status</span> : null}</div>
        {failed ? <p className="emptyState">Restricted-zone data could not be loaded.</p> : zones.length === 0 ? <p className="emptyState">No restricted zones configured.</p> : zones.map(zone => (
          <div className="dataRow place" key={zone.id}>
            <span><b>{String(zone.name)}</b><small>{String(zone.category)}{zone.active === false ? ' · inactive' : ''}</small></span>
            <span>{formatLatLng(zone.lat, zone.lng)}<small>{Number(zone.radius_meters ?? 0)} m radius</small></span>
            <span>{String(zone.policy ?? 'hard_block').replaceAll('_', ' ')}</span>
            <span>{new Date(iso(zone.created_at)).toLocaleDateString('en-US')}</span>
            {canWrite ? (
              <span>
                <AdminDecision
                  endpoint={`/api/admin/v1/zones/${zone.id}/active`}
                  actions={zone.active === false
                    ? [{ label: 'Enable', body: { active: true }, className: 'secondaryButton' }]
                    : [{ label: 'Disable', body: { active: false }, className: 'dangerButton' }]}
                />
              </span>
            ) : null}
          </div>
        ))}
      </section>
    </main>
  );
}
