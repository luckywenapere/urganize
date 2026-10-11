import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRANT_RUN_BUDGET_MS,
  grantPushCopy,
  isGrantFeedEligible,
  lagosDay,
  programmeFromRow,
  suggestedRecently,
  type GrantProgrammeRow,
} from './weekly-run';
import { NOTIFICATION_CRON_BUDGET_MS, PUSH_FLUSH_BUDGET_MS, PUSH_SEND_TIMEOUT_MS, emailBudgetMs } from '@/lib/push-limits';

describe('lagosDay', () => {
  it('is an hour ahead of UTC, so 23:30 UTC is already tomorrow in Lagos', () => {
    expect(lagosDay(new Date('2026-10-11T23:30:00Z'))).toEqual({ today: '2026-10-12', weekday: 1 });
    expect(lagosDay(new Date('2026-10-11T22:59:00Z'))).toEqual({ today: '2026-10-11', weekday: 0 });
  });
});

describe('isGrantFeedEligible', () => {
  it('lets paying teams and our own staff team in', () => {
    expect(isGrantFeedEligible('paid')).toBe(true);
    expect(isGrantFeedEligible('allowlisted')).toBe(true);
  });

  it('keeps everyone else out, and an unknown never grants it', () => {
    for (const state of ['trial', 'grace', 'comped', 'credits_only', 'read_only', 'walled', '', null, undefined]) {
      expect(isGrantFeedEligible(state as string | null | undefined)).toBe(false);
    }
  });
});

describe('suggestedRecently', () => {
  const now = new Date('2026-10-11T08:00:00Z');
  it('is true inside six days and false after', () => {
    expect(suggestedRecently('2026-10-11T07:00:00Z', now)).toBe(true);
    expect(suggestedRecently('2026-10-05T08:00:01Z', now)).toBe(true);
    expect(suggestedRecently('2026-10-05T08:00:00Z', now)).toBe(false);
    expect(suggestedRecently('2026-10-04T08:00:00Z', now)).toBe(false);
  });
  it('treats nothing or nonsense as never', () => {
    expect(suggestedRecently(null, now)).toBe(false);
    expect(suggestedRecently('not a date', now)).toBe(false);
  });
});

describe('programmeFromRow', () => {
  const row: GrantProgrammeRow = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'a-fund',
    funder: 'A Funder',
    programme: 'A Fund',
    url: 'https://a.example',
    kind: 'grant',
    countries: ['NG'],
    applicant_types: ['individual'],
    needs: ['recording'],
    genres: null,
    stages: [],
    amount_min: '500.00',
    amount_max: 2000,
    currency: 'USD',
    status: 'open',
    opens_on: null,
    deadline_on: '2026-11-01',
    last_closed_on: null,
    recurring: null,
    summary: null,
    eligibility: 'Nigerian artists.',
    source_url: 'https://a.example/call',
    checked_on: '2026-10-11',
    active: true,
  };

  it('reads numeric strings as numbers and nulls as empty', () => {
    const p = programmeFromRow(row);
    expect(p.amountMin).toBe(500);
    expect(p.amountMax).toBe(2000);
    expect(p.genres).toEqual([]);
    expect(p.summary).toBe('');
    expect(p.recurring).toBe(false);
  });

  it('reads a missing active flag as not active', () => {
    expect(programmeFromRow({ ...row, active: null }).active).toBe(false);
    expect(programmeFromRow(row).active).toBe(true);
  });
});

describe('the cron keeps the grant run inside its minute', () => {
  const route = readFileSync(join(__dirname, '../../app/api/cron/notifications/route.ts'), 'utf8');

  it('bounds the run with its own budget', () => {
    expect(route).toMatch(/runWeeklyGrantSuggestions\([^)]*timeBudgetMs:\s*GRANT_RUN_BUDGET_MS/);
  });

  it('runs after the clock starts and before the push flush, so the pushes it queues go out the same morning', () => {
    const clock = route.indexOf('const startedAt = Date.now()');
    const grants = route.indexOf('runWeeklyGrantSuggestions(');
    const flush = route.indexOf('flushDueNotifications(');
    const drain = route.indexOf('drainEmailOutbox(');
    expect(clock).toBeGreaterThan(-1);
    expect(grants).toBeGreaterThan(clock);
    expect(flush).toBeGreaterThan(grants);
    expect(drain).toBeGreaterThan(flush);
  });

  it('still leaves the email drain real time when flush and grants both use their whole budget', () => {
    const worst = PUSH_FLUSH_BUDGET_MS + PUSH_SEND_TIMEOUT_MS + GRANT_RUN_BUDGET_MS;
    expect(emailBudgetMs(worst)).toBeGreaterThan(0);
    expect(worst).toBeLessThan(NOTIFICATION_CRON_BUDGET_MS);
  });
});

describe('grantPushCopy', () => {
  it('counts the grants, singular and plural', () => {
    expect(grantPushCopy(1).title).toBe('1 new grant for your team');
    expect(grantPushCopy(3).title).toBe('3 new grants for your team');
    expect(grantPushCopy(0).title).toBe('1 new grant for your team');
  });
  it('is short enough for a lock screen and names no person or funder', () => {
    for (const n of [1, 3]) {
      const { title, body } = grantPushCopy(n);
      expect(title.length).toBeLessThanOrEqual(40);
      expect(body.length).toBeLessThanOrEqual(80);
    }
  });
});
