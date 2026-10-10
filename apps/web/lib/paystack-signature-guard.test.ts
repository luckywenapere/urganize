import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The webhook uses the shared signature check and never its own (2026-10-09,
 * v1.92.13). A second inline copy is how the hex-string-length comparison that
 * threw on a forged signature came back the first time.
 */

const ROOT = resolve(__dirname, '..');
const route = readFileSync(resolve(ROOT, 'app/api/webhooks/paystack/route.ts'), 'utf8');
const lib = readFileSync(resolve(ROOT, 'lib/paystack-signature.ts'), 'utf8');

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the Paystack webhook signature check', () => {
  const code = strip(route);

  it('calls the shared check before reading the event', () => {
    expect(code).toContain("from '@/lib/paystack-signature'");
    expect(code).toMatch(/validatePaystackSignature\(rawBody, signature, paystackSecretKey\)/);
  });

  it('does not carry its own HMAC or timingSafeEqual', () => {
    expect(code).not.toMatch(/createHmac|timingSafeEqual|from 'crypto'/);
  });

  it('answers a bad signature with 401', () => {
    const after = code.slice(code.indexOf('validatePaystackSignature(rawBody'));
    expect(after.slice(0, 300)).toMatch(/Invalid signature[\s\S]*status: 401/);
  });

  it('compares the digests in constant time', () => {
    expect(strip(lib)).toMatch(/crypto\.timingSafeEqual\(expected, received\)/);
  });

  it('compares decoded byte lengths, never hex string lengths', () => {
    const body = strip(lib);
    expect(body).toMatch(/received\.length !== expected\.length/);
    expect(body).not.toMatch(/expected\.length !== signature\.length/);
  });
});
