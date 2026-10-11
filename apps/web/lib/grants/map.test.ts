import { describe, expect, it } from 'vitest';
import { parseOpportunityCreate } from '../opportunities';
import { grantToOpportunity, GRANT_NEXT_STEP } from './map';
import type { VerifiedGrant } from './types';

const WHY = 'Matched on: afrobeats, Nigeria, funding for a first EP.';

function grant(over: Partial<VerifiedGrant> = {}): VerifiedGrant {
  return {
    title: 'Music Futures Fund 2027',
    funder: 'Example Arts Foundation',
    link: 'https://example.org/fund',
    readOn: '2026-10-11',
    status: 'open',
    deadline: '2026-11-30',
    lastClosedOn: null,
    rolling: false,
    amount: 25000,
    currency: 'USD',
    figureNote: null,
    eligibility: ['Open to artists based in Nigeria', 'Applicants must be under 35'],
    blanked: [],
    ...over,
  };
}

function map(over: Partial<VerifiedGrant> = {}, why = WHY) {
  return grantToOpportunity(grant(over), { why });
}

describe('grantToOpportunity: an honest grant becomes an idea that passes the real validator', () => {
  it('maps the plain case and survives parseOpportunityCreate', () => {
    const body = map();
    expect(body).toMatchObject({
      title: 'Music Futures Fund 2027',
      counterparty: 'Example Arts Foundation',
      kind: 'grant',
      status: 'idea',
      amount: 25000,
      currency: 'USD',
      nextStep: GRANT_NEXT_STEP,
      deadlineOn: '2026-11-30',
    });
    expect('error' in parseOpportunityCreate(body)).toBe(false);
  });

  it('puts the link, the read date, why it matched and the eligibility lines in the notes', () => {
    const { notes } = map();
    expect(notes).toContain('https://example.org/fund');
    expect(notes).toContain('2026-10-11');
    expect(notes).toContain(WHY);
    expect(notes).toContain('Open to artists based in Nigeria');
    expect(notes).toContain('Applicants must be under 35');
  });

  it('cuts a long title at a word, within 120 characters', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const { title } = map({ title: long });
    expect(title.length).toBeLessThanOrEqual(120);
    expect(long.startsWith(title)).toBe(true);
    expect(long[title.length]).toBe(' ');
  });

  it('cuts a very long funder to 120 characters', () => {
    expect(map({ funder: 'F'.repeat(300) }).counterparty.length).toBeLessThanOrEqual(120);
  });

  it('leaves the counterparty empty when no funder was found', () => {
    expect(map({ funder: null }).counterparty).toBe('');
  });
});

describe('money: only what the page stated, only in a currency the table can hold', () => {
  it('saves no amount when none was stated', () => {
    const body = map({ amount: null, currency: null });
    expect(body.amount).toBeNull();
  });

  it('never saves an amount without its own currency, so nothing defaults to naira', () => {
    const body = map({ amount: 25000, currency: null });
    expect(body.amount).toBeNull();
    expect(body.notes).toContain('25,000');
  });

  it('writes a figure the table cannot hold into the notes as plain text', () => {
    const body = map({ amount: null, currency: null, figureNote: 'CAD 20,000' });
    expect(body.amount).toBeNull();
    expect(body.notes).toContain('CAD 20,000');
    expect('error' in parseOpportunityCreate(body)).toBe(false);
  });

  it('keeps naira as naira', () => {
    expect(map({ amount: 500000, currency: 'NGN' })).toMatchObject({ amount: 500000, currency: 'NGN' });
  });
});

describe('deadlines: a past date is never saved', () => {
  it('saves a future deadline from an open grant', () => {
    expect(map({ status: 'open', deadline: '2027-02-01' }).deadlineOn).toBe('2027-02-01');
  });

  it('saves no deadline for a closed round and says when it closed and to watch for the next', () => {
    const body = map({ status: 'closed', deadline: null, lastClosedOn: '2026-06-30' });
    expect(body.deadlineOn).toBeNull();
    expect(body.notes).toContain('last round closed on 2026-06-30');
    expect(body.notes.toLowerCase()).toContain('watch for the next');
  });

  it('refuses to save a deadline on a closed round even if one slips through', () => {
    expect(map({ status: 'closed', deadline: '2026-06-30', lastClosedOn: '2026-06-30' }).deadlineOn).toBeNull();
  });

  it('says a closed round with no known date closed, without inventing a date', () => {
    const body = map({ status: 'closed', deadline: null, lastClosedOn: null });
    expect(body.deadlineOn).toBeNull();
    expect(body.notes.toLowerCase()).toContain('closed');
    expect(body.notes).not.toMatch(/\d{4}-\d{2}-\d{2}.*closed on/);
  });

  it('notes a rolling grant as always open with no deadline', () => {
    const body = map({ status: 'open', deadline: null, rolling: true });
    expect(body.deadlineOn).toBeNull();
    expect(body.notes.toLowerCase()).toContain('rolling');
  });

  it('notes an unknown deadline plainly', () => {
    const body = map({ status: 'unknown', deadline: null });
    expect(body.deadlineOn).toBeNull();
    expect(body.notes.toLowerCase()).toContain('no deadline found');
  });
});

describe('notes stay inside the limit and keep the link', () => {
  it('trims eligibility lines first, never the link or the read date', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `Line ${i} ${'x'.repeat(190)}`);
    const body = map({ eligibility: lines }, 'w'.repeat(2500));
    expect(body.notes.length).toBeLessThanOrEqual(4000);
    expect(body.notes).toContain('https://example.org/fund');
    expect(body.notes).toContain('2026-10-11');
    expect('error' in parseOpportunityCreate(body)).toBe(false);
  });
});

describe('the mapper adds nothing of its own', () => {
  it('sets no artist, rollout or next step date', () => {
    const body = map();
    expect(body.artistId).toBeNull();
    expect(body.releaseId).toBeNull();
    expect(body.nextStepOn).toBeNull();
  });

  it('writes no em dashes', () => {
    const closed = map({ status: 'closed', deadline: null, lastClosedOn: '2026-06-30' });
    for (const body of [map(), closed, map({ status: 'unknown', deadline: null })]) {
      expect(body.notes).not.toContain('—');
      expect(body.nextStep).not.toContain('—');
    }
  });
});
