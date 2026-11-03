import { describe, expect, it } from 'vitest';
import {
  applyTransferToInvoice,
  buildChecklist,
  checklistDaysLeft,
  checklistSummary,
  checkoutPath,
  creditToApply,
  invoiceRemainingKobo,
  isChecklistVisible,
  normalizePromo,
  nudgeEmailCopy,
  offersSetupCall,
  parseHelpRequest,
  renewalEmailCopy,
  parseCheckoutIntent,
  partPaidCopy,
  periodAmount,
  periodHeadline,
  introSubline,
  periodSaving,
  periodsForMethod,
  pickNudge,
  readPendingCheckout,
  renewalBannerText,
  renewalReminderDue,
  youGet,
  type ChecklistFacts,
} from './self-serve';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-22T09:00:00Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

describe('checkout intent', () => {
  it('defaults to Manager monthly', () => {
    expect(parseCheckoutIntent({})).toEqual({ plan: 'manager', period: 'monthly', promo: null });
  });

  it('keeps a real plan, period and code', () => {
    expect(parseCheckoutIntent({ plan: 'solo', period: 'semiannual', promo: ' soundwave ' })).toEqual({
      plan: 'solo',
      period: 'semiannual',
      promo: 'SOUNDWAVE',
    });
  });

  it('refuses a plan nobody can buy here', () => {
    expect(parseCheckoutIntent({ plan: 'enterprise' }).plan).toBe('manager');
    expect(parseCheckoutIntent({ period: 'weekly' }).period).toBe('monthly');
  });

  it('drops a code that is not one', () => {
    expect(normalizePromo('a')).toBeNull();
    expect(normalizePromo('two words')).toBeNull();
    expect(normalizePromo(42)).toBeNull();
  });

  it('reads the intent kept on the account', () => {
    expect(readPendingCheckout({ pending_checkout: { plan: 'manager', period: 'annual' } })).toEqual({
      plan: 'manager',
      period: 'annual',
      promo: null,
    });
    expect(readPendingCheckout({ pending_checkout: { plan: 'nope' } })).toBeNull();
    expect(readPendingCheckout(null)).toBeNull();
  });

  it('builds the checkout link', () => {
    expect(checkoutPath({ plan: 'manager', period: 'semiannual', promo: 'SOUNDWAVE' })).toBe(
      '/checkout?plan=manager&period=semiannual&promo=SOUNDWAVE'
    );
  });
});

describe('amounts come from the pricing package', () => {
  it('Manager', () => {
    expect(periodAmount('manager', 'monthly')).toBe(40_000);
    expect(periodAmount('manager', 'monthly', 1)).toBe(24_000);
    expect(periodAmount('manager', 'semiannual')).toBe(200_000);
    expect(periodAmount('manager', 'annual')).toBe(400_000);
  });

  it('Solo', () => {
    expect(periodAmount('solo', 'monthly')).toBe(4_000);
    expect(periodAmount('solo', 'monthly', 1)).toBe(2_600);
    expect(periodAmount('solo', 'semiannual')).toBe(20_000);
    expect(periodAmount('solo', 'annual')).toBe(40_000);
  });

  it('says the price and the saving plainly', () => {
    expect(periodHeadline('manager', 'monthly')).toBe('₦40,000 a month');
    expect(periodHeadline('solo', 'monthly', 1)).toBe('₦2,600 a month');
    expect(introSubline('solo', 'monthly', 1)).toBe('For your first month, then ₦4,000 a month.');
    expect(periodHeadline('manager', 'semiannual')).toBe('₦200,000 for 6 months');
    expect(periodHeadline('manager', 'annual')).toBe('₦400,000 a year');
    expect(periodSaving('semiannual')).toBe('One month free');
    expect(periodSaving('monthly')).toBeNull();
  });

  it('lists what Manager gets', () => {
    expect(youGet('manager', false)).toEqual([
      { label: 'Artists', value: '3' },
      { label: 'People on your team', value: '5' },
      { label: 'AI credits', value: '660 / mo' },
    ]);
    expect(youGet('manager', true).at(-1)).toEqual({ label: 'Distribution', value: 'Partner' });
  });

  it('hides a card period with no Paystack plan, never a transfer one', () => {
    expect(periodsForMethod('card', ['monthly', 'annual'])).toEqual(['monthly', 'annual']);
    expect(periodsForMethod('transfer', [])).toEqual(['monthly', 'annual']);
  });
});

