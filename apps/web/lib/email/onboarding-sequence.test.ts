import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_KEYS,
  QUEUED_ONBOARDING_STEP_KEYS,
  buildOnboardingOutboxRows,
  getOnboardingStep,
  isOnboardingSequenceEnabled,
  lagosDayStart,
  onboardingDueAt,
  onboardingDedupeKey,
} from './onboarding-sequence';
import { parseNoteText } from './note-text';

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the five steps', () => {
  it('is days 1, 2, 3, 5 and 7, in order', () => {
    expect(ONBOARDING_STEPS.map((step) => step.day)).toEqual([1, 2, 3, 5, 7]);
    expect(ONBOARDING_STEP_KEYS).toEqual(['day1', 'day2', 'day3', 'day5', 'day7']);
  });

  it('queues only days 2 to 7; day 1 is sent at signup', () => {
    expect(QUEUED_ONBOARDING_STEP_KEYS).toEqual(['day2', 'day3', 'day5', 'day7']);
  });

  it('gives every step a subject, a preview and some paragraphs', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.subject.length).toBeGreaterThan(5);
      expect(step.subject.length).toBeLessThanOrEqual(70);
      expect(step.preview.length).toBeGreaterThan(5);
      expect(step.preview).not.toBe(step.subject);
      expect(step.body.trim().length).toBeGreaterThan(40);
    }
  });

  it('keeps the house copy rules: no em dash, never "workspace"', () => {
    for (const step of ONBOARDING_STEPS) {
      const all = `${step.subject}\n${step.preview}\n${step.body}`;
      expect(all).not.toContain('—');
      expect(all.toLowerCase()).not.toContain('workspace');
    }
  });

  it('asks for a reply on the question day and the last day', () => {
    expect(getOnboardingStep('day3').body.toLowerCase()).toContain('reply');
    expect(getOnboardingStep('day7').body.toLowerCase()).toContain('reply');
  });

  it('asks the reader on day 1 to mark it important, and says what is coming', () => {
    const body = getOnboardingStep('day1').body.toLowerCase();
    expect(body).toContain('important');
    expect(body).toContain('four short emails');
  });

  it('only links to safe addresses', () => {
    for (const step of ONBOARDING_STEPS) {
      for (const paragraph of parseNoteText(step.body)) {
        for (const segment of paragraph) {
          if (segment.kind === 'link') expect(segment.href).toMatch(/^(https:\/\/|mailto:)/);
        }
      }
    }
  });
});

describe('lagosDayStart', () => {
  it('is midnight in Lagos (UTC+1), which is 23:00 UTC the day before', () => {
    // 10:00 UTC on 30 Sep is 11:00 in Lagos; that Lagos day began at 29 Sep 23:00 UTC.
    expect(lagosDayStart(new Date('2026-09-30T10:00:00Z')).toISOString()).toBe('2026-09-29T23:00:00.000Z');
  });

  it('puts 23:30 UTC into the next Lagos day', () => {
    // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in Lagos.
    expect(lagosDayStart(new Date('2026-09-30T23:30:00Z')).toISOString()).toBe('2026-09-30T23:00:00.000Z');
  });
});

describe('onboardingDueAt', () => {
  it('makes day N due at the start of the (N-1)th Lagos day after signup', () => {
    const signedUp = new Date('2026-09-30T21:45:00Z'); // 22:45 Lagos, 30 Sep
    const dayStart = lagosDayStart(signedUp).getTime();
    expect(onboardingDueAt(signedUp, 2).getTime()).toBe(dayStart + DAY);
    expect(onboardingDueAt(signedUp, 7).getTime()).toBe(dayStart + 6 * DAY);
  });

  it('so a late-evening signup gets day 2 the next morning, not a day later', () => {
    const signedUp = new Date('2026-09-30T21:45:00Z');
    const nextMorningCron = new Date('2026-10-01T08:00:00Z'); // 09:00 Lagos
    expect(onboardingDueAt(signedUp, 2).getTime()).toBeLessThanOrEqual(nextMorningCron.getTime());
  });
});

describe('buildOnboardingOutboxRows', () => {
  const input = {
    userId: '11111111-1111-1111-1111-111111111111',
    email: '  Ada@Example.com ',
    name: 'Ada Obi',
    startedAt: new Date('2026-09-30T09:00:00Z'),
  };

  it('makes one queued row per later step, lowercasing the address', () => {
    const rows = buildOnboardingOutboxRows(input);
    expect(rows.map((row) => row.props.step)).toEqual(['day2', 'day3', 'day5', 'day7']);
    for (const row of rows) {
      expect(row.recipient).toBe('ada@example.com');
      expect(row.recipient_user_id).toBe(input.userId);
      expect(row.template).toBe('onboarding_step');
      expect(row.batch_id).toBeNull();
      expect(row.props.recipientName).toBe('Ada Obi');
    }
  });

  it('keys each row so enrolling twice cannot queue twice', () => {
    const rows = buildOnboardingOutboxRows(input);
    expect(rows[0].dedupe_key).toBe(onboardingDedupeKey(input.userId, 'day2'));
    expect(new Set(rows.map((row) => row.dedupe_key)).size).toBe(rows.length);
  });

  it('spaces the send dates by the step days', () => {
    const rows = buildOnboardingOutboxRows(input);
    const due = rows.map((row) => Date.parse(row.send_after));
    expect(due[1] - due[0]).toBe(DAY);
    expect(due[2] - due[1]).toBe(2 * DAY);
    expect(due[3] - due[2]).toBe(2 * DAY);
  });

  it('refuses a blank address', () => {
    expect(buildOnboardingOutboxRows({ ...input, email: '  ' })).toEqual([]);
  });
});

describe('isOnboardingSequenceEnabled', () => {
  it('is on only for the literal word "on"', () => {
    vi.stubEnv('EMAIL_ONBOARDING_SEQUENCE', 'on');
    expect(isOnboardingSequenceEnabled()).toBe(true);
    vi.stubEnv('EMAIL_ONBOARDING_SEQUENCE', 'true');
    expect(isOnboardingSequenceEnabled()).toBe(false);
    vi.stubEnv('EMAIL_ONBOARDING_SEQUENCE', '');
    expect(isOnboardingSequenceEnabled()).toBe(false);
  });
});
