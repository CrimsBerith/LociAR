import { NextResponse } from 'next/server';
import { ValidationError } from './validation';
import { consumeRateLimit } from './ops';

export function apiError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error('[admin-api]', error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function unauthorized(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return NextResponse.json({ error: 'Origin validation failed' }, { status: 403 });
  const originUrl = new URL(origin);
  if (originUrl.host !== host || !['http:', 'https:'].includes(originUrl.protocol)) {
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
