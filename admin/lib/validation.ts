export class ValidationError extends Error {
  status = 400;
}

export function requiredString(value: unknown, field: string, min = 1, max = 1000) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

export function uuid(value: unknown, field: string) {
  const normalized = requiredString(value, field, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ValidationError(`${field} must be a UUID`);
  }
  return normalized;
}

export function nonnegativeInteger(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return value;
}

export async function parseJson(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export function idempotencyKey(request: Request) {
  return uuid(request.headers.get('idempotency-key'), 'Idempotency-Key');
}
