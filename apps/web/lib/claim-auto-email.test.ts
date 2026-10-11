import { describe, expect, it } from 'vitest';
import {
  afterSend,
  claimEmailBudget,
  claimEmailIdempotencyKey,
  CLAIM_REMINDER_DAYS,
  decideAutoInvite,
  decideReminder,
  isClaimAutoEmailEnabled,
  latestInvite,
  MAX_CLAIM_EMAILS_PER_RUN,
  reminderDueAt,
  type AutoEmailCredit,
  type AutoEmailPerson,
  type AutoEmailRecord,
  type ClaimInviteHistory,
} from './claim-auto-email';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T08:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const daysAhead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function credit(over: Partial<AutoEmailCredit> = {}): AutoEmailCredit {
  return {
    submissionId: 's1',
    releaseId: 'r1',
    workspaceId: 'w1',
    email: 'Ada@Example.com',
    confirmedAccurate: true,
    personHidden: false,
    delivered: true,
    createdAt: daysAgo(20),
    ...over,
  };
}

function invite(over: Partial<ClaimInviteHistory> & { id: string }): ClaimInviteHistory {
  return {
    automatic: true,
    createdAt: daysAgo(8),
    usedAt: null,
    revokedAt: null,
    expiresAt: daysAhead(22),
    failedAttempts: 0,
    ...over,
  };
}

function record(over: Partial<AutoEmailRecord> = {}): AutoEmailRecord {
  return { kind: 'invite', status: 'sent', inviteId: 'i1', submissionId: 's1', sentAt: daysAgo(8), ...over };
}

function person(over: Partial<AutoEmailPerson> = {}): AutoEmailPerson {
  return {
    personId: 'p1',
    status: 'unclaimed',
    hasAccount: false,
    removed: false,
    seeded: false,
    credits: [credit()],
    invites: [],
    emails: [],
    ...over,
  };
}

/** A person who got the first email eight days ago and nothing since. */
const emailedLastWeek = (over: Partial<AutoEmailPerson> = {}) =>
  person({ invites: [invite({ id: 'i1' })], emails: [record()], ...over });

describe('the switch', () => {
  it('is off unless both the flag and the credits surface are on', () => {
    expect(isClaimAutoEmailEnabled({})).toBe(false);
    expect(isClaimAutoEmailEnabled({ NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL: 'true' })).toBe(false);
    expect(isClaimAutoEmailEnabled({ NEXT_PUBLIC_FEATURE_METADATA: 'true' })).toBe(false);
    expect(
      isClaimAutoEmailEnabled({ NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL: '1', NEXT_PUBLIC_FEATURE_METADATA: 'true' })
    ).toBe(false);
    expect(
      isClaimAutoEmailEnabled({ NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL: 'true', NEXT_PUBLIC_FEATURE_METADATA: 'true' })
    ).toBe(true);
  });
});

describe('who gets the first email', () => {
  it('a credited person with an unclaimed page, an email and a rollout that came out', () => {
    const decision = decideAutoInvite(person());
    expect(decision).toEqual({ kind: 'send', credit: credit(), email: 'ada@example.com' });
  });

  it('never somebody who asked to be taken off', () => {
    expect(decideAutoInvite(person({ removed: true }))).toEqual({ kind: 'skip', reason: 'removed' });
  });

  it('never a page that is claimed, or that has an account on it', () => {
    expect(decideAutoInvite(person({ status: 'claimed' }))).toEqual({ kind: 'skip', reason: 'claimed' });
    expect(decideAutoInvite(person({ hasAccount: true }))).toEqual({ kind: 'skip', reason: 'claimed' });
  });

  it('never twice: any first-email record counts, even one that failed or is stuck sending', () => {
    for (const status of ['sending', 'sent', 'suppressed', 'failed'] as const) {
      expect(decideAutoInvite(person({ emails: [record({ status })] })), status).toEqual({
        kind: 'skip',
        reason: 'already_emailed',
      });
    }
  });

  it('never a founder-seeded profile', () => {
    expect(decideAutoInvite(person({ seeded: true }))).toEqual({ kind: 'skip', reason: 'seeded' });
  });

  it('never once the owner (or anybody) sent or shared a link by hand, whatever state it is in', () => {
    for (const over of [{}, { revokedAt: daysAgo(1) }, { expiresAt: daysAgo(1) }]) {
      const decision = decideAutoInvite(person({ invites: [invite({ id: 'o1', automatic: false, ...over })] }));
      expect(decision).toEqual({ kind: 'skip', reason: 'owner_sent' });
    }
  });

  it('is not blocked by its own link from a send that will be tried again', () => {
    const decision = decideAutoInvite(person({ invites: [invite({ id: 'a1', automatic: true })] }));
    expect(decision.kind).toBe('send');
  });

  it('waits until the rollout has come out', () => {
    expect(decideAutoInvite(person({ credits: [credit({ delivered: false })] }))).toEqual({
      kind: 'skip',
      reason: 'not_delivered',
    });
  });

  it('skips credits not attested, hidden or with no team', () => {
    for (const over of [{ confirmedAccurate: false }, { personHidden: true }, { workspaceId: null }]) {
      expect(decideAutoInvite(person({ credits: [credit(over)] })).kind).toBe('skip');
    }
  });

  it('needs a real email on the credit', () => {
    for (const email of [null, '', 'not-an-email']) {
      expect(decideAutoInvite(person({ credits: [credit({ email })] }))).toEqual({ kind: 'skip', reason: 'no_email' });
    }
  });

  it('names the newest ready credit when there are several', () => {
    const older = credit({ submissionId: 's-old', releaseId: 'r-old', createdAt: daysAgo(90) });
    const newer = credit({ submissionId: 's-new', releaseId: 'r-new', createdAt: daysAgo(3) });
    const notOut = credit({ submissionId: 's-soon', delivered: false, createdAt: daysAgo(1) });
    const decision = decideAutoInvite(person({ credits: [older, newer, notOut] }));
    expect(decision.kind === 'send' && decision.credit.submissionId).toBe('s-new');
  });

  it('a person credited three times still gets one decision, so one email', () => {
    const credits = [credit({ submissionId: 'a' }), credit({ submissionId: 'b' }), credit({ submissionId: 'c' })];
    const first = decideAutoInvite(person({ credits }));
    expect(first.kind).toBe('send');
    // After the run records it, the same person is a skip for every credit.
    expect(decideAutoInvite(person({ credits, emails: [record({ status: 'sending' })] })).kind).toBe('skip');
  });
});

