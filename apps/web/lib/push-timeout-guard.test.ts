import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Push sends have time limits (2026-10-09, v1.92.11).
 *
 * Neither transport had a timeout, so a push service that went quiet held the
 * sender open: task assignments awaited it inside the request that made them,
 * and the morning cron flushed pushes before the email outbox in one 60 second
 * function. These read the real sources so a new send path cannot skip the
 * limit and a refactor cannot quietly drop it.
 */

function code(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('each push transport gives up on a slow service', () => {
  it('web push passes a timeout from the shared limits', () => {
    const source = code('lib/push-server.ts');
    expect(source).toContain("from '@/lib/push-limits'");
    expect(source).toMatch(/timeout:\s*PUSH_SEND_TIMEOUT_MS/);
  });

  it('every FCM request carries an abort signal from the shared limits', () => {
    const source = code('lib/fcm-server.ts');
    expect(source).toContain("from '@/lib/push-limits'");
    const fetches = source.match(/\bfetch\(/g)?.length ?? 0;
    const signals = source.match(/signal:\s*AbortSignal\.timeout\(PUSH_SEND_TIMEOUT_MS\)/g)?.length ?? 0;
    expect(fetches).toBeGreaterThanOrEqual(2);
    expect(signals).toBe(fetches);
  });
});

describe('the notification cron keeps both jobs inside its minute', () => {
  const route = code('app/api/cron/notifications/route.ts');

  it('bounds the push flush', () => {
    expect(route).toMatch(/flushDueNotifications\([^)]*timeBudgetMs:\s*PUSH_FLUSH_BUDGET_MS/);
  });

  it('gives the email drain only what the flush left', () => {
    expect(route).toMatch(/timeBudgetMs:\s*emailBudgetMs\(Date\.now\(\) - startedAt\)/);
  });

  it('starts the clock before the flush, not after it', () => {
    expect(route.indexOf('const startedAt = Date.now()')).toBeGreaterThan(-1);
    expect(route.indexOf('const startedAt = Date.now()')).toBeLessThan(route.indexOf('flushDueNotifications('));
  });

  it('still declares the 60 second limit the plan is built on', () => {
    expect(route).toContain('export const maxDuration = 60');
  });
});

describe('the flush itself stops on a clock', () => {
  const source = code('lib/engagement-server.ts');
  const flush = source.slice(source.indexOf('export async function flushDueNotifications('));

  it('checks the budget before starting each group', () => {
    expect(flush).toMatch(/Date\.now\(\) - started > timeBudgetMs\) break/);
  });

  it('falls back to a default budget', () => {
    expect(flush).toContain('options.timeBudgetMs ?? PUSH_FLUSH_BUDGET_MS');
  });

  it('claims each row before it sends, so a stopped flush leaves later rows still due', () => {
    expect(flush.indexOf("update({ sent_at")).toBeGreaterThan(-1);
    expect(flush.indexOf("update({ sent_at")).toBeLessThan(flush.indexOf('sendPushToUsers('));
  });
});
