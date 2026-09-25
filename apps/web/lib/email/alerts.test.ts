import { describe, it, expect } from 'vitest';
import {
  FOUNDER_ALERT_HEADLINE,
  buildFounderAlertFacts,
  founderBillingAlertSubject,
  type FounderAlertContext,
} from './alert-types';

// The pure half of the founder billing alert (subject, headline, the fact
// rows). React-free, so it lives here rather than in the render test. Moved
// verbatim from the old lib/billing-alert-templates.ts; this coverage moved too.

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

/** value for a label in the fact list, or undefined. */
const factValue = (facts: Array<[string, string]>, label: string): string | undefined =>
  facts.find(([l]) => l === label)?.[1];

describe('founderBillingAlertSubject', () => {
  it('leads with what happened and who, so a phone preview is actionable', () => {
    expect(founderBillingAlertSubject('paywall_hit', context)).toBe('Hit the wall: Midnight Records');
    expect(founderBillingAlertSubject('checkout_completed', context)).toBe('PAID: Midnight Records');
    expect(founderBillingAlertSubject('talk_to_us_clicked', context)).toBe(
      'Wants to talk: Midnight Records'
    );
    expect(founderBillingAlertSubject('payment_failed', context)).toBe(
      'CARD FAILED: Midnight Records'
    );
    expect(founderBillingAlertSubject('urgans_guard_tripped', context)).toBe(
      'UrgAns usage cap: Midnight Records'
    );
  });

  it('reads the swap alert as a task', () => {
    const subject = founderBillingAlertSubject('plan_change_requested', context);
    expect(subject).toContain('SWAP NEEDED');
    expect(subject).toContain('Midnight Records');
  });

  it('falls back to "Unnamed team" with no team on file', () => {
    expect(founderBillingAlertSubject('paywall_hit', { ...context, teamName: null })).toBe(
      'Hit the wall: Unnamed team'
    );
  });
});

describe('buildFounderAlertFacts', () => {
  it('carries team, owner, contact, age and investment', () => {
    const facts = buildFounderAlertFacts(context);
    expect(factValue(facts, 'Team')).toBe('Midnight Records');
    expect(factValue(facts, 'Owner')).toBe('Ada Obi');
    expect(factValue(facts, 'Contact')).toBe('ada@midnight.example');
    expect(factValue(facts, 'Days since signup')).toBe('12');
    expect(factValue(facts, 'Rollouts in trial')).toBe('3');
    expect(factValue(facts, 'Tasks in trial')).toBe('64');
    expect(factValue(facts, 'Plan viewed')).toBe('annual');
  });

  it('says "unknown" rather than a misleading zero when a count could not be read', () => {
    const facts = buildFounderAlertFacts({
      ...context,
      releasesDuringTrial: null,
      tasksDuringTrial: null,
      daysSinceSignup: null,
    });
    expect(factValue(facts, 'Rollouts in trial')).toBe('unknown');
    expect(factValue(facts, 'Tasks in trial')).toBe('unknown');
    expect(factValue(facts, 'Days since signup')).toBe('unknown');
  });

  it('degrades gracefully with no team or owner on file', () => {
    const facts = buildFounderAlertFacts({
      ...context,
      teamName: null,
      ownerName: null,
      ownerEmail: null,
    });
    expect(factValue(facts, 'Team')).toBe('Unnamed team');
    expect(factValue(facts, 'Owner')).toBe('Unknown owner');
    expect(factValue(facts, 'Contact')).toBe('no email on file');
  });

  it('formats the trial end as a date, and drops an unparseable one', () => {
    expect(factValue(buildFounderAlertFacts(context), 'Trial ends')).toBe('Sep 4, 2026');
    expect(factValue(buildFounderAlertFacts({ ...context, trialEndsAt: 'nonsense' }), 'Trial ends')).toBe(
      undefined
    );
  });

  it('carries a free-form note when one is set — where the deadline and the count live', () => {
    const facts = buildFounderAlertFacts({
      ...context,
      note: 'Downgrade to manager, effective 2026-09-30. Swap the Paystack subscription first.',
    });
    expect(factValue(facts, 'Note')).toContain('2026-09-30');
  });
});

describe('FOUNDER_ALERT_HEADLINE', () => {
  it('says access is not gone yet on a failed renewal', () => {
    expect(FOUNDER_ALERT_HEADLINE.payment_failed).toMatch(/still have access/i);
    expect(FOUNDER_ALERT_HEADLINE.payment_failed).toMatch(/read only/i);
  });

  it('states the policy once on the usage-cap alert', () => {
    expect(FOUNDER_ALERT_HEADLINE.urgans_guard_tripped).toMatch(/raise the cap/i);
  });
});
