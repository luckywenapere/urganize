import { describe, expect, it } from 'vitest';
import { dedupeGrants, normalizeLink, normalizeName, trackedLinkSet } from './dedupe';
import type { VerifiedGrant } from './types';

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
    eligibility: [],
    blanked: [],
    ...over,
  };
}

describe('normalizeLink', () => {
  it('ignores case, www, a trailing slash, tracking and the fragment', () => {
    const a = normalizeLink('https://www.Example.org/fund/?utm_source=x&utm_medium=y#apply');
    const b = normalizeLink('https://example.org/fund');
    expect(a).toBe(b);
  });

  it('keeps a query that decides the page', () => {
    expect(normalizeLink('https://example.org/call?id=1')).not.toBe(normalizeLink('https://example.org/call?id=2'));
  });

  it('gives an unreadable link back as an empty string', () => {
    expect(normalizeLink('not a url')).toBe('');
  });
});

describe('normalizeName', () => {
  it('ignores case, spacing, accents and punctuation', () => {
    expect(normalizeName('  The Music-Futures Fund (2027)! ')).toBe(normalizeName('the music futures fund 2027'));
    expect(normalizeName('Café Fund')).toBe(normalizeName('cafe fund'));
  });
});

describe('dedupeGrants', () => {
  it('drops a second result with the same link', () => {
    const first = grant();
    const second = grant({ title: 'A different title', link: 'https://www.example.org/fund/?utm_source=y' });
    const { kept, duplicates } = dedupeGrants([first, second], []);
    expect(kept).toEqual([first]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].reason).toBe('same_link');
  });

  it('drops a second result with the same funder and title on a different link', () => {
    const first = grant();
    const second = grant({ link: 'https://other.example/page', title: 'MUSIC FUTURES FUND 2027', funder: 'example arts foundation' });
    const { kept, duplicates } = dedupeGrants([first, second], []);
    expect(kept).toEqual([first]);
    expect(duplicates[0].reason).toBe('same_funder_and_title');
  });

  it('keeps two grants from one funder with different titles', () => {
    const { kept } = dedupeGrants([grant(), grant({ title: 'Touring Grant', link: 'https://example.org/tour' })], []);
    expect(kept).toHaveLength(2);
  });

  it('never merges on a title alone when the funder is unknown', () => {
    const { kept } = dedupeGrants([grant({ funder: null, link: 'https://a.example/x' }), grant({ funder: null, link: 'https://b.example/y' })], []);
    expect(kept).toHaveLength(2);
  });

  it('drops a result the team already tracks, by link', () => {
    const { kept, duplicates } = dedupeGrants([grant()], [{ title: 'Something I typed', counterparty: '', notes: 'Found at https://example.org/fund on 1 Jan' }]);
    expect(kept).toEqual([]);
    expect(duplicates[0].reason).toBe('already_tracked');
  });

  it('drops a result the team already tracks, by funder and title', () => {
    const existing = [{ title: 'Music Futures Fund 2027', counterparty: 'Example Arts Foundation', notes: '' }];
    expect(dedupeGrants([grant({ link: 'https://other.example/z' })], existing).kept).toEqual([]);
  });

  it('keeps a result when only the funder matches an existing item', () => {
    const existing = [{ title: 'Another thing', counterparty: 'Example Arts Foundation', notes: '' }];
    expect(dedupeGrants([grant()], existing).kept).toHaveLength(1);
  });

  it('keeps the first of several duplicates, in the order given', () => {
    const a = grant({ link: 'https://example.org/a', title: 'One', funder: 'F' });
    const b = grant({ link: 'https://example.org/a', title: 'Two', funder: 'G' });
    const c = grant({ link: 'https://example.org/c', title: 'Three', funder: 'H' });
    expect(dedupeGrants([a, b, c], []).kept).toEqual([a, c]);
  });

  it('does not change what it was given', () => {
    const input = [grant(), grant()];
    const copy = JSON.stringify(input);
    dedupeGrants(input, []);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe('trackedLinkSet', () => {
  it('collects every link the existing notes cite, normalized', () => {
    const set = trackedLinkSet([
      { title: 'a', counterparty: '', notes: 'Source: https://www.Example.org/fund/?utm_source=x. Also https://other.example.org/call.' },
      { title: 'b', counterparty: '', notes: 'no link here' },
    ]);
    expect(set.has('example.org/fund')).toBe(true);
    expect(set.has('other.example.org/call')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('is empty when nothing is tracked', () => {
    expect(trackedLinkSet([]).size).toBe(0);
  });
});
