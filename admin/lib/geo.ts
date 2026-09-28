export function formatLatLng(latitude: unknown, longitude: unknown) {
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
  return 'Unavailable';
}

export function parseJsonField(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function objectKeys(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>) : [];
}
