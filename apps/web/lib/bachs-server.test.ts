import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The full loop of applying a Bachs checkout, with only the edges mocked: the
// database (a tiny in-memory table), the period writer and Bachs's GET answer.
// The GET answer is the shape the sandbox returned on 2026-11-01 for a paid
// ₦2,600 checkout.

const applyTransferPeriod = vi.fn(async (..._args: unknown[]) => ({ periodEnd: '2026-12-01T00:00:00.000Z', workspaceId: 'ws_1' }));
vi.mock('./self-serve-server', () => ({
  applyTransferPeriod: (...args: unknown[]) => applyTransferPeriod(...args),
  trackSelfServe: async () => undefined,
}));
vi.mock('./referrals-server', () => ({ loadIntroMonthsLeft: async () => 0 }));
const creditPurchase = vi.fn(async (..._args: unknown[]): Promise<'credited' | 'already' | 'error'> => 'credited');
vi.mock('@/lib/credits/credits-server', () => ({ creditPurchase: (...args: unknown[]) => creditPurchase(...args) }));
vi.mock('@/lib/billing-events-server', () => ({ logBillingEvent: async () => undefined }));

const SANDBOX_PAID = {
  checkout_id: 'chk_Tl9eQSbd2o7o4Q3y',
  status: 'completed',
  payment_status: 'succeeded',
  amount: '2600.00',
  currency: 'NGN',
  reference: 'urganize_bx_1',
  charge: { amount: '2600.00', currency: 'NGN', status: 'succeeded' },
};

type Row = Record<string, unknown>;

function fakeAdmin(rows: Row[]) {
  return {
    from: () => {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      const matches = () => rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      const builder = {
        select: () => builder,
        update: (values: Row) => {
          patch = values;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return builder;
        },
        maybeSingle: async () => {
          const found = matches();
          if (patch) found.forEach((row) => Object.assign(row, patch));
          return { data: found[0] ? { ...found[0] } : null, error: null };
        },
        then: (resolve: (value: { data: null; error: null }) => void) => {
          if (patch) matches().forEach((row) => Object.assign(row, patch));
          resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}

const openRow = (): Row => ({
  id: 'row_1',
  reference: 'urganize_bx_1',
  checkout_id: 'chk_Tl9eQSbd2o7o4Q3y',
  user_id: 'user_1',
  plan: 'solo',
  billing_interval: 'monthly',
  amount_kobo: 260_000,
  status: 'open',
  period_end: null,
});

async function load() {
  vi.resetModules();
  return import('./bachs-server');
}

describe('fulfilBachsCheckout', () => {
  beforeEach(() => {
    vi.stubEnv('BACHS_SECRET_KEY', 'sk_sandbox_test');
    applyTransferPeriod.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('applies a checkout Bachs says is paid, once', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(SANDBOX_PAID), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fulfilBachsCheckout } = await load();
    const rows = [openRow()];
    const admin = fakeAdmin(rows) as never;

    expect(await fulfilBachsCheckout(admin, 'urganize_bx_1')).toBe('applied');
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox-api.bachs.io/v1/checkout-sessions/chk_Tl9eQSbd2o7o4Q3y');
    expect(applyTransferPeriod).toHaveBeenCalledTimes(1);
    expect(applyTransferPeriod.mock.calls[0]).toEqual([
      admin,
      expect.objectContaining({ userId: 'user_1', plan: 'solo', period: 'monthly', amountKobo: 260_000, channel: 'bachs' }),
    ]);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].period_end).toBe('2026-12-01T00:00:00.000Z');

    // A second webhook or poll applies nothing more.
    expect(await fulfilBachsCheckout(admin, 'urganize_bx_1')).toBe('already');
    expect(applyTransferPeriod).toHaveBeenCalledTimes(1);
  });

  it('applies nothing when Bachs says it is not paid, or paid a different amount', async () => {
    const { fulfilBachsCheckout } = await load();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...SANDBOX_PAID, status: 'open', payment_status: 'requires_payment_method' }))));
    expect(await fulfilBachsCheckout(fakeAdmin([openRow()]) as never, 'urganize_bx_1')).toBe('not_paid');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...SANDBOX_PAID, amount: '26.00' }))));
    expect(await fulfilBachsCheckout(fakeAdmin([openRow()]) as never, 'urganize_bx_1')).toBe('not_paid');
    expect(applyTransferPeriod).not.toHaveBeenCalled();
  });

  it('says unknown for a reference we never opened, and error when Bachs cannot be reached', async () => {
    const { fulfilBachsCheckout } = await load();
    expect(await fulfilBachsCheckout(fakeAdmin([]) as never, 'nope')).toBe('unknown');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })));
    expect(await fulfilBachsCheckout(fakeAdmin([openRow()]) as never, 'urganize_bx_1')).toBe('error');
    expect(applyTransferPeriod).not.toHaveBeenCalled();
  });
});

