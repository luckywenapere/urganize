import { describe, expect, it } from 'vitest';
import {
  CARD_TRIAL_SIGNUP_CUTOFF,
  bachsAccessDenied,
  cardTrialOfferCopy,
  cardTrialProductBody,
  cardTrialReminderCopy,
  cardTrialReminderDue,
  formatChargeDay,
  formatUsd,
  invoiceFromEvent,
  isLiveBachsStatus,
  parseBachsSubscription,
  parseCardTrialAvailability,
  resolveCardTrialOwed,
  shouldRecheckAvailability,
  subscriptionAccessEnd,
  subscriptionIdFromEvent,
  teamTrialEndFor,
} from './bachs-trial';

// Card trial for customers abroad (#1266). Everything that decides something
// is here; lib/bachs-trial-server.ts only talks to Bachs and the database.

const NOW = Date.parse('2026-11-20T12:00:00Z');

describe('who owes a card', () => {
  const owed = {
    offered: true,
    available: true,
    createdAtIso: '2026-11-16T10:00:00Z',
    role: 'manager',
    onboardingCompleted: true,
    isInvitedMember: false,
    paidAt: null,
    hasSubscription: false,
  } as const;

  it('asks a new owner abroad who has finished signing up', () => {
    expect(resolveCardTrialOwed(owed)).toBe(true);
  });

  it('never asks anyone in Nigeria or of unknown country', () => {
    expect(resolveCardTrialOwed({ ...owed, offered: false })).toBe(false);
  });

  it('never asks while Bachs has not turned trials on', () => {
    expect(resolveCardTrialOwed({ ...owed, available: false })).toBe(false);
  });

  it('never asks an account from before the cutoff', () => {
    expect(resolveCardTrialOwed({ ...owed, createdAtIso: '2026-11-14T23:59:59Z' })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, createdAtIso: CARD_TRIAL_SIGNUP_CUTOFF })).toBe(true);
  });

  it('fails toward not asking when a fact is missing', () => {
    expect(resolveCardTrialOwed({ ...owed, createdAtIso: null })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, createdAtIso: 'not a date' })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, isInvitedMember: null })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, onboardingCompleted: null })).toBe(false);
  });

  it('never asks an invited teammate, a curator, a payer or someone with a card on file', () => {
    expect(resolveCardTrialOwed({ ...owed, isInvitedMember: true })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, role: 'Curator' })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, paidAt: '2026-11-17T00:00:00Z' })).toBe(false);
    expect(resolveCardTrialOwed({ ...owed, hasSubscription: true })).toBe(false);
  });

  it('waits until sign-up is finished', () => {
    expect(resolveCardTrialOwed({ ...owed, onboardingCompleted: false })).toBe(false);
  });
});

describe('whether Bachs has card trials on', () => {
  it('reads what was saved, and nothing else', () => {
    expect(parseCardTrialAvailability({ state: 'available', checkedAt: '2026-11-20T11:00:00Z' })).toEqual({
      state: 'available',
      checkedAt: '2026-11-20T11:00:00Z',
    });
    expect(parseCardTrialAvailability({ state: 'yes' })).toBeNull();
    expect(parseCardTrialAvailability(null)).toBeNull();
    expect(parseCardTrialAvailability('available')).toBeNull();
  });

  it('asks again when it has never asked, or was told no over an hour ago', () => {
    expect(shouldRecheckAvailability(null, NOW)).toBe(true);
    expect(shouldRecheckAvailability({ state: 'unavailable', checkedAt: '2026-11-20T10:59:00Z' }, NOW)).toBe(true);
    expect(shouldRecheckAvailability({ state: 'unavailable', checkedAt: '2026-11-20T11:30:00Z' }, NOW)).toBe(false);
    expect(shouldRecheckAvailability({ state: 'unavailable', checkedAt: 'junk' }, NOW)).toBe(true);
  });

  it('does not keep asking once it is on', () => {
    expect(shouldRecheckAvailability({ state: 'available', checkedAt: '2026-01-01T00:00:00Z' }, NOW)).toBe(false);
  });

  it('knows the refusals that mean "not turned on for this account"', () => {
    expect(bachsAccessDenied(403, 'SUBSCRIPTIONS_NOT_ENABLED')).toBe(true);
    expect(bachsAccessDenied(403, 'TRIALS_NOT_ENABLED')).toBe(true);
    expect(bachsAccessDenied(403, 'NGN_SUBSCRIPTIONS_NOT_AVAILABLE')).toBe(true);
    expect(bachsAccessDenied(403, null)).toBe(true);
    expect(bachsAccessDenied(400, 'VALIDATION_ERROR')).toBe(false);
    expect(bachsAccessDenied(500, null)).toBe(false);
  });
});

