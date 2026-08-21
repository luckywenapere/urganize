import { describe, expect, it } from 'vitest';
import {
  BILLING_EVENT_TYPES,
  NOTIFY_ADMIN_MAX_PER_TEAM_PER_DAY,
  isBillingEventType,
  isBillingTrackRequest,
  resolveCheckoutSubject,
  resolveNotifyAdminDecision,
  resolveTrackOutcome,
} from './billing-events';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

describe('billing event types', () => {
  it('covers every event the spec asks to be logged', () => {
    for (const required of [
      'trial_started',
      'trial_extended',
      'paywall_hit',
      'paywall_return_visit',
      'talk_to_us_clicked',
      'checkout_started',
      'checkout_completed',
      'comped',
      'manually_marked_paid',
    ]) {
      expect(BILLING_EVENT_TYPES).toContain(required);
    }
  });

  it('guards unknown values', () => {
    expect(isBillingEventType('paywall_hit')).toBe(true);
    expect(isBillingEventType('nonsense')).toBe(false);
    expect(isBillingEventType(null)).toBe(false);
  });

  it('the client may only ask for the two neutral requests, never a paid state', () => {
    expect(isBillingTrackRequest('paywall_view')).toBe(true);
    expect(isBillingTrackRequest('talk_to_us')).toBe(true);
    expect(isBillingTrackRequest('checkout_completed')).toBe(false);
    expect(isBillingTrackRequest('comped')).toBe(false);
  });
});

describe('resolveTrackOutcome', () => {
  it('the first wall view for a team is the hit', () => {
    expect(
      resolveTrackOutcome({
        requested: 'paywall_view',
        hasPriorPaywallHit: false,
        lastReturnVisitAt: null,
        now: NOW,
      })
    ).toBe('paywall_hit');
  });

  it('a later view is a return visit — the renewed-interest signal', () => {
    expect(
      resolveTrackOutcome({
        requested: 'paywall_view',
        hasPriorPaywallHit: true,
        lastReturnVisitAt: null,
        now: NOW,
      })
    ).toBe('paywall_return_visit');
  });

  it('collapses repeat views on the same UTC day so one reload is not a dozen emails', () => {
    expect(
      resolveTrackOutcome({
        requested: 'paywall_view',
        hasPriorPaywallHit: true,
        lastReturnVisitAt: at(-2 * HOUR),
        now: NOW,
      })
    ).toBeNull();
  });

  it('records again the next day', () => {
    expect(
      resolveTrackOutcome({
        requested: 'paywall_view',
        hasPriorPaywallHit: true,
        lastReturnVisitAt: at(-26 * HOUR),
        now: NOW,
      })
    ).toBe('paywall_return_visit');
  });

  it('an unparseable last-visit timestamp records rather than swallowing the signal', () => {
    expect(
      resolveTrackOutcome({
        requested: 'paywall_view',
        hasPriorPaywallHit: true,
        lastReturnVisitAt: 'nonsense',
        now: NOW,
      })
    ).toBe('paywall_return_visit');
  });

  it('talk-to-us always records, including a second attempt', () => {
    expect(
      resolveTrackOutcome({
        requested: 'talk_to_us',
        hasPriorPaywallHit: true,
        lastReturnVisitAt: at(-1 * HOUR),
        now: NOW,
      })
    ).toBe('talk_to_us_clicked');
  });
});

describe('resolveNotifyAdminDecision', () => {
  it('allows the first ask', () => {
    expect(
      resolveNotifyAdminDecision({
        lastSameActorSentAt: null,
        workspaceSentTodayCount: 0,
        now: NOW,
      })
    ).toEqual({ allowed: true, alreadySent: false });
  });

  it('a repeat click by the same person is honestly reported as already sent', () => {
    expect(
      resolveNotifyAdminDecision({
        lastSameActorSentAt: at(-2 * HOUR),
        workspaceSentTodayCount: 1,
        now: NOW,
      })
    ).toEqual({ allowed: false, alreadySent: true });
  });

  it('lets them ask again after a day', () => {
    expect(
      resolveNotifyAdminDecision({
        lastSameActorSentAt: at(-25 * HOUR),
        workspaceSentTodayCount: 1,
        now: NOW,
      })
    ).toEqual({ allowed: true, alreadySent: false });
  });

  it('caps a large team so one owner inbox is not buried', () => {
    expect(
      resolveNotifyAdminDecision({
        lastSameActorSentAt: null,
        workspaceSentTodayCount: NOTIFY_ADMIN_MAX_PER_TEAM_PER_DAY,
        now: NOW,
      })
    ).toEqual({ allowed: false, alreadySent: true });
  });

  it('the last slot under the cap still sends', () => {
    expect(
      resolveNotifyAdminDecision({
        lastSameActorSentAt: null,
        workspaceSentTodayCount: NOTIFY_ADMIN_MAX_PER_TEAM_PER_DAY - 1,
        now: NOW,
      }).allowed
    ).toBe(true);
  });
});

describe('resolveCheckoutSubject', () => {
  const workspace = { ownerId: 'owner-1' };

  it('credits the team owner when the owner pays', () => {
    expect(
      resolveCheckoutSubject({
        flagOn: true,
        requesterId: 'owner-1',
        workspace,
        membershipRole: 'owner',
        membershipStatus: 'active',
      })
    ).toEqual({ subjectUserId: 'owner-1' });
  });

  it('credits the OWNER when an admin pays, or the money lands on the wrong account', () => {
    expect(
      resolveCheckoutSubject({
        flagOn: true,
        requesterId: 'admin-9',
        workspace,
        membershipRole: 'admin',
        membershipStatus: 'active',
      })
    ).toEqual({ subjectUserId: 'owner-1' });
  });

  it('refuses members and guests, who are shown the notify-admin path instead', () => {
    for (const role of ['member', 'guest', null]) {
      const result = resolveCheckoutSubject({
        flagOn: true,
        requesterId: 'member-3',
        workspace,
        membershipRole: role,
        membershipStatus: 'active',
      });
      expect('error' in result).toBe(true);
    }
  });

  it('refuses anyone whose membership is not active', () => {
    for (const status of ['invited', 'removed', null]) {
      const result = resolveCheckoutSubject({
        flagOn: true,
        requesterId: 'admin-9',
        workspace,
        membershipRole: 'admin',
        membershipStatus: status,
      });
      expect('error' in result).toBe(true);
    }
  });

  it('with the flag off, or with no team context, the requester pays for themselves as before', () => {
    expect(
      resolveCheckoutSubject({
        flagOn: false,
        requesterId: 'solo-1',
        workspace,
        membershipRole: 'member',
        membershipStatus: 'active',
      })
    ).toEqual({ subjectUserId: 'solo-1' });

    expect(
      resolveCheckoutSubject({
        flagOn: true,
        requesterId: 'solo-1',
        workspace: null,
        membershipRole: null,
        membershipStatus: null,
      })
    ).toEqual({ subjectUserId: 'solo-1' });
  });
});
