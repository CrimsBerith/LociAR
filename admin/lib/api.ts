import { NextResponse } from 'next/server';
import { ValidationError } from './validation';
import { consumeRateLimit } from './ops';
import { originAllowed } from './policy';

export function apiError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  // Details stay in the server log; clients only ever see a generic message.
  console.error('[admin-api]', error);
  return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
}

export function unauthorized(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export function requireSameOrigin(request: Request) {
  // ADMIN_ORIGIN (e.g. https://admin.example.com) pins the allowed origin; without it the Host header is used.
  if (!originAllowed(request.headers.get('origin'), request.headers.get('host'), process.env.ADMIN_ORIGIN)) {
    return NextResponse.json({ error: 'Cross-origin admin writes are forbidden' }, { status: 403 });
  }
  return null;
}

export async function enforceRateLimit(
  actorId: string,
  scope: string,
  limit = 30,
  windowSeconds = 60,
) {
  const allowed = await consumeRateLimit(actorId, scope, limit, windowSeconds);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Admin action rate limit exceeded. Retry after the current window.' },
      { status: 429, headers: { 'Retry-After': String(windowSeconds) } },
    );
  }
  return null;
}
