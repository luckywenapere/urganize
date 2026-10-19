import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applied: unknown[] = [];
const storedHeaders: Array<Record<string, string>> = [];
const refused: string[] = [];
vi.mock('@/app/api/_shared/auth', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/trm/server', () => ({
  applyTrmWebhook: vi.fn(async (_admin: unknown, event: { deliveryId: string }, input: { headers: Record<string, string> }) => {
    storedHeaders.push(input.headers);
    if (applied.some((e) => (e as { deliveryId: string }).deliveryId === event.deliveryId)) return 'duplicate';
    applied.push(event);
    return 'applied';
  }),
  recordRefusedDelivery: vi.fn(async (_a: unknown, _h: unknown, _b: string, reason: string) => {
    refused.push(reason);
  }),
}));

const SECRET = 'whsec_trm_test';
const body = JSON.stringify({ id: 'dlv_9', type: 'release.status_changed', data: { release: { id: 'trm-1', status: 'validating' } } });
const req = (headers: Record<string, string>, raw = body) =>
  new NextRequest('https://app.urganize.app/api/webhooks/trm', { method: 'POST', headers, body: raw });
const signed = (ts = String(Math.floor(Date.now() / 1000)), raw = body) => ({
  'X-TRM-Webhook-Signature': createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex'),
  'X-TRM-Webhook-Timestamp': ts,
  'Content-Type': 'application/json',
});

describe('POST /api/webhooks/trm', () => {
  beforeEach(() => {
    applied.length = 0;
    refused.length = 0;
    storedHeaders.length = 0;
    process.env.TRM_WEBHOOK_SECRET = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  });

  it('404s when the secret is not configured', async () => {
    delete process.env.TRM_WEBHOOK_SECRET;
    const { POST } = await import('./route');
    expect((await POST(req(signed()))).status).toBe(404);
  });

  it('401s a bad signature and a stale timestamp, changing nothing', async () => {
    const { POST } = await import('./route');
    const bad = { ...signed(), 'X-TRM-Webhook-Signature': 'ab'.repeat(32) };
    expect((await POST(req(bad))).status).toBe(401);
    const stale = signed(String(Math.floor(Date.now() / 1000) - 301));
    expect((await POST(req(stale))).status).toBe(401);
    expect(applied).toHaveLength(0);
    expect(refused).toEqual(['mismatch', 'stale']);
  });

  it('applies a verified delivery once; a replay is a no-op 200', async () => {
    const { POST } = await import('./route');
    const first = await POST(req(signed()));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, outcome: 'applied' });
    const again = await POST(req(signed()));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, outcome: 'duplicate' });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ deliveryId: 'dlv_9', releaseId: 'trm-1', status: 'validating' });
  });

  it('stores only x-trm-* headers and content-type, not Vercel internals', async () => {
    const { POST } = await import('./route');
    const headers = { ...signed(), 'x-vercel-oidc-token': 'eyJ.secret', 'x-vercel-sc-headers': '{}', forwarded: 'for=1.2.3.4', 'x-forwarded-for': '1.2.3.4' };
    expect((await POST(req(headers))).status).toBe(200);
    expect(Object.keys(storedHeaders[0]).sort()).toEqual(['content-type', 'x-trm-webhook-signature', 'x-trm-webhook-timestamp']);
  });
});
