import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPaystackRefund,
  initializePaystackTransaction,
  listPaystackBanks,
  paystackRequest,
  paystackSplitMode,
  resolvePaystackAccount,
  verifyPaystackTransaction,
} from './paystack-server';

// The network is the only thing mocked: every assertion is about the request
// we send and how we read what comes back.

type Captured = { url: string; init: RequestInit };

let calls: Captured[] = [];

function respondWith(...bodies: Array<{ status?: number; json: unknown } | Error>) {
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = bodies[Math.min(index, bodies.length - 1)];
      index += 1;
      if (next instanceof Error) throw next;
      return new Response(JSON.stringify(next.json), { status: next.status ?? 200 });
    })
  );
}

beforeEach(() => {
  calls = [];
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('paystackRequest', () => {
  it('sends the secret key as a Bearer token and never in the URL', async () => {
    respondWith({ json: { status: true, data: { ok: 1 } } });
    const result = await paystackRequest('/bank/resolve', { query: { bank_code: '058' } });
    expect(result.ok).toBe(true);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_abc');
    expect(calls[0].url).not.toContain('sk_test_abc');
  });

  it('refuses to call anything when the key is missing', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    respondWith({ json: { status: true } });
    const result = await paystackRequest('/bank');
    expect(result).toMatchObject({ ok: false, transient: false });
    expect(calls).toHaveLength(0);
  });

  it('calls a 5xx or a 429 transient, and a 4xx final', async () => {
    respondWith({ status: 503, json: { status: false, message: 'down' } });
    expect(await paystackRequest('/x')).toMatchObject({ ok: false, transient: true, status: 503 });

    respondWith({ status: 429, json: { status: false } });
    expect(await paystackRequest('/x')).toMatchObject({ ok: false, transient: true });

    respondWith({ status: 400, json: { status: false, message: 'Invalid key' } });
    expect(await paystackRequest('/x')).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid key',
      transient: false,
    });
  });

  it('calls a network failure transient', async () => {
    respondWith(new TypeError('fetch failed'));
    expect(await paystackRequest('/x')).toMatchObject({ ok: false, status: 0, transient: true });
  });

  it('treats status:false on a 200 as a failure, the way Paystack reports some errors', async () => {
    respondWith({ status: 200, json: { status: false, message: 'Account not found' } });
    expect(await paystackRequest('/x')).toMatchObject({ ok: false, message: 'Account not found' });
  });
});

describe('listPaystackBanks', () => {
  it('follows the cursor, keeps active NUBAN banks and sorts them', async () => {
    respondWith(
      {
        json: {
          status: true,
          data: [
            { code: '058', name: 'Guaranty Trust Bank', active: true, type: 'nuban' },
            { code: '999', name: 'Old Bank', active: false, type: 'nuban' },
          ],
          meta: { next: 'cursor-2' },
        },
      },
      {
        json: {
          status: true,
          data: [
            { code: '044', name: 'Access Bank', active: true, type: 'nuban' },
            { code: '058', name: 'Guaranty Trust Bank', active: true, type: 'nuban' },
            { code: 'M1', name: 'Some Wallet', active: true, type: 'mobile_money' },
          ],
          meta: { next: null },
        },
      }
    );
    const result = await listPaystackBanks();
    expect(result).toEqual({
      ok: true,
      data: [
        { code: '044', name: 'Access Bank' },
        { code: '058', name: 'Guaranty Trust Bank' },
      ],
    });
    expect(calls[1].url).toContain('next=cursor-2');
  });
});

describe('resolvePaystackAccount', () => {
  it('returns the account name', async () => {
    respondWith({ json: { status: true, data: { account_name: 'ADEBAYO TUNDE JOHN', account_number: '0123456789' } } });
    expect(await resolvePaystackAccount('0123456789', '058')).toEqual({
      ok: true,
      data: { accountName: 'ADEBAYO TUNDE JOHN', accountNumber: '0123456789' },
    });
    expect(calls[0].url).toContain('account_number=0123456789');
    expect(calls[0].url).toContain('bank_code=058');
  });

  it('calls an empty name a failure rather than an account', async () => {
    respondWith({ json: { status: true, data: { account_name: '' } } });
    expect((await resolvePaystackAccount('0123456789', '058')).ok).toBe(false);
  });
});