describe('the one reminder', () => {
  it('is due seven days after the first email went out', () => {
    expect(CLAIM_REMINDER_DAYS).toBe(7);
    expect(reminderDueAt('2026-10-01T09:00:00Z')?.toISOString()).toBe('2026-10-08T09:00:00.000Z');
    expect(reminderDueAt('not a date')).toBeNull();
  });

  it('goes after seven days to somebody who has not claimed, with a fresh link', () => {
    const decision = decideReminder(emailedLastWeek(), NOW);
    expect(decision).toEqual({ kind: 'send', credit: credit(), email: 'ada@example.com', firstLink: 'open' });
  });

  it('not a minute before the seven days are up', () => {
    const sentAt = new Date(NOW.getTime() - CLAIM_REMINDER_DAYS * DAY + 60_000).toISOString();
    expect(decideReminder(emailedLastWeek({ emails: [record({ sentAt })] }), NOW)).toEqual({
      kind: 'skip',
      reason: 'too_soon',
    });
    const onTheDot = new Date(NOW.getTime() - CLAIM_REMINDER_DAYS * DAY).toISOString();
    expect(decideReminder(emailedLastWeek({ emails: [record({ sentAt: onTheDot })] }), NOW).kind).toBe('send');
  });

  it('never more than one', () => {
    for (const status of ['sending', 'sent', 'suppressed', 'failed'] as const) {
      const emails = [record(), record({ kind: 'reminder', status, sentAt: daysAgo(1) })];
      expect(decideReminder(emailedLastWeek({ emails }), NOW), status).toEqual({
        kind: 'skip',
        reason: 'already_reminded',
      });
    }
  });

  it('only after a first email that really went out', () => {
    expect(decideReminder(person(), NOW)).toEqual({ kind: 'skip', reason: 'no_first_email' });
    for (const over of [{ status: 'failed' as const }, { status: 'suppressed' as const }, { status: 'sending' as const }, { sentAt: null }, { inviteId: null }]) {
      expect(decideReminder(emailedLastWeek({ emails: [record(over)] }), NOW)).toEqual({
        kind: 'skip',
        reason: 'no_first_email',
      });
    }
  });

  it('stops once they claimed, asked to go or have an account', () => {
    expect(decideReminder(emailedLastWeek({ status: 'claimed' }), NOW)).toEqual({ kind: 'skip', reason: 'claimed' });
    expect(decideReminder(emailedLastWeek({ hasAccount: true }), NOW)).toEqual({ kind: 'skip', reason: 'claimed' });
    expect(decideReminder(emailedLastWeek({ removed: true }), NOW)).toEqual({ kind: 'skip', reason: 'removed' });
  });

  it('stays out of it once the owner or anybody else made a link since', () => {
    const invites = [invite({ id: 'i1' }), invite({ id: 'o1', automatic: false, createdAt: daysAgo(2) })];
    expect(decideReminder(emailedLastWeek({ invites }), NOW)).toEqual({ kind: 'skip', reason: 'owner_took_over' });
  });

  it('stops on a used, turned-off or locked link', () => {
    const cases: Array<[Partial<ClaimInviteHistory>, string]> = [
      [{ usedAt: daysAgo(1) }, 'link_used'],
      [{ revokedAt: daysAgo(1) }, 'link_turned_off'],
      [{ failedAttempts: 5 }, 'link_locked'],
    ];
    for (const [over, reason] of cases) {
      expect(decideReminder(emailedLastWeek({ invites: [invite({ id: 'i1', ...over })] }), NOW)).toEqual({
        kind: 'skip',
        reason,
      });
    }
  });

  it('a link that ran out gets a new one rather than stopping', () => {
    const decision = decideReminder(emailedLastWeek({ invites: [invite({ id: 'i1', expiresAt: daysAgo(1) })] }), NOW);
    expect(decision.kind === 'send' && decision.firstLink).toBe('expired');
  });

  it('reads the newest automatic link, so a reminder retried after a refusal still goes', () => {
    // The first link was turned off when a reminder was minted and then refused
    // (over the day's limit); the newer, unsent link is the live one.
    const invites = [
      invite({ id: 'i1', revokedAt: daysAgo(1), createdAt: daysAgo(8) }),
      invite({ id: 'i2', createdAt: daysAgo(1) }),
    ];
    expect(decideReminder(emailedLastWeek({ invites }), NOW).kind).toBe('send');
  });

  it('needs the credit it named to still be there, attested, visible, out and with an email', () => {
    expect(decideReminder(emailedLastWeek({ credits: [] }), NOW)).toEqual({ kind: 'skip', reason: 'credit_gone' });
    expect(decideReminder(emailedLastWeek({ credits: [credit({ personHidden: true })] }), NOW)).toEqual({
      kind: 'skip',
      reason: 'credit_gone',
    });
    expect(decideReminder(emailedLastWeek({ credits: [credit({ delivered: false })] }), NOW)).toEqual({
      kind: 'skip',
      reason: 'not_delivered',
    });
    expect(decideReminder(emailedLastWeek({ credits: [credit({ email: null })] }), NOW)).toEqual({
      kind: 'skip',
      reason: 'no_email',
    });
  });
});