describe('a transfer never opens a team on part payment', () => {
  const invoice = { amountKobo: 150_000_00, creditAppliedKobo: 0, paidKobo: 0 };

  it('settles on the exact amount', () => {
    expect(applyTransferToInvoice(invoice, 150_000_00)).toEqual({
      paidKobo: 150_000_00,
      settled: true,
      remainingKobo: 0,
      overpaidKobo: 0,
    });
  });

  it('stays open on a part payment and says what is left', () => {
    const first = applyTransferToInvoice(invoice, 100_000_00);
    expect(first.settled).toBe(false);
    expect(first.remainingKobo).toBe(50_000_00);
    const second = applyTransferToInvoice({ ...invoice, paidKobo: first.paidKobo }, 50_000_00);
    expect(second.settled).toBe(true);
  });

  it('keeps an overpayment as credit', () => {
    expect(applyTransferToInvoice(invoice, 160_000_00).overpaidKobo).toBe(10_000_00);
  });

  it('counts carried credit toward the amount', () => {
    const withCredit = { ...invoice, creditAppliedKobo: 10_000_00 };
    expect(invoiceRemainingKobo(withCredit)).toBe(140_000_00);
    expect(applyTransferToInvoice(withCredit, 140_000_00).settled).toBe(true);
  });

  it('ignores a nonsense amount', () => {
    expect(applyTransferToInvoice(invoice, -5).settled).toBe(false);
    expect(applyTransferToInvoice(invoice, Number.NaN).paidKobo).toBe(0);
  });

  it('never applies more credit than the invoice', () => {
    expect(creditToApply(100, 500)).toBe(100);
    expect(creditToApply(100, -5)).toBe(0);
  });

  it('words the part payment', () => {
    expect(partPaidCopy(50_000_00, 100_000_00)).toEqual({
      title: '₦50,000 still to pay.',
      body: 'We got ₦100,000. Send the rest to the same account and your team opens.',
    });
  });
});

describe('renewal reminders', () => {
  it('sends 7, then 3, then 1 day before', () => {
    expect(renewalReminderDue({ expiresAt: daysFromNow(7), now: NOW, sentKeys: [] })?.days).toBe(7);
    expect(renewalReminderDue({ expiresAt: daysFromNow(3), now: NOW, sentKeys: [] })?.days).toBe(3);
    expect(renewalReminderDue({ expiresAt: daysFromNow(1), now: NOW, sentKeys: [] })?.days).toBe(1);
  });

  it('sends nothing earlier than 7 days, or after the end', () => {
    expect(renewalReminderDue({ expiresAt: daysFromNow(10), now: NOW, sentKeys: [] })).toBeNull();
    expect(renewalReminderDue({ expiresAt: daysFromNow(-1), now: NOW, sentKeys: [] })).toBeNull();
    expect(renewalReminderDue({ expiresAt: null, now: NOW, sentKeys: [] })).toBeNull();
  });

  it('sends each one once, and only the tightest after a missed day', () => {
    const due = renewalReminderDue({ expiresAt: daysFromNow(3), now: NOW, sentKeys: [] });
    expect(due?.days).toBe(3);
    expect(renewalReminderDue({ expiresAt: daysFromNow(3), now: NOW, sentKeys: [due!.key] })).toBeNull();
  });

  it('words the banner', () => {
    expect(renewalBannerText('manager', 3)).toEqual({
      title: 'Pro ends in 3 days.',
      body: 'Renew to keep your team working.',
    });
    expect(renewalBannerText('solo', 1).title).toBe('Emerging ends tomorrow.');
  });
});

describe('the first 14 days', () => {
  const facts: ChecklistFacts = {
    plan: 'manager',
    rolloutCount: 1,
    doneTasks: 1,
    hasCoverAndDetails: false,
    invitedSomeone: false,
    distributionStarted: false,
    distributionOn: false,
  };

  it('has four steps for Manager, three for Solo', () => {
    expect(buildChecklist(facts).map((step) => step.id)).toEqual(['rollout', 'cover', 'tasks', 'invite']);
    expect(buildChecklist({ ...facts, plan: 'solo' }).map((step) => step.id)).toEqual(['rollout', 'cover', 'tasks']);
  });

  it('adds distribution only while it is on', () => {
    expect(buildChecklist({ ...facts, distributionOn: true }).at(-1)?.id).toBe('distribute');
  });

  it('counts tasks toward three', () => {
    const tasks = buildChecklist(facts).find((step) => step.id === 'tasks');
    expect(tasks).toMatchObject({ done: false, progress: '1 / 3' });
    expect(buildChecklist({ ...facts, doneTasks: 3 }).find((step) => step.id === 'tasks')?.done).toBe(true);
  });

  it('sums up', () => {
    const steps = buildChecklist({ ...facts, hasCoverAndDetails: true });
    expect(checklistSummary(steps, 11)).toBe('2 of 4 done · 11 days left');
  });

  it('counts days from the team', () => {
    expect(checklistDaysLeft(new Date(NOW.getTime() - 3 * DAY).toISOString(), NOW)).toBe(11);
    expect(checklistDaysLeft(new Date(NOW.getTime() - 20 * DAY).toISOString(), NOW)).toBe(0);
  });

  it('hides once closed or past 14 days', () => {
    expect(isChecklistVisible({ hiddenAfter: null, daysLeft: 5, now: NOW })).toBe(true);
    expect(isChecklistVisible({ hiddenAfter: daysFromNow(-1), daysLeft: 5, now: NOW })).toBe(false);
    expect(isChecklistVisible({ hiddenAfter: daysFromNow(1), daysLeft: 5, now: NOW })).toBe(true);
    expect(isChecklistVisible({ hiddenAfter: null, daysLeft: 0, now: NOW })).toBe(false);
  });
});

