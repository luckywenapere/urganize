import { describe, expect, it } from 'vitest';
import {
  EMAIL_DRAIN_MAX_MS,
  EMAIL_SEND_SLACK_MS,
  NOTIFICATION_CRON_BUDGET_MS,
  PUSH_FLUSH_BUDGET_MS,
  PUSH_SEND_TIMEOUT_MS,
  emailBudgetMs,
} from '@/lib/push-limits';

/**
 * Time limits for sending pushes (2026-10-09, v1.92.11).
 *
 * The morning cron flushes pushes and then drains the email outbox in one 60
 * second function. A stuck push used to eat the clock and the emails never
 * went. The sums below keep both inside the minute.
 */

describe('emailBudgetMs', () => {
  it('gives the drain its full allowance when the flush used no time', () => {
    expect(emailBudgetMs(0)).toBe(EMAIL_DRAIN_MAX_MS);
    // The cap binds only while the plan has the room: 50s - 10s slack = 40s.
    expect(emailBudgetMs(500)).toBe(NOTIFICATION_CRON_BUDGET_MS - 500 - EMAIL_SEND_SLACK_MS);
  });

  it('gives the drain what is left, less room for the send in flight', () => {
    expect(emailBudgetMs(23_000)).toBe(NOTIFICATION_CRON_BUDGET_MS - 23_000 - EMAIL_SEND_SLACK_MS);
    expect(emailBudgetMs(23_000)).toBe(17_000);
  });

  it('never goes negative when the flush used everything', () => {
    expect(emailBudgetMs(NOTIFICATION_CRON_BUDGET_MS)).toBe(0);
    expect(emailBudgetMs(60_000)).toBe(0);
    expect(emailBudgetMs(10_000_000)).toBe(0);
  });

  it('treats an impossible clock reading as time already spent, never as free time', () => {
    expect(emailBudgetMs(Number.NaN)).toBe(0);
    expect(emailBudgetMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('treats a negative reading (clock skew) as no time spent', () => {
    expect(emailBudgetMs(-5_000)).toBe(EMAIL_DRAIN_MAX_MS);
  });

  it('never hands out more than it has, and shrinks as the flush grows', () => {
    let last = Number.POSITIVE_INFINITY;
    for (let elapsed = 0; elapsed <= 60_000; elapsed += 1_000) {
      const budget = emailBudgetMs(elapsed);
      expect(budget).toBeGreaterThanOrEqual(0);
      expect(budget).toBeLessThanOrEqual(EMAIL_DRAIN_MAX_MS);
      expect(budget).toBeLessThanOrEqual(last);
      last = budget;
    }
  });
});

describe('the limits fit inside the 60 second function', () => {
  it('a flush that uses its whole budget still leaves the drain real time', () => {
    expect(emailBudgetMs(PUSH_FLUSH_BUDGET_MS)).toBeGreaterThan(0);
  });

  it('the flush can overrun by one send and the drain still ends inside the plan', () => {
    const worstFlush = PUSH_FLUSH_BUDGET_MS + PUSH_SEND_TIMEOUT_MS;
    const worstEnd = worstFlush + emailBudgetMs(worstFlush) + EMAIL_SEND_SLACK_MS;
    expect(worstEnd).toBeLessThanOrEqual(NOTIFICATION_CRON_BUDGET_MS);
  });

  it('the plan leaves headroom under the function limit', () => {
    expect(NOTIFICATION_CRON_BUDGET_MS).toBeLessThan(60_000);
  });

  it('one push gives up well before the flush budget runs out', () => {
    expect(PUSH_SEND_TIMEOUT_MS).toBeLessThan(PUSH_FLUSH_BUDGET_MS);
  });
});
