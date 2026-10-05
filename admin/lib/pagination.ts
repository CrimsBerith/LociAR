import { createHash } from 'node:crypto';
import { FieldPath, Timestamp, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

export type SearchParameters = Record<string, string | string[] | undefined>;
export type PageCursors = { after?: string; before?: string };
export type DocumentPage = {
  documents: QueryDocumentSnapshot[];
  next: string | null;
  previous: string | null;
};
export type PageOptions = { field?: string; direction?: 'asc' | 'desc'; scope: string; cursors?: PageCursors; size?: number };

type CursorValue = { type: 'timestamp'; seconds: number; nanoseconds: number } | { type: 'string'; value: string };
type Cursor = { version: 1; scope: string; id: string; value: CursorValue };

export class InvalidCursorError extends Error {
  constructor() { super('The page link is invalid or belongs to different filters. Return to the first page.'); }
}

export function textParameter(value: SearchParameters[string], maximum = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

export function pageCursors(params: SearchParameters, prefix = ''): PageCursors {
  const after = params[prefix ? `${prefix}After` : 'after'];
  const before = params[prefix ? `${prefix}Before` : 'before'];
  if (Array.isArray(after) || Array.isArray(before) || (after && before)) throw new InvalidCursorError();
  return { after: after || undefined, before: before || undefined };
}

function scopeKey(scope: string): string {
  return createHash('sha256').update(scope).digest('base64url');
}

function cursorValue(value: unknown): CursorValue {
  if (value instanceof Timestamp) return { type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (typeof value === 'string' && value.length <= 1500) return { type: 'string', value };
  throw new Error('The ordered field is not a timestamp or string.');
}

export function encodeCursor(document: Pick<QueryDocumentSnapshot, 'id' | 'get'>, field: string, scope: string): string {
  const cursor: Cursor = { version: 1, scope: scopeKey(scope), id: document.id, value: cursorValue(document.get(field)) };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(token: string, scope: string): { id: string; value: Timestamp | string } {
  try {
    if (token.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new InvalidCursorError();
    const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Cursor;
    if (cursor.version !== 1 || cursor.scope !== scopeKey(scope) || typeof cursor.id !== 'string'
      || !cursor.id || cursor.id.length > 1500 || cursor.id.includes('/') || cursor.id === '.' || cursor.id === '..') {
      throw new InvalidCursorError();
    }
    const value = cursor.value;
    if (value.type === 'string' && typeof value.value === 'string' && value.value.length <= 1500) {
      return { id: cursor.id, value: value.value };
    }
    if (value.type === 'timestamp' && Number.isInteger(value.seconds) && value.seconds >= -62135596800
      && value.seconds <= 253402300799 && Number.isInteger(value.nanoseconds)
      && value.nanoseconds >= 0 && value.nanoseconds <= 999999999) {
      return { id: cursor.id, value: new Timestamp(value.seconds, value.nanoseconds) };
    }
    throw new InvalidCursorError();
  } catch {
    throw new InvalidCursorError();
  }
}

/** Value cursors survive deletion of the boundary row; document IDs break timestamp/name ties. */
export async function readDocumentPage(
  query: Query,
  options: PageOptions,
): Promise<DocumentPage> {
  const { field = 'created_at', direction = 'desc', scope, cursors = {}, size = 100 } = options;
  if (!Number.isInteger(size) || size < 1 || size > 500 || (cursors.after && cursors.before)) throw new InvalidCursorError();
  const scopedOrder = JSON.stringify([scope, field, direction]);
  let ordered = query.orderBy(field, direction).orderBy(FieldPath.documentId(), direction);
  if (cursors.after) {
    const cursor = decodeCursor(cursors.after, scopedOrder);
    ordered = ordered.startAfter(cursor.value, cursor.id);
  }
  if (cursors.before) {
    const cursor = decodeCursor(cursors.before, scopedOrder);
    ordered = ordered.endBefore(cursor.value, cursor.id);
  }
  const snapshot = await (cursors.before ? ordered.limitToLast(size + 1) : ordered.limit(size + 1)).get();
  const hasExtra = snapshot.size > size;
  const documents = cursors.before ? snapshot.docs.slice(-size) : snapshot.docs.slice(0, size);
  const hasPrevious = cursors.before ? hasExtra : Boolean(cursors.after);
  const hasNext = cursors.before ? true : hasExtra;
  return {
    documents,
    previous: documents.length && hasPrevious ? encodeCursor(documents[0], field, scopedOrder) : null,
    next: documents.length && hasNext ? encodeCursor(documents.at(-1)!, field, scopedOrder) : null,
  };
}

/** Scan a bounded raw page without dropping matches or losing continuation on an empty result. */
export async function readCaptionPage(query: Query, options: PageOptions & { needle: string }) {
  const page = await readDocumentPage(query, options);
  return { ...page, matches: page.documents.filter(document => String(document.get('caption') ?? '').toLowerCase().includes(options.needle.toLowerCase())) };
}

export function pageHref(path: string, parameters: Record<string, string | undefined>, cursor: string | null, direction: 'after' | 'before', prefix = ''): string {
  const query = new URLSearchParams();
  const afterKey = prefix ? `${prefix}After` : 'after';
  const beforeKey = prefix ? `${prefix}Before` : 'before';
  for (const [key, value] of Object.entries(parameters)) {
    if (value && key !== afterKey && key !== beforeKey) query.set(key, value);
  }
  if (cursor) query.set(direction === 'after' ? afterKey : beforeKey, cursor);
  return `${path}${query.size ? `?${query}` : ''}`;
}