describe('nudges', () => {
  const created = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
  const facts = { plan: 'manager' as const, rolloutCount: 0, doneTasks: 0, invitedSomeone: false, hasCoverAndDetails: false };

  it('day 1 only with no rollout', () => {
    expect(pickNudge({ teamCreatedAt: created(1), now: NOW, facts, sentKeys: [] })).toEqual({ key: 'day1', variant: 'rollout' });
    expect(pickNudge({ teamCreatedAt: created(1), now: NOW, facts: { ...facts, rolloutCount: 1 }, sentKeys: [] })).toBeNull();
  });

  it('day 3 only with fewer than 3 tasks done', () => {
    expect(pickNudge({ teamCreatedAt: created(3), now: NOW, facts: { ...facts, rolloutCount: 1 }, sentKeys: [] })?.key).toBe('day3');
    expect(
      pickNudge({ teamCreatedAt: created(3), now: NOW, facts: { ...facts, rolloutCount: 1, doneTasks: 3 }, sentKeys: [] })
    ).toBeNull();
  });

  it('day 7 asks Manager to invite, and Solo for cover art', () => {
    const done = { ...facts, rolloutCount: 1, doneTasks: 5 };
    expect(pickNudge({ teamCreatedAt: created(7), now: NOW, facts: done, sentKeys: [] })).toEqual({ key: 'day7', variant: 'invite' });
    expect(pickNudge({ teamCreatedAt: created(7), now: NOW, facts: { ...done, plan: 'solo' }, sentKeys: [] })).toEqual({
      key: 'day7',
      variant: 'cover',
    });
    expect(pickNudge({ teamCreatedAt: created(7), now: NOW, facts: { ...done, invitedSomeone: true }, sentKeys: [] })).toBeNull();
  });

  it('sends each once and never late', () => {
    expect(pickNudge({ teamCreatedAt: created(1), now: NOW, facts, sentKeys: ['day1'] })).toBeNull();
    expect(pickNudge({ teamCreatedAt: created(5), now: NOW, facts, sentKeys: [] })?.key).toBe('day3');
    expect(pickNudge({ teamCreatedAt: created(6), now: NOW, facts, sentKeys: [] })).toBeNull();
    expect(pickNudge({ teamCreatedAt: null, now: NOW, facts, sentKeys: [] })).toBeNull();
  });
});

describe('email copy', () => {
  it('names the plan in the day 3 note and falls back without one', () => {
    expect(nudgeEmailCopy({ variant: 'tasks', plan: 'manager', releaseTitle: 'Free Mind', taskCount: 64 }).body).toContain(
      'Free Mind'
    );
    expect(nudgeEmailCopy({ variant: 'tasks', plan: 'manager', releaseTitle: null, taskCount: 0 }).body).not.toContain('null');
  });

  it('has a subject and a button for every nudge, with no em dashes', () => {
    for (const variant of ['rollout', 'tasks', 'invite', 'cover'] as const) {
      const copy = nudgeEmailCopy({ variant, plan: 'manager', releaseTitle: 'Free Mind', taskCount: 3 });
      expect(copy.subject.length).toBeGreaterThan(0);
      expect(copy.cta.length).toBeGreaterThan(0);
      expect(`${copy.subject}${copy.body}${copy.cta}`).not.toMatch(/\u2014|workspace|start free/i);
    }
  });

  it('says what a renewal costs and when the plan ends', () => {
    const copy = renewalEmailCopy({ plan: 'manager', expiresAt: '2026-10-24T22:59:00Z', amountNaira: 30000 });
    expect(copy.subject).toContain('Pro');
    expect(copy.body).toContain('30,000');
    expect(copy.body).not.toMatch(/\u2014/);
  });
});

describe('help form', () => {
  it('needs a topic and a message', () => {
    expect(parseHelpRequest({ message: 'hi' }).ok).toBe(false);
    expect(parseHelpRequest({ topic: 'billing', message: '   ' }).ok).toBe(false);
    expect(parseHelpRequest({ topic: 'billing', message: 'x'.repeat(2001) }).ok).toBe(false);
  });

  it('keeps our own page path and drops anything else', () => {
    const own = parseHelpRequest({ topic: 'rollouts', message: 'Stuck', pagePath: '/dashboard?release=1' });
    expect(own.ok && own.value.pagePath).toBe('/dashboard?release=1');
    const other = parseHelpRequest({ topic: 'rollouts', message: 'Stuck', pagePath: '//evil.example' });
    expect(other.ok && other.value.pagePath).toBeNull();
    const backslash = parseHelpRequest({ topic: 'rollouts', message: 'Stuck', pagePath: '/\\evil.example' });
    expect(backslash.ok && backslash.value.pagePath).toBeNull();
  });

  it('offers the setup call to Manager and Label only', () => {
    expect(offersSetupCall('manager')).toBe(true);
    expect(offersSetupCall('label')).toBe(true);
    expect(offersSetupCall('solo')).toBe(false);
    expect(offersSetupCall(null)).toBe(false);
  });
});