describe('initializePaystackTransaction', () => {
  it('sends the flat split inline and NGN, with the amount in kobo', async () => {
    respondWith({
      json: { status: true, data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'ac', reference: 'urgpitch-1' } },
    });
    const result = await initializePaystackTransaction({
      email: 'artist@example.com',
      amountKobo: 1_500_000,
      reference: 'urgpitch-1',
      callbackUrl: 'https://app.urganize.app/dashboard/pitching/paid',
      metadata: { source: 'pitch_checkout' },
      split: {
        type: 'flat',
        bearer_type: 'account',
        subaccounts: [{ subaccount: 'ACCT_a', share: 1_200_000 }],
      },
    });
    expect(result.ok).toBe(true);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      email: 'artist@example.com',
      amount: 1_500_000,
      currency: 'NGN',
      reference: 'urgpitch-1',
      split: { type: 'flat', bearer_type: 'account' },
    });
    expect(body.split_code).toBeUndefined();
  });

  it('sends a split code instead when one is given, never both', async () => {
    respondWith({ json: { status: true, data: { authorization_url: 'https://x' } } });
    await initializePaystackTransaction({
      email: 'a@b.c',
      amountKobo: 100,
      reference: 'r',
      callbackUrl: 'https://c',
      metadata: {},
      split: { type: 'flat', bearer_type: 'account', subaccounts: [] },
      splitCode: 'SPL_1',
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.split_code).toBe('SPL_1');
    expect(body.split).toBeUndefined();
  });

  it('defaults to dynamic splits', () => {
    expect(paystackSplitMode()).toBe('dynamic');
    vi.stubEnv('PAYSTACK_SPLIT_MODE', 'split_code');
    expect(paystackSplitMode()).toBe('split_code');
  });
});

describe('verifyPaystackTransaction', () => {
  it('reads the amount, currency, fee, id and paid time', async () => {
    respondWith({
      json: {
        status: true,
        data: {
          status: 'success',
          reference: 'urgpitch-1',
          amount: 1_500_000,
          currency: 'NGN',
          fees: 32_500,
          id: 4099260516,
          paid_at: '2026-09-25T10:00:00.000Z',
          metadata: { quote_id: 'q1' },
        },
      },
    });
    expect(await verifyPaystackTransaction('urgpitch-1')).toEqual({
      ok: true,
      data: {
        status: 'success',
        reference: 'urgpitch-1',
        amountKobo: 1_500_000,
        requestedAmountKobo: 1_500_000,
        currency: 'NGN',
        feesKobo: 32_500,
        transactionId: 4099260516,
        paidAt: '2026-09-25T10:00:00.000Z',
        metadata: { quote_id: 'q1' },
        authorization: null,
      },
    });
  });
});

describe('verifyPaystackTransaction with the fee passed on', () => {
  it('reports what we asked for apart from what the buyer was charged', async () => {
    respondWith({
      json: {
        status: true,
        data: { status: 'success', reference: 'urgcredits-1', amount: 152_285, requested_amount: 150_000, currency: 'NGN', fees: 2_285 },
      },
    });
    const result = await verifyPaystackTransaction('urgcredits-1');
    expect(result.ok && result.data.amountKobo).toBe(152_285);
    expect(result.ok && result.data.requestedAmountKobo).toBe(150_000);
  });
});

describe('createPaystackRefund', () => {
  it('asks for a partial refund on the transaction reference', async () => {
    respondWith({ json: { status: true, data: { id: 3018284, status: 'pending' } } });
    expect(await createPaystackRefund({ reference: 'urgpitch-1', amountKobo: 500_000 })).toEqual({
      ok: true,
      data: { refundId: 3018284, status: 'pending' },
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      transaction: 'urgpitch-1',
      amount: 500_000,
      currency: 'NGN',
    });
  });
});
