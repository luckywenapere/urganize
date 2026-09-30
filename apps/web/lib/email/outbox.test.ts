import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BULK_RESERVE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_DELAY_MS,
  SEQUENCE_RESERVE,
  computeSendBudget,
  decideOutboxOutcome,
  isStaleSequenceRow,
  pickRowsForRun,
  planOutboxRun,
  readDailyEmailLimit,
  readOutboxTemplate,
  utcDayStart,
} from './outbox';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('decideOutboxOutcome', () => {
  it('marks a delivered-to-Resend send as sent', () => {
    expect(decideOutboxOutcome({ ok: true }, 0)).toEqual({ kind: 'sent' });
  });

  it('marks an unsubscribed address as skipped, never retried', () => {
    expect(decideOutboxOutcome({ ok: false, skipped: true, reason: 'suppressed' }, 0)).toEqual({
      kind: 'skipped',
      reason: 'suppressed',
    });
  });

  it('puts the row back and stops the run when email is not configured', () => {
    const outcome = decideOutboxOutcome({ ok: false, skipped: true, reason: 'not_configured' }, 0);
    expect(outcome).toMatchObject({ kind: 'requeue', countAttempt: false, stopRun: true });
  });

  it('treats a 429 (rate or daily limit) as "try again later", without spending an attempt', () => {
    const outcome = decideOutboxOutcome({ ok: false, error: 'Resend responded 429: daily_quota_exceeded' }, 2);
    expect(outcome).toMatchObject({ kind: 'requeue', countAttempt: false, stopRun: true });
  });

  it('fails a 4xx other than 429 straight away, since sending again cannot fix it', () => {
    expect(decideOutboxOutcome({ ok: false, error: 'Resend responded 422: invalid to' }, 0)).toMatchObject({
      kind: 'failed',
    });
  });

  it('fails a template or render problem straight away', () => {
    expect(decideOutboxOutcome({ ok: false, error: 'template_load_failed' }, 0).kind).toBe('failed');
    expect(decideOutboxOutcome({ ok: false, error: 'render: boom' }, 0).kind).toBe('failed');
  });

  it('retries a 5xx or a timeout an hour later, spending an attempt', () => {
    for (const error of ['Resend responded 503', 'Timed out after 10000ms', 'fetch failed']) {
      expect(decideOutboxOutcome({ ok: false, error }, 0)).toEqual({
        kind: 'requeue',
        countAttempt: true,
        stopRun: false,
        retryAfterMs: OUTBOX_RETRY_DELAY_MS,
        error,
      });
    }
  });

  it('gives up once the attempts are spent', () => {
    expect(
      decideOutboxOutcome({ ok: false, error: 'Resend responded 503' }, OUTBOX_MAX_ATTEMPTS - 1).kind
    ).toBe('failed');
  });
});

describe('computeSendBudget', () => {
  it('leaves the reserve free for everyday mail like invites', () => {
    expect(computeSendBudget({ dailyLimit: 100, sentToday: 10, reserve: 25 })).toBe(65);
  });

  it('never goes below zero', () => {
    expect(computeSendBudget({ dailyLimit: 100, sentToday: 99, reserve: 25 })).toBe(0);
  });

  it('keeps more back for bulk sends than for the sequence', () => {
    expect(BULK_RESERVE).toBeGreaterThan(SEQUENCE_RESERVE);
  });
});

describe('readDailyEmailLimit', () => {
  it('defaults to the free plan limit of 100', () => {
    vi.stubEnv('EMAIL_DAILY_LIMIT', '');
    expect(readDailyEmailLimit()).toBe(100);
  });

  it('reads a positive whole number and ignores anything else', () => {
    vi.stubEnv('EMAIL_DAILY_LIMIT', '5000');
    expect(readDailyEmailLimit()).toBe(5000);
    vi.stubEnv('EMAIL_DAILY_LIMIT', 'lots');
    expect(readDailyEmailLimit()).toBe(100);
    vi.stubEnv('EMAIL_DAILY_LIMIT', '-3');
    expect(readDailyEmailLimit()).toBe(100);
  });
});

describe('pickRowsForRun', () => {
  const seq = (id: string, recipient: string) => ({ id, recipient, batch_id: null });
  const bulk = (id: string, recipient: string) => ({ id, recipient, batch_id: 'b1' });

  it('sends a person at most one sequence email per run', () => {
    const picked = pickRowsForRun([seq('1', 'a@x.test'), seq('2', 'a@x.test'), seq('3', 'b@x.test')], 10);
    expect(picked.map((row) => row.id)).toEqual(['1', '3']);
  });

  it('does not let a sequence email block a bulk email to the same person', () => {
    const picked = pickRowsForRun([seq('1', 'a@x.test'), bulk('2', 'a@x.test')], 10);
    expect(picked.map((row) => row.id)).toEqual(['1', '2']);
  });

  it('stops at the budget', () => {
    const picked = pickRowsForRun([bulk('1', 'a@x.test'), bulk('2', 'b@x.test'), bulk('3', 'c@x.test')], 2);
    expect(picked.map((row) => row.id)).toEqual(['1', '2']);
  });

  it('picks nothing with no budget', () => {
    expect(pickRowsForRun([bulk('1', 'a@x.test')], 0)).toEqual([]);
  });
});

