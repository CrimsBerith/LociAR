import { scalarText } from '../../../../lib/values';
import AdminDecision from '../AdminDecision';
import ZoneForm from './ZoneForm';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';
import { getI18n } from '../../../../lib/i18n-server';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function ZonesPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  const admin = await requireAdmin({ permission: 'anchors.read' });
  const { t, locale } = await getI18n();
  const canWrite = admin.permissions.has('zones.write');
  let zones: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    page = await readDocumentPage(adminDb().collection('protected_zones'), { field: 'name', direction: 'asc', scope: 'zones', cursors: pageCursors(params) });
    zones = page.documents.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    failed = true;
  }
  return (
    <section className="page">
      <div className="pageHeading"><div><p className="eyebrow">{t('Safety perimeter')}</p><h1>{t('Restricted zones')}</h1></div><p className="muted">{t('Protected zones block new post placement.')}</p></div>
      <p className="readOnlyNotice">{t('Hard-block policy is enforced by the createPost Cloud Function. Changes apply to subsequent placements.')}</p>
      {canWrite ? <section className="panel"><div className="panelHeader"><h2>{t('Add a zone')}</h2></div><ZoneForm /></section> : null}
      <section className="panel">
        <div className="dataRow place header"><span>{t('Zone')}</span><span>{t('Center')}</span><span>{t('Policy')}</span><span>{t('Created')}</span></div>
        {failed ? <p className="emptyState">{t('Restricted-zone data could not be loaded.')}</p> : zones.length === 0 ? <p className="emptyState">{t('No restricted zones configured.')}</p> : zones.map(zone => (
          <div className="dataRow place" key={zone.id}>
            <span><b>{String(zone.name)}</b><small>{t(String(zone.category))}{zone.active === false ? ` · ${t('inactive')}` : ''}</small></span>
            <span>{formatLatLng(zone.lat, zone.lng)}<small>{t('{radius} m radius', { radius: Number(zone.radius_meters ?? 0) })}</small></span>
            <span>{t(scalarText(zone.policy ?? 'hard_block').replaceAll('_', ' '))}{canWrite ? <AdminDecision
              endpoint={`/api/admin/v1/zones/${zone.id}/active`}
              actions={[{ label: zone.active === false ? 'Enable' : 'Disable', body: { active: zone.active === false }, className: 'secondaryButton' }]} /> : null}</span>
            <span>{new Date(iso(zone.created_at)).toLocaleDateString(locale)}</span>
          </div>
        ))}
        {!failed ? <PageNavigation path="/admin/zones" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/zones">{t('Return to the first page.')}</a></p>}
      </section>
    </section>
  );
}
