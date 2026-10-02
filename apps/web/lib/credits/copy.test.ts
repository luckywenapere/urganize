import { describe, expect, it } from 'vitest';

import { isCreditsPurchasable } from './config';
import {
  creditsLeftLine,
  creditsNextLine,
  embeddedEstimateLine,
  embeddedRefusalNotice,
  formatGrantDay,
  embeddedCostLine,
  isLowOnCredits,
  outOfCreditsNotice,
} from './copy';

const NEXT = '2026-11-12T00:00:00.000Z';
const subscriber = { account: 'subscriber', nextGrantAt: NEXT } as const;
const creditsOnly = { account: 'credits_only', nextGrantAt: null } as const;
const trial = { account: 'trial', nextGrantAt: null } as const;

describe('formatGrantDay', () => {
  it('names the day in UTC, the same day the window turns over on', () => {
    expect(formatGrantDay(NEXT)).toBe('12 November');
    expect(formatGrantDay('2026-12-31T23:59:59.000Z')).toBe('31 December');
  });

  it('does not print Invalid Date for a value it cannot read', () => {
    expect(formatGrantDay('nonsense')).toBe('your next billing day');
    expect(formatGrantDay('')).toBe('your next billing day');
  });
});

describe('buying wording follows the purchase switch', () => {
  it('is off unless the purchase flag is the literal true, and never without credits', () => {
    expect(isCreditsPurchasable({})).toBe(false);
    expect(isCreditsPurchasable({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true' })).toBe(false);
    expect(isCreditsPurchasable({ NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE: 'true' })).toBe(false);
    expect(
      isCreditsPurchasable({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true', NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE: 'yes' })
    ).toBe(false);
    expect(
      isCreditsPurchasable({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true', NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE: 'true' })
    ).toBe(true);
  });

  const lines = (): string[] => [
    outOfCreditsNotice(subscriber),
    outOfCreditsNotice(creditsOnly),
    outOfCreditsNotice(trial),
    creditsLeftLine(0),
    creditsLeftLine(1),
    creditsLeftLine(42),
    creditsNextLine(0, subscriber),
    creditsNextLine(5, subscriber),
    creditsNextLine(0, creditsOnly),
    creditsNextLine(5, creditsOnly),
  ];

  it('so no line the app shows tells anyone to buy, top up or recharge', () => {
    for (const line of lines()) expect(line, line).not.toMatch(/\b(buy|purchase|top up|top-up|recharge)\b/i);
  });

  it('and the buying wording is only reachable by turning it on', () => {
    expect(outOfCreditsNotice(creditsOnly, true)).toMatch(/buy more credits/i);
    expect(outOfCreditsNotice(subscriber, true)).toMatch(/buy more credits/i);
    expect(creditsNextLine(0, creditsOnly, true)).toMatch(/buy more credits/i);
    expect(outOfCreditsNotice(creditsOnly, false)).not.toMatch(/buy/i);
  });
});

describe('the lines a person reads', () => {
  it('say how many credits are left, singular and plural, and never a negative number', () => {
    expect(creditsLeftLine(42)).toBe('UrgAns: 42 credits left.');
    expect(creditsLeftLine(1)).toBe('UrgAns: 1 credit left.');
    expect(creditsLeftLine(0)).toBe('You have used all your UrgAns credits.');
    expect(creditsLeftLine(-8)).toBe('You have used all your UrgAns credits.');
    expect(creditsLeftLine(3.9)).toBe('UrgAns: 3 credits left.');
  });

  it('tell a subscriber out of credits that quick commands still work and when the next credits arrive', () => {
    const notice = outOfCreditsNotice(subscriber);
    expect(notice).toContain('Quick commands still work');
    expect(notice).toContain('Your next monthly credits arrive on 12 November.');
    expect(creditsNextLine(0, subscriber)).toContain('Quick commands still work');
    expect(creditsNextLine(5, subscriber)).not.toContain('Quick commands');
    expect(creditsNextLine(5, subscriber)).toContain('12 November');
  });

  it('never say credits come back or reset, because they never expire and the balance never resets', () => {
    const all = [
      outOfCreditsNotice(subscriber),
      outOfCreditsNotice(creditsOnly),
      creditsNextLine(0, subscriber),
      creditsNextLine(5, subscriber),
    ];
    for (const line of all) expect(line, line).not.toMatch(/come back|comes back|reset|expire/i);
  });

  it('promise a date only to a subscriber, the one account that has a monthly grant', () => {
    for (const input of [creditsOnly, trial]) {
      expect(outOfCreditsNotice(input), input.account).not.toMatch(/arrive|November/);
      expect(creditsNextLine(5, input), input.account).toBe('');
    }
    expect(creditsNextLine(0, creditsOnly)).toBe('Quick commands still work.');
  });

  it('keep to the house rules: no em dash and no workspace', () => {
    for (const line of [outOfCreditsNotice(subscriber, true), outOfCreditsNotice(creditsOnly, true), creditsNextLine(0, subscriber, true)]) {
      expect(line, line).not.toMatch(/—|–/);
      expect(line, line).not.toMatch(/workspace/i);
    }
  });
});

describe('isLowOnCredits', () => {
  it('turns on below 50 credits, for every plan', () => {
    expect(isLowOnCredits(49)).toBe(true);
    expect(isLowOnCredits(50)).toBe(false);
    expect(isLowOnCredits(660)).toBe(false);
  });

  it('is on when the balance is empty or overdrawn', () => {
    expect(isLowOnCredits(0)).toBe(true);
    expect(isLowOnCredits(-12)).toBe(true);
  });
});

describe('the estimate shown before an embedded action runs', () => {
  it('says "about 12" for the planner, which has an estimate', () => {
    expect(embeddedEstimateLine('release.draft_plan')).toBe('This uses about 12 UrgAns credits.');
  });

  it('says "up to 25" for the press-kit draft, which has none yet, because that is the most it can cost', () => {
    expect(embeddedEstimateLine('presskit.draft_section')).toBe('This uses up to 25 UrgAns credits.');
  });

  it('keeps to the house rules, and says nothing about buying', () => {
    for (const line of [embeddedEstimateLine('release.draft_plan'), embeddedEstimateLine('x')]) {
      expect(line, line).not.toMatch(/—|–|workspace|\b(buy|purchase|top up)\b/i);
    }
  });
});

describe('the refusal when a run cannot start', () => {
  const input = { account: 'subscriber', nextGrantAt: NEXT, needed: 25, left: 7 } as const;

  it('says what it needs and what the team has, and when the next credits arrive', () => {
    const line = embeddedRefusalNotice(input);
    expect(line).toBe('This needs up to 25 UrgAns credits and you have 7. Your next monthly credits arrive on 12 November.');
  });

  it('never shows a negative balance, and promises a date only to a subscriber', () => {
    expect(embeddedRefusalNotice({ ...input, left: -9 })).toContain('you have 0');
    expect(embeddedRefusalNotice({ account: 'credits_only', nextGrantAt: null, needed: 25, left: 3 })).not.toMatch(/arrive|November/);
  });

  it('only mentions buying when purchasing exists', () => {
    expect(embeddedRefusalNotice(input)).not.toMatch(/buy/i);
    expect(embeddedRefusalNotice(input, true)).toMatch(/buy more credits/i);
  });
});

describe('embeddedCostLine', () => {
  it('says the estimate and then the balance', () => {
    expect(embeddedCostLine('release.draft_plan', 412)).toBe('This uses about 12 UrgAns credits. You have 412 credits.');
  });

  it('says "up to" for an action with no estimate of its own', () => {
    expect(embeddedCostLine('release.fill_pitch', 80)).toBe('This uses up to 25 UrgAns credits. You have 80 credits.');
  });

  it('is singular for one credit and never negative', () => {
    expect(embeddedCostLine('release.fill_pitch', 1)).toMatch(/You have 1 credit\.$/);
    expect(embeddedCostLine('release.fill_pitch', -5)).toMatch(/You have 0 credits\.$/);
  });

  it('says only the estimate when the balance is not known', () => {
    expect(embeddedCostLine('release.fill_pitch', null)).toBe('This uses up to 25 UrgAns credits.');
    expect(embeddedCostLine('release.fill_pitch', Number.NaN)).toBe('This uses up to 25 UrgAns credits.');
  });
});
