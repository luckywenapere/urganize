import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAYSTACK_INIT_TIMEOUT_MESSAGE,
  PAYSTACK_INIT_TIMEOUT_MS,
  PAYSTACK_INIT_UNREACHABLE_MESSAGE,
  PAYSTACK_INIT_URL,
  fetchPaystackInit,
} from '@/lib/paystack-init';

/**
 * Starting a checkout gives up on a silent Paystack (2026-10-09, v1.92.11).
 *
 * The three routes that start a checkout called Paystack with a bare fetch, so
 * a service that accepted the connection and went quiet left the customer on a
 * spinner and the reservation row pending. A failure now comes back as an
 * ordinary failed response, which those routes already turn into "drop the
 * pending row, tell the customer to try again".
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const init = { method: 'POST', headers: { Authorization: 'Bearer x' }, body: '{}' };

describe('fetchPaystackInit', () => {
  it('passes a good answer straight through', async () => {
    const answer = new Response(JSON.stringify({ status: true, data: { authorization_url: 'https://pay' } }), {
      status: 200,
    });
    const fetchMock = vi.fn().mockResolvedValue(answer);
    vi.stubGlobal('fetch', fetchMock);
    const response = await fetchPaystackInit(init);
    expect(response).toBe(answer);
    expect(fetchMock.mock.calls[0][0]).toBe(PAYSTACK_INIT_URL);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}' });
  });

  it('hands the request an abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await fetchPaystackInit(init);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('passes a Paystack error through untouched, so its message reaches the customer', async () => {
    const answer = new Response(JSON.stringify({ status: false, message: 'Invalid key' }), { status: 401 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer));
    const response = await fetchPaystackInit(init);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: false, message: 'Invalid key' });
  });

  it('turns a timeout into a failed response with a plain message', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    const response = await fetchPaystackInit(init);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ status: false, message: PAYSTACK_INIT_TIMEOUT_MESSAGE });
  });

  it('treats an abort the same way as a timeout', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    const response = await fetchPaystackInit(init);
    expect((await response.json()).message).toBe(PAYSTACK_INIT_TIMEOUT_MESSAGE);
  });

  it('turns a network failure into a failed response that says so', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const response = await fetchPaystackInit(init);
    expect(response.ok).toBe(false);
    expect(await response.json()).toEqual({ status: false, message: PAYSTACK_INIT_UNREACHABLE_MESSAGE });
  });

  it('really gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
          })
      )
    );
    const pending = fetchPaystackInit(init);
    await vi.advanceTimersByTimeAsync(PAYSTACK_INIT_TIMEOUT_MS + 1);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).message).toBe(PAYSTACK_INIT_TIMEOUT_MESSAGE);
  });

  it('does not leave its timer running after Paystack answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await fetchPaystackInit(init);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('not even an Error'));
    await expect(fetchPaystackInit(init)).resolves.toBeInstanceOf(Response);
  });

  it('keeps the wait shorter than a customer will stay on a spinner', () => {
    expect(PAYSTACK_INIT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(PAYSTACK_INIT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('every route that starts a checkout uses it', () => {
  const routes = [
    'app/api/billing/start-checkout/route.ts',
    'app/api/billing/change-plan/route.ts',
    'app/api/trial/start-checkout/route.ts',
  ];

  for (const route of routes) {
    const source = readFileSync(join(process.cwd(), route), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it(`${route} starts the checkout through the helper, not a bare fetch`, () => {
      expect(source).toContain("from '@/lib/paystack-init'");
      expect(source).toContain('fetchPaystackInit(');
      expect(source).not.toMatch(/\bfetch\(/);
    });

    it(`${route} still drops its pending payment row when the start fails`, () => {
      expect(source).toMatch(/!paystackResponse\.ok[\s\S]*from\('payments'\)\.delete\(\)\.eq\('reference', reference\)/);
    });
  }

  it('the money-changing Paystack calls are NOT given up on this way', () => {
    // An abort after Paystack has acted leaves the outcome unknown, so a refund
    // or a subscription create must not use the checkout helper.
    const webhook = readFileSync(join(process.cwd(), 'app/api/webhooks/paystack/route.ts'), 'utf8');
    const cancel = readFileSync(join(process.cwd(), 'app/api/billing/cancel-trial/route.ts'), 'utf8');
    expect(webhook).not.toContain('fetchPaystackInit');
    expect(cancel).not.toContain('fetchPaystackInit');
  });
});
