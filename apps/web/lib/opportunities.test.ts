import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findHelpCopyProblems } from './help-copy';
import {
  OPPORTUNITIES_EMPTY_COPY,
  describeDate,
  filterOpportunities,
  formatAmount,
  isOverdue,
  parseOpportunityCreate,
  parseOpportunityPatch,
  sortOpportunities,
  summarizeOpportunities,
  type OpportunityView,
} from './opportunities';

function item(over: Partial<OpportunityView> & { id: string }): OpportunityView {
  return {
    title: 'Opportunity',
    kind: 'deal',
    status: 'idea',
    counterparty: '',
    amount: null,
    currency: 'NGN',
    nextStep: '',
    nextStepOn: null,
    deadlineOn: null,
    notes: '',
    artistId: null,
    releaseId: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const TODAY = '2026-10-04';

describe('parseOpportunityCreate', () => {
  it('needs a title and fills the rest with defaults', () => {
    expect(parseOpportunityCreate({})).toEqual({ error: 'Add a title.' });
    const parsed = parseOpportunityCreate({ title: '  Sync for the film  ' });
    expect(parsed).toMatchObject({
      value: { title: 'Sync for the film', kind: 'other', status: 'idea', currency: 'NGN', amount: null },
    });
  });

  it('refuses a status or type that is not on the list', () => {
    expect(parseOpportunityCreate({ title: 'x', status: 'signed' })).toEqual({
      error: 'Pick a status from the list.',
    });
    expect(parseOpportunityCreate({ title: 'x', kind: 'gig' })).toEqual({ error: 'Pick a type from the list.' });
  });

  it('reads an amount typed with commas and refuses a negative one', () => {
    const ok = parseOpportunityCreate({ title: 'x', amount: '2,000,000' });
    expect(ok).toMatchObject({ value: { amount: 2000000 } });
    expect('error' in parseOpportunityCreate({ title: 'x', amount: -5 })).toBe(true);
    expect('error' in parseOpportunityCreate({ title: 'x', amount: 'lots' })).toBe(true);
  });

  it('refuses a date that is not a real calendar day', () => {
    expect('error' in parseOpportunityCreate({ title: 'x', deadlineOn: '2026-02-30' })).toBe(true);
    expect('error' in parseOpportunityCreate({ title: 'x', nextStepOn: 'soon' })).toBe(true);
    expect(parseOpportunityCreate({ title: 'x', deadlineOn: '2026-12-01' })).toMatchObject({
      value: { deadlineOn: '2026-12-01' },
    });
  });

  it('refuses an id that is not a uuid', () => {
    expect('error' in parseOpportunityCreate({ title: 'x', artistId: '123' })).toBe(true);
  });
});

describe('parseOpportunityPatch', () => {
  it('leaves absent fields alone and clears an explicit null', () => {
    const parsed = parseOpportunityPatch({ amount: null, nextStep: '' });
    expect(parsed).toEqual({ value: { amount: null, nextStep: '' } });
  });

  it('refuses an empty edit', () => {
    expect(parseOpportunityPatch({})).toEqual({ error: 'Nothing to save.' });
  });

  it('will not null a field that must always have a value', () => {
    expect('error' in parseOpportunityPatch({ status: null })).toBe(true);
    expect('error' in parseOpportunityPatch({ title: '' })).toBe(true);
  });
});

describe('overdue and sort order', () => {
  it('counts a past next step or deadline, but never on a closed one', () => {
    expect(isOverdue(item({ id: 'a', nextStepOn: '2026-10-01' }), TODAY)).toBe(true);
    expect(isOverdue(item({ id: 'b', deadlineOn: '2026-10-03' }), TODAY)).toBe(true);
    expect(isOverdue(item({ id: 'c', nextStepOn: '2026-10-04' }), TODAY)).toBe(false);
    expect(isOverdue(item({ id: 'd', status: 'won', nextStepOn: '2026-10-01' }), TODAY)).toBe(false);
  });

  it('puts overdue first, then the soonest date, then closed ones last', () => {
    const sorted = sortOpportunities(
      [
        item({ id: 'closed', status: 'lost' }),
        item({ id: 'later', nextStepOn: '2026-11-01' }),
        item({ id: 'late', nextStepOn: '2026-10-01' }),
        item({ id: 'soon', deadlineOn: '2026-10-10' }),
        item({ id: 'nodate' }),
      ],
      TODAY
    );
    expect(sorted.map((i) => i.id)).toEqual(['late', 'soon', 'later', 'nodate', 'closed']);
  });

  it('summarises open, overdue and won', () => {
    const summary = summarizeOpportunities(
      [
        item({ id: '1', status: 'talking', nextStepOn: '2026-10-01' }),
        item({ id: '2', status: 'idea' }),
        item({ id: '3', status: 'won' }),
        item({ id: '4', status: 'passed' }),
      ],
      TODAY
    );
    expect(summary).toEqual({ open: 2, overdue: 1, won: 1 });
  });
});

describe('filterOpportunities', () => {
  const items = [
    item({ id: '1', title: 'Netflix sync', kind: 'sync', counterparty: 'Music supervisor', artistId: 'a1' }),
    item({ id: '2', title: 'Arts grant', kind: 'grant', status: 'won', artistId: 'a2' }),
    item({ id: '3', title: 'Brand ambassador', kind: 'brand', status: 'lost', notes: 'sneaker company' }),
  ];

  it('finds every word, anywhere in the text', () => {
    expect(filterOpportunities(items, { query: 'sneaker brand' }).map((i) => i.id)).toEqual(['3']);
    expect(filterOpportunities(items, { query: 'supervisor netflix' }).map((i) => i.id)).toEqual(['1']);
  });

  it('splits open from closed and filters by kind and artist', () => {
    expect(filterOpportunities(items, { state: 'open' }).map((i) => i.id)).toEqual(['1']);
    expect(filterOpportunities(items, { state: 'closed' }).map((i) => i.id)).toEqual(['2', '3']);
    expect(filterOpportunities(items, { kind: 'grant' }).map((i) => i.id)).toEqual(['2']);
    expect(filterOpportunities(items, { artistId: 'a1' }).map((i) => i.id)).toEqual(['1']);
  });

  it('returns everything for an empty filter', () => {
    expect(filterOpportunities(items, {})).toHaveLength(3);
  });
});

describe('words', () => {
  it('formats money and leaves a blank when there is no number', () => {
    expect(formatAmount(null, 'NGN')).toBe('');
    expect(formatAmount(2000000, 'NGN')).toBe('₦2,000,000');
    expect(formatAmount(1250.5, 'USD')).toBe('$1,250.50');
  });

  it('describes a date against today', () => {
    expect(describeDate(null, TODAY)).toBe('');
    expect(describeDate('2026-10-04', TODAY)).toBe('Today');
    expect(describeDate('2026-10-05', TODAY)).toBe('Tomorrow');
    expect(describeDate('2026-10-09', TODAY)).toBe('In 5 days');
    expect(describeDate('2026-10-03', TODAY)).toBe('1 day late');
    expect(describeDate('2026-10-01', TODAY)).toBe('3 days late');
  });
});

describe('the empty Opportunities page', () => {
  it('says what the page is for in one plain line, under the help-copy bar', () => {
    expect(findHelpCopyProblems(OPPORTUNITIES_EMPTY_COPY.description)).toEqual([]);
    expect(sentencesIn(OPPORTUNITIES_EMPTY_COPY.description)).toBe(1);
    // House copy: no Oxford comma, no em dash, no "release" for the object.
    expect(OPPORTUNITIES_EMPTY_COPY.description).not.toMatch(/, and /);
    for (const text of Object.values(OPPORTUNITIES_EMPTY_COPY)) {
      expect(text).not.toContain('\u2014');
      expect(text).not.toMatch(/\brelease/i);
    }
  });

  const source = readFileSync(join(process.cwd(), 'app/dashboard/opportunities/OpportunitiesPageClient.tsx'), 'utf8');

  it('uses the shared EmptyState with the copy above and the Add action', () => {
    expect(source).toContain("import { EmptyState } from '@/components/shared/EmptyState'");
    const empty = source.slice(source.indexOf('<EmptyState'), source.indexOf('/>', source.indexOf('<EmptyState')));
    expect(empty).toContain('title={OPPORTUNITIES_EMPTY_COPY.title}');
    expect(empty).toContain('description={OPPORTUNITIES_EMPTY_COPY.description}');
    expect(empty).toContain('action={addButton}');
    // The button opens the add form, the same as the header button does.
    const button = source.slice(source.indexOf('const addButton'), source.indexOf('</button>', source.indexOf('const addButton')));
    expect(button).toContain('onClick={openNew}');
    expect(button).toContain('{OPPORTUNITIES_EMPTY_COPY.action}');
    // The old bespoke card is gone.
    expect(source).not.toContain('Nothing here yet');
  });

  it('shows one Add button at a time: the header only once something is saved', () => {
    expect(source).toMatch(/<PageHeader action=\{editing === null && opportunities\.length > 0 \? addButton : null\} \/>/);
  });

  it('steps the empty state aside while the add form is open', () => {
    expect(source).toMatch(/opportunities\.length === 0 \? \([\s\S]*?editing === null \? \(\s*<EmptyState/);
  });

  it('offers Try again when the first load fails', () => {
    const start = source.indexOf('loadError && opportunities.length === 0');
    const failed = source.slice(start, source.indexOf('</div>', start));
    expect(failed).toContain('load({ force: true })');
    expect(failed).toContain('Try again');
  });
});

function sentencesIn(text: string): number {
  return text.split(/[.!?](?:\s|$)/).filter((part) => part.trim()).length;
}