describe('the Bachs product', () => {
  it('is a dollar price that renews each month or year, with the free days on it', () => {
    expect(cardTrialProductBody({ planName: 'Solo Plus', period: 'monthly', amountMinor: 1900, trialDays: 3 })).toEqual({
      name: 'Urganize Solo Plus, monthly',
      price: { price_type: 'fixed', amount: '19.00', currency: 'USD' },
      billing_cycle: { interval: 'month', frequency: 1 },
      trial_period: { interval: 'day', frequency: 3 },
    });
    expect(cardTrialProductBody({ planName: 'Pro', period: 'annual', amountMinor: 79000, trialDays: 3 }).billing_cycle).toEqual({
      interval: 'year',
      frequency: 1,
    });
  });

  it('leaves the trial off when there are no free days', () => {
    expect(cardTrialProductBody({ planName: 'Solo', period: 'monthly', amountMinor: 900, trialDays: 0 })).not.toHaveProperty(
      'trial_period'
    );
  });
});

describe('reading a Bachs subscription', () => {
  const raw = {
    id: 'sub_1',
    customer: { customer_id: 'cust_1', email: 'a@b.co' },
    status: 'trialing',
    currency: 'USD',
    amount: '19.00',
    trial_end: '2026-11-23T12:00:00Z',
    current_period_end: '2026-11-23T12:00:00Z',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { reference: 'urganize_bt_1', user_id: 'u1', checkout_id: 'chk_1' },
  };

  it('keeps what we act on', () => {
    expect(parseBachsSubscription(raw)).toEqual({
      id: 'sub_1',
      customerId: 'cust_1',
      status: 'trialing',
      currency: 'USD',
      amountMinor: 1900,
      trialEnd: '2026-11-23T12:00:00Z',
      currentPeriodEnd: '2026-11-23T12:00:00Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      reference: 'urganize_bt_1',
      checkoutId: 'chk_1',
    });
  });

  it('reads the event shape too (subscription_id, not id)', () => {
    const { id: _id, ...rest } = raw;
    expect(parseBachsSubscription({ ...rest, subscription_id: 'sub_9' })?.id).toBe('sub_9');
  });

  it('refuses anything without an id, and treats a status it does not know as unknown', () => {
    expect(parseBachsSubscription({ status: 'active' })).toBeNull();
    expect(parseBachsSubscription(null)).toBeNull();
    expect(parseBachsSubscription({ ...raw, status: 'on_fire' })?.status).toBe('unknown');
  });

  it('knows which statuses still have a card that will be charged', () => {
    expect(isLiveBachsStatus('trialing')).toBe(true);
    expect(isLiveBachsStatus('active')).toBe(true);
    expect(isLiveBachsStatus('past_due')).toBe(true);
    expect(isLiveBachsStatus('canceled')).toBe(false);
    expect(isLiveBachsStatus('pending')).toBe(false);
  });

  it('ends access at the trial end while trialing, at the period end after', () => {
    const sub = parseBachsSubscription(raw)!;
    expect(subscriptionAccessEnd(sub)).toBe('2026-11-23T12:00:00Z');
    expect(subscriptionAccessEnd({ ...sub, status: 'active', currentPeriodEnd: '2026-12-23T12:00:00Z' })).toBe(
      '2026-12-23T12:00:00Z'
    );
    expect(subscriptionAccessEnd({ ...sub, trialEnd: null, currentPeriodEnd: null })).toBeNull();
  });
});

describe('the team stays open while the card is charged', () => {
  const sub = { status: 'trialing', trialEnd: '2026-11-23T12:00:00Z', currentPeriodEnd: '2026-11-23T12:00:00Z' } as const;

  it('gives a day past the trial end, so the charge can land before the wall', () => {
    expect(teamTrialEndFor({ ...sub, cancelAtPeriodEnd: false })).toBe('2026-11-24T12:00:00.000Z');
  });

  it('ends on the day when the trial was cancelled', () => {
    expect(teamTrialEndFor({ ...sub, cancelAtPeriodEnd: true })).toBe('2026-11-23T12:00:00.000Z');
  });

  it('says nothing when Bachs gave no date', () => {
    expect(teamTrialEndFor({ status: 'trialing', trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false })).toBeNull();
  });
});

