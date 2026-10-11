import { describe, expect, it } from 'vitest';
import { findHelpCopyProblems } from '@/lib/help-copy';
import { parseOpportunityCreate } from '@/lib/opportunities';
import type { GrantProgramme } from './programmes';
import {
  GRANT_SUGGESTIONS_COPY,
  describeAward,
  isSuggestionLive,
  opportunityFromProgramme,
  parseSuggestionAction,
} from './suggestions';

const base: GrantProgramme = {
  slug: 'kekere',
  funder: 'Africa No Filter',
  programme: 'Kekere Storytellers Fund',
  url: 'https://anf.example',
  kind: 'grant',
  countries: ['AFRICA'],
  applicantTypes: ['individual'],
  needs: [],
  genres: [],
  stages: [],
  amountMin: null,
  amountMax: 5000,
  currency: 'USD',
  status: 'open',
  opensOn: null,
  deadlineOn: '2026-11-30',
  lastClosedOn: null,
  recurring: true,
  summary: 'Small grants for African storytellers.',
  eligibility: 'African creatives.',
  sourceUrl: 'https://anf.example/kekere',
  checkedOn: '2026-10-11',
  active: true,
};

describe('describeAward', () => {
  it('says up to, a range, from, or nothing', () => {
    expect(describeAward(base)).toBe('Up to $5,000');
    expect(describeAward({ amountMin: 500, amountMax: 2000, currency: 'GBP' })).toBe('£500 to £2,000');
    expect(describeAward({ amountMin: 1000, amountMax: 1000, currency: 'EUR' })).toBe('Up to €1,000');
    expect(describeAward({ amountMin: 300, amountMax: null, currency: 'USD' })).toBe('From $300');
    expect(describeAward({ amountMin: 3000, amountMax: null, currency: 'ZAR' })).toBe('From 3,000 ZAR');
    expect(describeAward({ amountMin: null, amountMax: null, currency: 'USD' })).toBe('');
    expect(describeAward({ amountMin: 100, amountMax: 200, currency: null })).toBe('');
  });
});

describe('isSuggestionLive', () => {
  it('hides a suggestion once its deadline has passed, keeps rolling ones', () => {
    expect(isSuggestionLive('2026-10-11', '2026-10-11')).toBe(true);
    expect(isSuggestionLive('2026-10-10', '2026-10-11')).toBe(false);
    expect(isSuggestionLive(null, '2026-10-11')).toBe(true);
  });
});

describe('opportunityFromProgramme', () => {
  it('passes the same rules as a grant typed by hand', () => {
    const parsed = parseOpportunityCreate(opportunityFromProgramme(base));
    expect('value' in parsed).toBe(true);
    if (!('value' in parsed)) return;
    expect(parsed.value).toMatchObject({
      title: 'Kekere Storytellers Fund',
      kind: 'grant',
      status: 'idea',
      counterparty: 'Africa No Filter',
      amount: 5000,
      currency: 'USD',
      deadlineOn: '2026-11-30',
    });
    expect(parsed.value.notes).toContain('https://anf.example/kekere');
    expect(parsed.value.notes).toContain('Award: Up to $5,000.');
  });

  it('keeps an unknown currency out of the amount and in the notes', () => {
    const body = opportunityFromProgramme({ ...base, currency: 'ZAR', amountMax: 3000 });
    expect(body.amount).toBeNull();
    expect(body.notes).toContain('Up to 3,000 ZAR');
    expect('value' in parseOpportunityCreate(body)).toBe(true);
  });

  it('clips a long title so it still parses', () => {
    const body = opportunityFromProgramme({ ...base, programme: 'x'.repeat(300) });
    expect('value' in parseOpportunityCreate(body)).toBe(true);
  });
});

describe('parseSuggestionAction', () => {
  it('accepts add and dismiss only', () => {
    expect(parseSuggestionAction({ action: 'add' })).toEqual({ value: 'add' });
    expect(parseSuggestionAction({ action: 'dismiss' })).toEqual({ value: 'dismiss' });
    expect('error' in parseSuggestionAction({ action: 'delete' })).toBe(true);
    expect('error' in parseSuggestionAction(null)).toBe(true);
  });
});

describe('copy', () => {
  it('passes the help copy rules', () => {
    expect(findHelpCopyProblems(GRANT_SUGGESTIONS_COPY.description)).toEqual([]);
  });
});