// Dollar prices outside Nigeria (#1120). A dollar row asked Bachs for cents and
// keeps the naira equivalent for our books; a credits row buys one pack.
const DOLLAR_PAID = {
  ...SANDBOX_PAID,
  amount: '29.00',
  currency: 'USD',
  reference: 'urganize_bx_usd',
  charge: { amount: '29.00', currency: 'USD', status: 'succeeded' },
};

const dollarRow = (): Row => ({
  ...openRow(),
  id: 'row_usd',
  reference: 'urganize_bx_usd',
  plan: 'manager',
  amount_kobo: 4_350_000,
  currency: 'USD',
  amount_minor: 2_900,
});

const creditsRow = (): Row => ({
  ...openRow(),
  id: 'row_cr',
  reference: 'urgcredits-abc',
  purpose: 'credits',
  plan: null,
  billing_interval: null,
  credits: 200,
  pack_price_naira: 3_000,
  workspace_id: 'ws_1',
  owner_user_id: 'user_1',
  amount_kobo: 600_000,
  currency: 'USD',
  amount_minor: 400,
});

describe('fulfilBachsCheckout in US dollars', () => {
  beforeEach(() => {
    vi.stubEnv('BACHS_SECRET_KEY', 'sk_sandbox_test');
    applyTransferPeriod.mockClear();
    creditPurchase.mockClear();
    creditPurchase.mockImplementation(async () => 'credited');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('applies a dollar plan for exactly its dollars, recorded at the naira equivalent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DOLLAR_PAID))));
    const { fulfilBachsCheckout } = await load();
    const rows = [dollarRow()];
    expect(await fulfilBachsCheckout(fakeAdmin(rows) as never, 'urganize_bx_usd')).toBe('applied');
    expect(applyTransferPeriod.mock.calls[0][1]).toEqual(expect.objectContaining({ plan: 'manager', amountKobo: 4_350_000 }));
  });

  it('refuses a dollar row paid in Naira, or the right number in the wrong unit', async () => {
    const { fulfilBachsCheckout } = await load();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...DOLLAR_PAID, currency: 'NGN' }))));
    expect(await fulfilBachsCheckout(fakeAdmin([dollarRow()]) as never, 'urganize_bx_usd')).toBe('not_paid');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...DOLLAR_PAID, amount: '43500.00' }))));
    expect(await fulfilBachsCheckout(fakeAdmin([dollarRow()]) as never, 'urganize_bx_usd')).toBe('not_paid');
    expect(applyTransferPeriod).not.toHaveBeenCalled();
  });

  it('credits a dollar pack once and never touches the plan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...DOLLAR_PAID, amount: '4.00', reference: 'urgcredits-abc' })))
    );
    const { fulfilBachsCheckout } = await load();
    const rows = [creditsRow()];
    const admin = fakeAdmin(rows) as never;
    expect(await fulfilBachsCheckout(admin, 'urgcredits-abc')).toBe('applied');
    expect(creditPurchase).toHaveBeenCalledTimes(1);
    expect(creditPurchase.mock.calls[0][1]).toEqual(
      expect.objectContaining({ workspaceId: 'ws_1', credits: 200, priceNaira: 3_000, reference: 'urgcredits-abc', source: 'bachs' })
    );
    expect(applyTransferPeriod).not.toHaveBeenCalled();
    expect(await fulfilBachsCheckout(admin, 'urgcredits-abc')).toBe('already');
    expect(creditPurchase).toHaveBeenCalledTimes(1);
  });

  it('puts a paid pack back to open when the credits could not be written, so it is retried', async () => {
    creditPurchase.mockImplementation(async () => 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...DOLLAR_PAID, amount: '4.00', reference: 'urgcredits-abc' })))
    );
    const { fulfilBachsCheckout } = await load();
    const rows = [creditsRow()];
    expect(await fulfilBachsCheckout(fakeAdmin(rows) as never, 'urgcredits-abc')).toBe('error');
    expect(rows[0].status).toBe('open');
  });
});
