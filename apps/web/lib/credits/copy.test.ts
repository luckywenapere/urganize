import { describe, expect, it } from 'vitest';

import { creditsLeftLine, creditsResetLine, formatResetDay, isLowOnCredits, outOfCreditsNotice } from './copy';

const RESET = '2026-11-12T00:00:00.000Z';

describe('formatResetDay', () => {
  it('names the day in UTC, the same day the window turns over on', () => {
    expect(formatResetDay(RESET)).toBe('12 November');
    expect(formatResetDay('2026-12-31T23:59:59.000Z')).toBe('31 December');
  });

  it('does not print Invalid Date for a value it cannot read', () => {
    expect(formatResetDay('nonsense')).toBe('your next billing day');
    expect(formatResetDay('')).toBe('your next billing day');
  });
});

describe('the lines a person reads', () => {
  const all = (): string[] => [
    outOfCreditsNotice(RESET),
    creditsLeftLine(0),
    creditsLeftLine(1),
    creditsLeftLine(42),
    creditsResetLine(0, RESET),
    creditsResetLine(5, RESET),
  ];

  it('say how many credits are left, singular and plural, and never a negative number', () => {
    expect(creditsLeftLine(42)).toBe('UrgAns: 42 credits left.');
    expect(creditsLeftLine(1)).toBe('UrgAns: 1 credit left.');
    expect(creditsLeftLine(0)).toBe('You have used all your UrgAns credits.');
    expect(creditsLeftLine(-8)).toBe('You have used all your UrgAns credits.');
    expect(creditsLeftLine(3.9)).toBe('UrgAns: 3 credits left.');
  });

  it('tell someone out of credits that quick commands still work and when credits return', () => {
    expect(outOfCreditsNotice(RESET)).toContain('Quick commands still work');
    expect(outOfCreditsNotice(RESET)).toContain('12 November');
    expect(creditsResetLine(0, RESET)).toContain('Quick commands still work');
    expect(creditsResetLine(5, RESET)).not.toContain('Quick commands');
  });

  it('keep to the house rules: no em dash, no workspace, no promise of buying credits', () => {
    for (const line of all()) {
      expect(line, line).not.toMatch(/—|–/);
      expect(line, line).not.toMatch(/workspace/i);
      // Nothing can be bought yet, so nothing may tell anyone to.
      expect(line, line).not.toMatch(/\b(buy|purchase|top up|top-up|recharge)\b/i);
    }
  });
});

describe('isLowOnCredits', () => {
  it('turns on at a fifth of the monthly credits', () => {
    expect(isLowOnCredits(132, 660)).toBe(true);
    expect(isLowOnCredits(133, 660)).toBe(false);
    expect(isLowOnCredits(300, 1500)).toBe(true);
    expect(isLowOnCredits(301, 1500)).toBe(false);
  });

  it('never waits for fewer than ten credits, so a small allowance still gets its warning', () => {
    expect(isLowOnCredits(10, 20)).toBe(true);
    expect(isLowOnCredits(11, 20)).toBe(false);
    expect(isLowOnCredits(10, 150)).toBe(true);
  });

  it('is on when the balance is empty or overdrawn', () => {
    expect(isLowOnCredits(0, 660)).toBe(true);
    expect(isLowOnCredits(-12, 660)).toBe(true);
  });
});