describe('isStaleSequenceRow', () => {
  const now = new Date('2026-10-10T08:00:00Z');

  it('drops a sequence email that is days overdue rather than sending it out of context', () => {
    expect(isStaleSequenceRow({ batch_id: null, send_after: '2026-10-01T00:00:00Z' }, now)).toBe(true);
    expect(isStaleSequenceRow({ batch_id: null, send_after: '2026-10-09T00:00:00Z' }, now)).toBe(false);
  });

  it('never drops a bulk email for being late', () => {
    expect(isStaleSequenceRow({ batch_id: 'b1', send_after: '2026-09-01T00:00:00Z' }, now)).toBe(false);
  });
});

describe('planOutboxRun', () => {
  const now = new Date('2026-10-02T08:00:00Z');
  const seq = (id: string, recipient: string, send_after = '2026-10-02T00:00:00Z') => ({
    id,
    recipient,
    batch_id: null,
    template: 'onboarding_step',
    send_after,
  });
  const bulk = (id: string, recipient: string) => ({
    id,
    recipient,
    batch_id: 'b1',
    template: 'announcement',
    send_after: '2026-10-01T00:00:00Z',
  });
  const plan = (due: ReturnType<typeof seq | typeof bulk>[], overrides: Partial<Parameters<typeof planOutboxRun>[0]> = {}) =>
    planOutboxRun({ due, sequenceEnabled: true, now, sentToday: 0, dailyLimit: 100, maxSends: 50, ...overrides });

  it('sends the sequence first, then the broadcast', () => {
    const result = plan([bulk('b', 'x@x.test'), seq('s', 'y@y.test')]);
    expect(result.send.map((row) => row.id)).toEqual(['s', 'b']);
    expect(result.limited).toBe(false);
  });

  it('leaves sequence rows waiting while the sequence is switched off, but still sends broadcasts', () => {
    const result = plan([seq('s', 'y@y.test'), bulk('b', 'x@x.test')], { sequenceEnabled: false });
    expect(result.send.map((row) => row.id)).toEqual(['b']);
    expect(result.paused).toBe(1);
  });

  it('cancels a sequence email that fell days behind instead of sending it', () => {
    const result = plan([seq('old', 'y@y.test', '2026-09-20T00:00:00Z')]);
    expect(result.send).toEqual([]);
    expect(result.cancelStale.map((row) => row.id)).toEqual(['old']);
  });

  it('holds broadcasts back to keep room for everyday mail, and says so', () => {
    // 100 a day, 70 already sent, 25 kept back for bulk: 5 left.
    const due = Array.from({ length: 8 }, (_, index) => bulk(`b${index}`, `p${index}@x.test`));
    const result = plan(due, { sentToday: 70 });
    expect(result.send).toHaveLength(5);
    expect(result.limited).toBe(true);
  });

  it('still lets the sequence through when bulk has hit its share', () => {
    const result = plan([seq('s', 'y@y.test'), bulk('b', 'x@x.test')], { sentToday: 80 });
    expect(result.send.map((row) => row.id)).toEqual(['s']);
    expect(result.limited).toBe(true);
  });

  it('respects the per-run cap without calling it the daily limit', () => {
    const due = Array.from({ length: 5 }, (_, index) => bulk(`b${index}`, `p${index}@x.test`));
    const result = plan(due, { maxSends: 2 });
    expect(result.send).toHaveLength(2);
    expect(result.limited).toBe(false);
  });
});

describe('readOutboxTemplate', () => {
  it('reads an onboarding step and refuses an unknown one', () => {
    expect(readOutboxTemplate({ template: 'onboarding_step', props: { step: 'day3', recipientName: 'Ada' } })).toEqual({
      templateId: 'onboarding_step',
      props: { step: 'day3', recipientName: 'Ada' },
    });
    expect(readOutboxTemplate({ template: 'onboarding_step', props: { step: 'day9' } })).toBeNull();
  });

  it('reads an announcement and refuses one without a subject or message', () => {
    expect(
      readOutboxTemplate({ template: 'announcement', props: { subject: 'S', body: 'B', recipientName: 'A' } })
    ).toEqual({
      templateId: 'announcement',
      props: { subject: 'S', body: 'B', recipientName: 'A', includeGreeting: true, signOff: true },
    });
    expect(readOutboxTemplate({ template: 'announcement', props: { subject: '', body: 'B' } })).toBeNull();
  });

  it('refuses any other template, so the outbox cannot be used to send a transactional email', () => {
    expect(readOutboxTemplate({ template: 'workspace_invite', props: {} })).toBeNull();
    expect(readOutboxTemplate({ template: 'announcement', props: null })).toBeNull();
  });
});

describe('utcDayStart', () => {
  it('is midnight UTC of the same day', () => {
    expect(utcDayStart(new Date('2026-09-30T23:59:00Z')).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});
