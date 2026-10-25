import { createHmac, timingSafeEqual } from 'node:crypto';

function sorted(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new Error('Invalid callback depth');
  if (Array.isArray(value)) return value.map(item => sorted(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sorted(v, depth + 1)]));
}

export function verifyCryptoIPN(body: unknown, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  try {
    const expected = createHmac('sha512', secret).update(JSON.stringify(sorted(body))).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  } catch { return false; }
}

/** Exact decimal comparisons, including JSON numbers rendered with scientific notation. */
export function cryptoDecimal(value: unknown, scale = 36): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid decimal');
  if (String(value).length > 100) throw new Error('Invalid decimal');
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new Error('Invalid decimal');
  const fractional = match[2] ?? '', shift = scale + Number(match[3] ?? 0) - fractional.length;
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 100) throw new Error('Invalid decimal precision');
  const digits = BigInt(match[1] + fractional);
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  if (digits % divisor !== 0n) throw new Error('Invalid decimal precision');
  return digits / divisor; // Remove only insignificant zeroes; never round money received.
}

export function cryptoPaymentFullyPaid(payment: Record<string, unknown>): boolean {
  try {
    return payment.payment_status === 'finished' && cryptoDecimal(payment.pay_amount) > 0n
      && cryptoDecimal(payment.actually_paid) >= cryptoDecimal(payment.pay_amount);
  } catch { return false; }
}
