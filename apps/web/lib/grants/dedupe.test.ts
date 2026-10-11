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

describe('dedupeGrants: the same grant reposted on another site', () => {
  // Real titles from the 2026-10-11 live run: one programme, three blogs, three titles.
  const fundA = grant({
    title: 'The Creative Fund 2026 for Film, Fashion and Music Projects in Nigeria',
    funder: 'UK-Nigeria Tech Hub and implemented by Tech4Dev',
    link: 'https://drpcngr.org/the-creative-fund-2026',
    deadline: null,
    amount: null,
    status: 'unknown',
  });
  const fundB = grant({
    title: 'Call for Applications: UK–Nigeria Creative Fund 2026 (Project-Based - MSME Africa',
    funder: 'UK-Nigeria Tech Hub in partnership with Tech4Dev',
    link: 'https://msmeafricaonline.com/call-for-applications-uk-nigeria-creative-fund-2026',
    deadline: null,
    amount: null,
    status: 'unknown',
  });

  it('drops a repost when the funder matches and the titles name the same programme', () => {
    const { kept, duplicates } = dedupeGrants([fundA, fundB], []);
    expect(kept).toEqual([fundA]);
    expect(duplicates).toEqual([{ grant: fundB, reason: 'same_grant_elsewhere' }]);
  });

  it('sees past a shortened name and a plural (scholarship programme, scholars programme)', () => {
    const a = grant({ title: 'MTN Foundation/MUSON Music Scholarship Programme 2026/2027 For Aspiring Musicians', funder: 'MTN Foundation & Musical Society of Nigeria', link: 'https://olainfo.com.ng/mtn-muson' });
    const b = grant({ title: 'MTNF MUSON Music Scholars Programme 2026/2027', funder: 'MTN Foundation', link: 'https://studygreen.info/mtn-muson' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(1);
  });

  it('drops a near-identical title when only one side names the funder', () => {
    const a = grant({ title: 'UK–Nigeria Creative Fund 2026', funder: 'UK–Nigeria Tech Hub', link: 'https://a.example/x' });
    const b = grant({ title: 'Applications open: UK Nigeria Creative Fund 2026', funder: null, link: 'https://b.example/y' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(1);
  });

  it('looks past the site name a blog adds to the end of a title', () => {
    const a = grant({ title: 'Music Futures Fund - Opportunity Desk', funder: null, link: 'https://a.example/x' });
    const b = grant({ title: 'Music Futures Fund | Get Creative Money', link: 'https://b.example/y' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(1);
  });

  it('never mistakes a trailing year for a site name', () => {
    const a = grant({ title: 'Creative Business Academy for Africa — 2026', link: 'https://a.example/x', deadline: null });
    const b = grant({ title: 'Creative Business Academy for Africa — 2027', link: 'https://b.example/y', deadline: null });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps loosely similar titles apart when a funder is missing', () => {
    const a = grant({ title: 'UK–Nigeria Creative Fund 2026', funder: 'UK–Nigeria Tech Hub', link: 'https://a.example/x' });
    const b = grant({ title: 'The Creative Fund 2026 for Film, Fashion and Music Projects in Nigeria', funder: null, link: 'https://b.example/y' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps the same programme name from two different funders apart', () => {
    const a = grant({ title: 'Emerging Artist Touring Grant 2027', funder: 'Arts Council Alpha', link: 'https://a.example/x' });
    const b = grant({ title: 'Emerging Artist Touring Grant 2027', funder: 'Beta Music Trust', link: 'https://b.example/y' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps two rounds apart: a different year', () => {
    const a = grant({ title: 'Music Futures Fund 2026', link: 'https://a.example/x', deadline: null });
    const b = grant({ title: 'Music Futures Fund 2027', link: 'https://b.example/y', deadline: null });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps two rounds apart: a different cohort number', () => {
    const a = grant({ title: 'Creative Catalyst Initiative cohort 1', funder: 'Chapel Hill Denham', link: 'https://a.example/x' });
    const b = grant({ title: 'Creative Catalyst Initiative cohort 2', funder: 'Chapel Hill Denham', link: 'https://b.example/y' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps two rounds apart: different deadlines', () => {
    const a = grant({ title: 'Creative Fund Nigeria', funder: 'UK-Nigeria Tech Hub', link: 'https://a.example/x', deadline: '2026-11-30' });
    const b = grant({ title: 'UK-Nigeria Creative Fund', funder: 'UK-Nigeria Tech Hub', link: 'https://b.example/y', deadline: '2027-03-31' });
    expect(dedupeGrants([a, b], []).kept).toHaveLength(2);
  });

  it('keeps the copy that carries more checked facts, wherever it came in the list', () => {
    const rich = { ...fundB, deadline: '2026-12-15', amount: 5000, status: 'open' as const };
    const { kept, duplicates } = dedupeGrants([fundA, rich], []);
    expect(kept).toEqual([rich]);
    expect(duplicates).toEqual([{ grant: fundA, reason: 'same_grant_elsewhere' }]);
  });

  it('treats a repost of something the team already tracks as tracked', () => {
    const existing = [{ title: 'UK-Nigeria Creative Fund 2026', counterparty: 'UK-Nigeria Tech Hub', notes: '' }];
    const { kept, duplicates } = dedupeGrants([fundB], existing);
    expect(kept).toEqual([]);
    expect(duplicates[0].reason).toBe('already_tracked');
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
