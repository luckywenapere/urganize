import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verify = vi.fn();
const credit = vi.fn();
const logEvent = vi.fn();

vi.mock('../paystack-server', () => ({ verifyPaystackTransaction: (...args: unknown[]) => verify(...args) }));
vi.mock('./credits-server', () => ({ creditPurchase: (...args: unknown[]) => credit(...args) }));
vi.mock('../billing-events-server', () => ({ logBillingEvent: (...args: unknown[]) => logEvent(...args) }));

import { buildPurchaseMetadata } from './purchase';
import { settleCreditsPurchase } from './purchase-server';

const admin = {} as SupabaseClient;
const REF = 'urgcredits-abc';

const metadata = (over: Record<string, unknown> = {}) => ({
  ...buildPurchaseMetadata({
    workspaceId: 'ws-1',
    ownerUserId: 'owner-1',
    userId: 'user-1',
    priceNaira: 7500,
    credits: 500,
  }),
  ...over,
});

const paystackSays = (over: Record<string, unknown> = {}) => ({
  ok: true as const,
  data: { status: 'success', currency: 'NGN', amountKobo: 750_000, requestedAmountKobo: 750_000, metadata: metadata(), ...over },
});

beforeEach(() => {
  verify.mockReset();
  credit.mockReset();
  logEvent.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settleCreditsPurchase', () => {
  it('asks Paystack, then credits the stored amount to the stored team, once', async () => {
    verify.mockResolvedValue(paystackSays());
    credit.mockResolvedValue('credited');

    const outcome = await settleCreditsPurchase(admin, REF, 'webhook');

    expect(outcome).toEqual({ state: 'credited', credits: 500 });
    expect(verify).toHaveBeenCalledWith(REF);
    expect(credit).toHaveBeenCalledTimes(1);
    expect(credit).toHaveBeenCalledWith(admin, {
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-1',
      credits: 500,
      reference: REF,
      priceNaira: 7500,
    });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][1]).toMatchObject({ type: 'credits_purchased', workspaceId: 'ws-1' });
  });

  it('treats a repeat of a credited purchase as success without announcing it twice', async () => {
    verify.mockResolvedValue(paystackSays());
    credit.mockResolvedValue('already');

    expect(await settleCreditsPurchase(admin, REF, 'callback')).toEqual({ state: 'credited', credits: 500 });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('credits the pack when Paystack adds its fee on top of the price (#1099)', async () => {
    credit.mockResolvedValue('credited');
    verify.mockResolvedValue(paystackSays({ amountKobo: 761_400, requestedAmountKobo: 750_000 }));
    expect(await settleCreditsPurchase(admin, REF, 'webhook')).toEqual({ state: 'credited', credits: 500 });
    expect(credit).toHaveBeenCalledTimes(1);
  });

  it('credits nothing for a payment that has not gone through', async () => {
    verify.mockResolvedValue(paystackSays({ status: 'abandoned' }));
    expect(await settleCreditsPurchase(admin, REF, 'callback')).toEqual({ state: 'not_paid' });
    expect(credit).not.toHaveBeenCalled();
  });

  it('credits nothing for money that does not match a pack, and says so loudly', async () => {
    verify.mockResolvedValue(paystackSays({ amountKobo: 100, requestedAmountKobo: 100 }));
    expect(await settleCreditsPurchase(admin, REF, 'webhook')).toEqual({ state: 'mismatch' });
    expect(credit).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('MISMATCH'));
  });

  it('credits nothing when the credits in the metadata are not what the pack gives', async () => {
    verify.mockResolvedValue(paystackSays({ metadata: metadata({ credits: 99_999 }) }));
    expect(await settleCreditsPurchase(admin, REF, 'webhook')).toEqual({ state: 'mismatch' });
    expect(credit).not.toHaveBeenCalled();
  });

  it('is a transient error when Paystack cannot be reached, so the webhook is redelivered', async () => {
    verify.mockResolvedValue({ ok: false, status: 502, message: 'down', transient: true });
    expect(await settleCreditsPurchase(admin, REF, 'webhook')).toEqual({ state: 'error', transient: true });
    expect(credit).not.toHaveBeenCalled();
  });

  it('is a permanent error when Paystack refuses the lookup', async () => {
    verify.mockResolvedValue({ ok: false, status: 404, message: 'Transaction reference not found', transient: false });
    expect(await settleCreditsPurchase(admin, REF, 'callback')).toEqual({ state: 'error', transient: false });
  });

  it('never drops paid money: a failed ledger write is a transient error and logs loudly', async () => {
    verify.mockResolvedValue(paystackSays());
    credit.mockResolvedValue('error');

    expect(await settleCreditsPurchase(admin, REF, 'webhook')).toEqual({ state: 'error', transient: true });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PAID BUT NOT CREDITED'));
    expect(logEvent).not.toHaveBeenCalled();
  });
});
