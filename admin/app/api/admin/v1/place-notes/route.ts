import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../../lib/admin';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { moderatePost } from '../../../../../lib/ops';
import { operatePlaceNote, permissionForPlaceNoteAction, setPlaceNoteSettings } from '../../../../../lib/place-notes';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../lib/validation';

/** Location-note notification approval, radius, end date, removal and the like threshold. */
export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  try {
    const body = await parseJson(request), action = String(body.action);
    const permission = action === 'remove' || action === 'settings' ? 'posts.moderate' : permissionForPlaceNoteAction(action);
    if (!permission) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const admin = await requireAdminApi(permission); if (!admin.ok) return unauthorized(admin);
    const limited = await enforceRateLimit(admin.context.user.id, 'place_note_ops', 30, 60); if (limited) return limited;
    const reason = requiredString(body.reason, 'reason', 8, 1000), key = idempotencyKey(request), actor = admin.context.user.id;
    const result = action === 'settings' ? await setPlaceNoteSettings(body, actor, reason, key)
      : action === 'remove' ? await moderatePost(uuid(body.id, 'id').toLowerCase(), 'soft_delete', actor, reason, key)
      : await operatePlaceNote(body, actor, reason, key);
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