describe('the newest link', () => {
  it('is the latest by creation time, and none for an empty list', () => {
    expect(latestInvite([])).toBeNull();
    const picked = latestInvite([
      invite({ id: 'a', createdAt: daysAgo(5) }),
      invite({ id: 'b', createdAt: daysAgo(1) }),
      invite({ id: 'c', createdAt: daysAgo(3) }),
    ]);
    expect(picked?.id).toBe('b');
  });
});

describe('after the send', () => {
  it('sent is sent', () => {
    expect(afterSend({ ok: true })).toEqual({ kind: 'sent' });
  });

  it('an unsubscribed or bounced address is final', () => {
    expect(afterSend({ ok: false, skipped: true, reason: 'suppressed' })).toEqual({
      kind: 'final',
      status: 'suppressed',
      error: null,
    });
  });

  it('only a send that certainly reached nobody is tried again, and it stops the run', () => {
    expect(afterSend({ ok: false, skipped: true, reason: 'not_configured' })).toEqual({
      kind: 'retry',
      stopRun: true,
      error: 'not_configured',
    });
    expect(afterSend({ ok: false, error: 'Resend responded 429: daily quota' })).toMatchObject({
      kind: 'retry',
      stopRun: true,
    });
  });

  it('anything that may have gone out is final, so it can never go twice', () => {
    for (const error of ['Resend responded 500', 'Resend responded 422: invalid to', 'timeout', 'template_load_failed']) {
      expect(afterSend({ ok: false, error }), error).toMatchObject({ kind: 'final', status: 'failed' });
    }
  });
});

describe('the budget', () => {
  it('uses what the day has left after the bulk reserve, capped per run', () => {
    expect(claimEmailBudget({ dailyLimit: 100, sentToday: 0, reserve: 25 })).toBe(MAX_CLAIM_EMAILS_PER_RUN);
    expect(claimEmailBudget({ dailyLimit: 100, sentToday: 70, reserve: 25 })).toBe(5);
    expect(claimEmailBudget({ dailyLimit: 100, sentToday: 99, reserve: 25 })).toBe(0);
  });

  it('sends nothing when today cannot be counted', () => {
    expect(claimEmailBudget({ dailyLimit: 100, sentToday: null, reserve: 25 })).toBe(0);
  });

  it('keys each send to its own link', () => {
    expect(claimEmailIdempotencyKey('invite', 'i1')).toBe('claim-invite-i1');
    expect(claimEmailIdempotencyKey('reminder', 'i2')).toBe('claim-reminder-i2');
  });
});
