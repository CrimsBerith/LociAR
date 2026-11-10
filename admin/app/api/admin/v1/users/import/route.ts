import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { adminDb } from '../../../../../../lib/firebase-admin';
import { createManagedUser, normalizeManagedUser } from '../../../../../../lib/content-ops';
import { idempotencyKey, parseJson, requiredString, ValidationError } from '../../../../../../lib/validation';
import { derivedKey } from '../../../../../../lib/ops';

function rowsFrom(body: Record<string, unknown>, maxRows: number) {
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > maxRows) throw new ValidationError(`Each batch must contain 1–${maxRows} profiles`);
  const rows = body.rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new ValidationError(`Row ${index + 1} must be an object`);
    try { return normalizeManagedUser(row as {handle:unknown;displayName:unknown;email?:unknown;bio?:unknown;avatarPreset?:unknown}); }
    catch (error) { throw new ValidationError(`Row ${index + 1}: ${error instanceof Error ? error.message : 'invalid profile'}`); }
  });
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(rows[i].handle)) throw new ValidationError(`Row ${i + 1}: duplicate handle in file`);
    seen.add(rows[i].handle);
  }
  return rows;
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('users.create'); if (!access.ok) return unauthorized(access);
  try {
    const body = await parseJson(request), db = adminDb();
    if (body.mode !== 'preview' && body.mode !== 'import') throw new ValidationError('Invalid import mode');
    if (body.mode === 'preview') {
      const rows = rowsFrom(body,50);
      const previewLimit = await enforceRateLimit(access.context.user.id, 'users.create-preview', 60, 60); if (previewLimit) return previewLimit;
      const handles = rows.map(row => db.collection('handles').doc(row.handle));
      const reservations = await db.getAll(...handles);
      const conflicts = rows.flatMap((row, i) => reservations[i].exists ? [{ row: i + 1, handle: row.handle, error: 'handle_taken' }] : []);
      return NextResponse.json({ rows: rows.map(row => ({ ...row, email: row.email ? 'provided' : '' })), conflicts });
    }
    const rows = rowsFrom(body,10);
    const limited = await enforceRateLimit(access.context.user.id, 'users.create-batch', 60, 60); if (limited) return limited;
    const key = idempotencyKey(request), reason = requiredString(body.reason, 'reason', 8, 1000);
    const results: Array<{handle:string;id?:string;error?:string}> = [];
    for (const row of rows) {
      try {
        const user = await createManagedUser(row, access.context.user.id, reason, derivedKey(key, `persona:${row.handle}`));
        results.push({ handle: row.handle, id: user.id });
      } catch (error) { results.push({ handle: row.handle, error: error instanceof Error ? error.message : 'unexpected' }); }
    }
    return NextResponse.json({ results, created: results.filter(row => row.id).length, failed: results.filter(row => row.error).length });
  } catch (error) { return apiError(error); }
}
