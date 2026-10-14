import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findHelpCopyProblems } from '@/lib/help-copy';
import type { GrantSuggestionView } from '@/lib/grants/suggestions';
import type { OpportunityView } from '@/lib/opportunities';
import {
  HOME_OPPORTUNITIES_COPY,
  describeDeadline,
  homeOpportunitiesView,
  homeOpportunityMeta,
  pickHomeOpportunities,
} from './opportunities-card';

const TODAY = '2026-10-14';

const suggestion = (id: string, over: Partial<GrantSuggestionView> = {}): GrantSuggestionView => ({
  id,
  why: 'Open in Nigeria · Afrobeats',
  funder: 'Funder',
  programme: `Programme ${id}`,
  kind: 'grant',
  summary: '',
  award: '',
  deadlineOn: '2026-11-01',
  url: 'https://example.com',
  suggestedAt: '2026-10-10T08:00:00Z',
  ...over,
});

const opportunity = (id: string, over: Partial<OpportunityView> = {}): OpportunityView => ({
  id,
  title: `Opportunity ${id}`,
  kind: 'brand',
  status: 'talking',
  counterparty: 'Brand Co',
  amount: null,
  currency: 'NGN',
  nextStep: '',
  nextStepOn: null,
  deadlineOn: null,
  notes: '',
  artistId: null,
  releaseId: null,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...over,
});

describe('pickHomeOpportunities', () => {
  it('puts matched suggestions first, newest first, then the newest open saved ones, three at most', () => {
    const items = pickHomeOpportunities(
      {
        suggestions: [suggestion('old', { suggestedAt: '2026-10-01T00:00:00Z' }), suggestion('new', { suggestedAt: '2026-10-12T00:00:00Z' })],
        opportunities: [opportunity('a', { createdAt: '2026-09-01T00:00:00Z' }), opportunity('b', { createdAt: '2026-10-05T00:00:00Z' })],
      },
      TODAY
    );
    expect(items.map((item) => item.key)).toEqual(['suggested:new', 'suggested:old', 'saved:b']);
  });

  it('falls back to the newest open saved opportunities when there are no suggestions', () => {
    const items = pickHomeOpportunities(
      {
        suggestions: [],
        opportunities: [
          opportunity('won', { status: 'won', createdAt: '2026-10-13T00:00:00Z' }),
          opportunity('passed', { status: 'passed' }),
          opportunity('lost', { status: 'lost' }),
          opportunity('idea', { status: 'idea', createdAt: '2026-10-02T00:00:00Z' }),
        ],
      },
      TODAY
    );
    expect(items.map((item) => item.key)).toEqual(['saved:idea']);
    expect(items[0]).toMatchObject({ source: 'saved', kindLabel: 'Brand', detail: 'Brand Co' });
  });

  it('drops suggestions whose round has closed, and never shows one title twice', () => {
    const items = pickHomeOpportunities(
      {
        suggestions: [suggestion('closed', { deadlineOn: '2026-10-13' }), suggestion('x', { programme: 'Same Grant' })],
        opportunities: [opportunity('dup', { title: ' same grant ' })],
      },
      TODAY
    );
    expect(items.map((item) => item.key)).toEqual(['suggested:x']);
  });

  it('labels a suggestion with its kind, Suggested and the deadline, or rolling', () => {
    const [dated, rolling] = pickHomeOpportunities(
      {
        suggestions: [
          suggestion('d', { suggestedAt: '2026-10-12T00:00:00Z', deadlineOn: '2026-10-26' }),
          suggestion('r', { kind: 'residency', deadlineOn: null }),
        ],
        opportunities: [],
      },
      TODAY
    );
    expect(homeOpportunityMeta(dated)).toBe('Grant · Suggested · Closes in 12 days');
    expect(homeOpportunityMeta(rolling)).toBe('Residency · Suggested · No fixed deadline');
    expect(dated.detail).toBe('Open in Nigeria · Afrobeats');
  });

  it('leaves the deadline out for a saved one with none', () => {
    const [item] = pickHomeOpportunities({ suggestions: [], opportunities: [opportunity('a', { kind: 'sync' })] }, TODAY);
    expect(homeOpportunityMeta(item)).toBe('Sync');
  });
});

describe('describeDeadline', () => {
  it('says today, tomorrow, days left, or passed', () => {
    expect(describeDeadline(null, TODAY)).toBe('');
    expect(describeDeadline('2026-10-14', TODAY)).toBe('Closes today');
    expect(describeDeadline('2026-10-15', TODAY)).toBe('Closes tomorrow');
    expect(describeDeadline('2026-10-20', TODAY)).toBe('Closes in 6 days');
    expect(describeDeadline('2026-10-01', TODAY)).toBe('Deadline passed');
  });
});

describe('homeOpportunitiesView', () => {
  it('lists when there is something, hides when the team list could not be read, else empty', () => {
    const item = pickHomeOpportunities({ suggestions: [suggestion('a')], opportunities: [] }, TODAY);
    expect(homeOpportunitiesView({ opportunitiesOk: false, items: item })).toBe('list');
    expect(homeOpportunitiesView({ opportunitiesOk: false, items: [] })).toBe('hidden');
    expect(homeOpportunitiesView({ opportunitiesOk: true, items: [] })).toBe('empty');
  });
});

describe('copy', () => {
  it('keeps the empty state at the fifth-grader bar', () => {
    expect(findHelpCopyProblems(HOME_OPPORTUNITIES_COPY.emptyDescription)).toEqual([]);
  });
});

describe('wiring', () => {
  const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

  it('draws the card first on Home, fenced, ahead of the ordered groups', () => {
    const blocks = read('components/home/HomeBlocks.tsx');
    const card = blocks.indexOf('<OpportunitiesCard />');
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(blocks.indexOf('{blocks.map('));
    expect(blocks).toMatch(/name="home-block-opportunities"/);
  });

  it('reuses the Opportunities routes, links to the page and tracks taps', () => {
    const card = read('components/home/OpportunitiesCard.tsx');
    expect(card).toContain('useOpportunitiesStore');
    expect(card).toContain('loadGrantSuggestions');
    expect(card).toContain('HOME_OPPORTUNITIES_HREF');
    expect(card).toContain("name: 'home_opportunity_clicked'");
    expect(read('components/opportunities/GrantSuggestionsStrip.tsx')).toContain('loadGrantSuggestions');
  });
});