describe('reading webhook events', () => {
  it('finds the subscription in subscription and invoice events', () => {
    expect(subscriptionIdFromEvent({ id: 'e', type: 'customer.subscription.created', data: { subscription_id: 'sub_1' } })).toBe(
      'sub_1'
    );
    expect(
      subscriptionIdFromEvent({ id: 'e', type: 'invoice.paid', data: { subscription: { subscription_id: 'sub_2' } } })
    ).toBe('sub_2');
    expect(subscriptionIdFromEvent({ id: 'e', type: 'checkout.completed', data: { reference: 'x' } })).toBeNull();
    expect(subscriptionIdFromEvent({ id: 'e', type: 'invoice.paid', data: {} })).toBeNull();
  });

  it('reads a paid invoice, and only a paid one with money on it', () => {
    const event = {
      id: 'e',
      type: 'invoice.paid',
      data: {
        invoice_id: 'inv_1',
        subscription: { subscription_id: 'sub_1' },
        status: 'paid',
        currency: 'USD',
        amount_paid: '19.00',
        period_end: '2026-12-23T12:00:00Z',
      },
    };
    expect(invoiceFromEvent(event)).toEqual({
      invoiceId: 'inv_1',
      subscriptionId: 'sub_1',
      amountMinor: 1900,
      periodEnd: '2026-12-23T12:00:00Z',
    });
    expect(invoiceFromEvent({ ...event, data: { ...event.data, amount_paid: '0.00' } })).toBeNull();
    expect(invoiceFromEvent({ ...event, data: { ...event.data, status: 'open' } })).toBeNull();
    expect(invoiceFromEvent({ ...event, type: 'invoice.payment_failed' })).toBeNull();
    expect(invoiceFromEvent({ ...event, data: { ...event.data, invoice_id: '' } })).toBeNull();
  });
});

describe('the words', () => {
  it('writes dollars the short way', () => {
    expect(formatUsd(19)).toBe('$19');
    expect(formatUsd(8.5)).toBe('$8.50');
  });

  it('writes the charge day as a day and a month', () => {
    expect(formatChargeDay('2026-11-16T09:00:00Z')).toBe('16 November');
    expect(formatChargeDay('junk')).toBe('');
    expect(formatChargeDay(null)).toBe('');
  });

  it('says what the offer is, with nothing owed today', () => {
    const copy = cardTrialOfferCopy({ planName: 'Solo Plus', amountUsd: 19, period: 'monthly', trialDays: 3, now: NOW });
    expect(copy.title).toBe('Try Solo Plus free for 3 days');
    expect(copy.today).toBe('$0');
    expect(copy.thenLabel).toBe('From 23 November');
    expect(copy.thenValue).toBe('$19 a month');
    expect(cardTrialOfferCopy({ planName: 'Pro', amountUsd: 790, period: 'annual', trialDays: 3, now: NOW }).thenValue).toBe(
      '$790 a year'
    );
  });

  it('reminds once, the day before the first charge, and never after a cancel', () => {
    const base = { status: 'trialing', trialEnd: '2026-11-21T10:00:00Z', cancelAtPeriodEnd: false, reminderSentAt: null, now: NOW };
    expect(cardTrialReminderDue(base)).toBe(true);
    expect(cardTrialReminderDue({ ...base, trialEnd: '2026-11-23T12:00:00Z' })).toBe(false);
    expect(cardTrialReminderDue({ ...base, trialEnd: '2026-11-20T11:00:00Z' })).toBe(false);
    expect(cardTrialReminderDue({ ...base, cancelAtPeriodEnd: true })).toBe(false);
    expect(cardTrialReminderDue({ ...base, reminderSentAt: '2026-11-20T08:00:00Z' })).toBe(false);
    expect(cardTrialReminderDue({ ...base, status: 'active' })).toBe(false);
    expect(cardTrialReminderDue({ ...base, trialEnd: null })).toBe(false);
  });

  it('writes the reminder in plain words, with the way out in it', () => {
    const copy = cardTrialReminderCopy({
      planName: 'Solo Plus',
      amountUsd: 19,
      trialEnd: '2026-11-21T10:00:00Z',
      cancelUrl: 'https://team.urganize.app/dashboard?settings=billing',
    });
    expect(copy.subject).toBe('Your trial ends on 21 November');
    expect(copy.body).toContain('We will charge $19 to your card');
    expect(copy.body).toContain('[Cancel here](https://team.urganize.app/dashboard?settings=billing)');
    expect(copy.body).not.toMatch(/—|workspace/i);
  });
});
