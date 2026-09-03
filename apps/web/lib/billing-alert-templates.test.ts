import { describe, expect, it } from 'vitest';
import {
  buildFounderBillingAlertEmail,
  buildNotifyAdminEmail,
  type FounderAlertContext,
} from './billing-alert-templates';

const context: FounderAlertContext = {
  teamName: 'Midnight Records',
  ownerName: 'Ada Obi',
  ownerEmail: 'ada@midnight.example',
  daysSinceSignup: 12,
  releasesDuringTrial: 3,
  tasksDuringTrial: 64,
  planViewed: 'annual',
  trialEndsAt: '2026-09-04T00:00:00.000Z',
};

describe('buildFounderBillingAlertEmail', () => {
  it('leads the subject with what happened and who, so a phone preview is actionable', () => {
    expect(buildFounderBillingAlertEmail('paywall_hit', context).subject).toBe(
      'Hit the wall: Midnight Records'
    );
    expect(buildFounderBillingAlertEmail('checkout_completed', context).subject).toBe(
      'PAID: Midnight Records'
    );
    expect(buildFounderBillingAlertEmail('talk_to_us_clicked', context).subject).toBe(
      'Wants to talk: Midnight Records'
    );
  });

  it('carries every fact the spec asks for: team, owner, contact, age, and investment', () => {
    const email = buildFounderBillingAlertEmail('paywall_hit', context);
    for (const fragment of [
      'Midnight Records',
      'Ada Obi',
      'ada@midnight.example',
      '12',
      '3',
      '64',
    ]) {
      expect(email.text).toContain(fragment);
      expect(email.html).toContain(fragment);
    }
  });

  it('says "unknown" rather than a misleading zero when a count could not be read', () => {
    const email = buildFounderBillingAlertEmail('paywall_hit', {
      ...context,
      releasesDuringTrial: null,
      tasksDuringTrial: null,
      daysSinceSignup: null,
    });
    expect(email.text).toContain('Releases in trial: unknown');
    expect(email.text).toContain('Tasks in trial: unknown');
    expect(email.text).not.toContain('Releases in trial: 0');
  });

  it('degrades gracefully with no team or owner on file', () => {
    const email = buildFounderBillingAlertEmail('paywall_hit', {
      ...context,
      teamName: null,
      ownerName: null,
      ownerEmail: null,
    });
    expect(email.subject).toBe('Hit the wall: Unnamed team');
    expect(email.text).toContain('Unknown owner');
    expect(email.text).toContain('no email on file');
  });

  it('escapes anything the user typed', () => {
    const email = buildFounderBillingAlertEmail('paywall_hit', {
      ...context,
      teamName: '<script>alert(1)</script>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('formats the trial end as a date rather than an ISO string', () => {
    const email = buildFounderBillingAlertEmail('trial_ending_soon', context);
    expect(email.text).toContain('Sep 4, 2026');
    expect(email.text).not.toContain('2026-09-04T00:00:00.000Z');
  });

  it('drops an unparseable trial end instead of printing garbage', () => {
    const email = buildFounderBillingAlertEmail('trial_ending_soon', {
      ...context,
      trialEndsAt: 'nonsense',
    });
    expect(email.text).not.toContain('Trial ends');
  });
});

describe('buildNotifyAdminEmail', () => {
  const input = {
    requesterLabel: 'Tolu',
    teamName: 'Midnight Records',
    activateUrl: 'https://app.urganize.app/locked',
  };

  it('names the person asking, so it does not read as automated dunning', () => {
    const email = buildNotifyAdminEmail(input);
    expect(email.subject).toBe('Tolu is waiting on Midnight Records in Urganize');
    expect(email.text).toContain('Tolu');
  });

  it('reassures the admin that nothing was lost', () => {
    const email = buildNotifyAdminEmail(input);
    expect(email.text).toContain('still there');
    expect(email.html).toContain('still there');
  });

  it('links to where they actually activate', () => {
    expect(buildNotifyAdminEmail(input).html).toContain('https://app.urganize.app/locked');
  });

  it('falls back sensibly with no name or team', () => {
    const email = buildNotifyAdminEmail({
      ...input,
      requesterLabel: '',
      teamName: null,
    });
    expect(email.subject).toBe('A teammate is waiting on your team in Urganize');
  });

  it('escapes a hostile team name', () => {
    const email = buildNotifyAdminEmail({ ...input, requesterLabel: '<b>x</b>' });
    expect(email.html).not.toContain('<b>x</b>');
  });
});

// The founder's copy rules, enforced rather than reviewed. These bind the
// CUSTOMER-facing email only: the founder's internal alert is a lead sheet and
// is allowed to be terse.
describe('customer-facing copy rules', () => {
  const email = buildNotifyAdminEmail({
    requesterLabel: 'Tolu',
    teamName: 'Midnight Records',
    activateUrl: 'https://app.urganize.app/locked',
  });

  it('never says "workspace"', () => {
    expect(email.subject.toLowerCase()).not.toContain('workspace');
    expect(email.text.toLowerCase()).not.toContain('workspace');
    expect(email.html.toLowerCase()).not.toContain('workspace');
  });

  it('uses no em dashes', () => {
    expect(email.subject).not.toContain('—');
    expect(email.text).not.toContain('—');
    expect(email.html).not.toContain('—');
  });

  it('applies no pressure: no warnings, no deadlines, no loss language', () => {
    const body = `${email.subject} ${email.text}`.toLowerCase();
    for (const forbidden of ['immediately', 'urgent', 'will lose', 'suspended', 'failure']) {
      expect(body).not.toContain(forbidden);
    }
  });
});

// The swap alert is an ACTION, not a signal. Every other founder alert says
// something happened; this one says something is owed at Paystack before a date,
// and missing it charges a real customer the wrong amount.

describe('the plan-change swap alert', () => {
  it('carries a subject that reads as a task, and the note that names the deadline', () => {
    const email = buildFounderBillingAlertEmail('plan_change_requested', {
      teamName: 'Northside',
      ownerName: 'Ada',
      ownerEmail: 'ada@example.com',
      daysSinceSignup: 40,
      releasesDuringTrial: 3,
      tasksDuringTrial: 61,
      planViewed: 'label',
      note: 'Downgrade to manager (monthly), effective 2026-09-30. Swap the Paystack subscription BEFORE that date.',
    });
    expect(email.subject).toContain('SWAP NEEDED');
    expect(email.subject).toContain('Northside');
    // The deadline has to survive into the body, since the subject is all that
    // shows in a phone notification but the body is what gets acted on.
    expect(email.text).toContain('2026-09-30');
    expect(email.html).toContain('Northside');
  });
});

// ── The failed-renewal alert ────────────────────────────────────────────────
//
// Fired from invoice.payment_failed, which lands WHILE the team still has
// access: the snapshot treats past_due inside its period as paid, so Paystack is
// retrying and nothing has broken for the customer yet. That makes this the one
// billing moment where a recovery is cheap, and it is why the alert exists at
// all rather than waiting for the lapse.
describe('the failed-renewal alert', () => {
  it('reads as an action in a phone preview, and says access is not gone yet', () => {
    const email = buildFounderBillingAlertEmail('payment_failed', context);
    expect(email.subject).toBe('CARD FAILED: Midnight Records');
    for (const body of [email.text, email.html]) {
      expect(body).toContain('Midnight Records');
      expect(body).toContain('ada@midnight.example');
      // The two facts that decide whether the founder acts today or next week.
      expect(body).toMatch(/still have access/i);
      expect(body).toMatch(/read only/i);
    }
  });
});

// ── The UrgAns embedded-actions guard alert ─────────────────────────────────
//
// One team hit the daily cap on actions run inside a product function. The
// note is where the count and the cap actually live — the headline states the
// policy (raise the cap for real usage, look otherwise) once, not per-team.
describe('the UrgAns guard-tripped alert', () => {
  it('names the cap, states the two possible causes, and carries the count in the note', () => {
    const email = buildFounderBillingAlertEmail('urgans_guard_tripped', {
      ...context,
      note: '103 embedded actions in the last 24h (cap: 100).',
    });
    expect(email.subject).toBe('UrgAns usage cap: Midnight Records');
    for (const body of [email.text, email.html]) {
      expect(body).toContain('Midnight Records');
      expect(body).toMatch(/raise the cap/i);
      expect(body).toContain('103 embedded actions in the last 24h (cap: 100).');
    }
  });
});
