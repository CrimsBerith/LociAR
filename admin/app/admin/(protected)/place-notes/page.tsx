import { requireAdmin } from '../../../../lib/admin';
import { isoOrNull } from '../../../../lib/firebase-admin';
import { approvedNotes, notificationCandidates, placeNoteSettings, DEFAULT_NOTIFY_RADIUS_M } from '../../../../lib/place-notes';
import AdminDecision from '../AdminDecision';
import { LikeThresholdForm, PlaceNoteEditor } from './PlaceNoteEditor';
export const dynamic = 'force-dynamic';

type Note = FirebaseFirestore.QueryDocumentSnapshot;

function Row({ note, moderate, places }: { note: Note; moderate: boolean; places: boolean }) {
  const approved = note.get('push_state') === 'approved', kind = note.get('note_kind') === 'location' ? 'Location note' : 'AR post';
  const measured = note.get('location_note');
  return <article className="panel">
    <p><a href={`/admin/posts/${note.id}`}>{String(note.get('caption') ?? '')}</a></p>
    <p className="muted">{kind} · ♥ {Number(note.get('likes_count') ?? 0)} · {Number(note.get('lat')).toFixed(5)}, {Number(note.get('lng')).toFixed(5)}
      {measured ? ` · measured by ${String(measured.source)} ±${String(measured.accuracy_m ?? '?')} m` : ''} · author {String(note.get('creator_id'))}
      {' · '}<a href={`https://www.openstreetmap.org/?mlat=${note.get('lat')}&mlon=${note.get('lng')}#map=19/${note.get('lat')}/${note.get('lng')}`} target="_blank" rel="noreferrer">map ↗</a></p>
    <PlaceNoteEditor id={note.id} radius={Number(note.get('notify_radius_m') ?? DEFAULT_NOTIFY_RADIUS_M)} endsAt={isoOrNull(note.get('ends_at'))} canEditRadius={places} canEditEnd={moderate}/>
    {moderate ? <AdminDecision endpoint="/api/admin/v1/place-notes" actions={[
      approved ? { label: 'Stop notifications', body: { action: 'revoke_push', id: note.id } } : { label: 'Approve for notifications', body: { action: 'approve_push', id: note.id } },
      { label: 'Remove note', body: { action: 'remove', id: note.id }, className: 'danger' },
    ]}/> : null}
  </article>;
}

export default async function PlaceNotesPage() {
  const admin = await requireAdmin({ permission: 'posts.read' });
  const moderate = admin.permissions.has('posts.moderate'), places = admin.permissions.has('places.write');
  const settings = await placeNoteSettings(), threshold = settings.likeThreshold;
  const [candidates, approved] = await Promise.all([notificationCandidates(threshold), approvedNotes()]);
  return <section className="page">
    <div className="pageHeading"><h1>Location notes</h1>{admin.permissions.has('posts.create') ? <a href="/admin/posts/new">Add a note anywhere</a> : null}</div>
    <p className="muted">User notes publish at once after the automatic text filter. When enough established accounts like a note it is sent automatically to visitors who come there, once per person, most-liked first; enough reports hide it. You can stop notifications or remove a note at any time, and approve any post manually. Notes never expire unless you set an end date.</p>
    {moderate ? <section className="panel"><h2>Thresholds</h2><LikeThresholdForm threshold={threshold} denseThreshold={settings.denseThreshold} unlockRadius={settings.unlockRadius} reportThreshold={settings.reportThreshold}/></section> : null}
    <h2>Candidates ({candidates.length}) · at least {threshold} likes</h2>
    {candidates.length ? candidates.map(n => <Row key={n.id} note={n} moderate={moderate} places={places}/>) : <p className="emptyState">No notes have reached the threshold yet.</p>}
    <h2>Approved for notifications ({approved.length})</h2>
    {approved.length ? approved.map(n => <Row key={n.id} note={n} moderate={moderate} places={places}/>) : <p className="emptyState">No approved notes.</p>}
  </section>;
}
