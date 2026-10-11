import { describe, expect, it } from 'vitest';
import { KNOWN_FUNDERS, knownFundersIn, scoreRun, scoringSheet, type LabelledQuery } from './scoring';
import type { GrantSearchReport } from './pipeline';
import type { VerifiedGrant } from './types';

// Scoring is the part a person does: they read each result against its source and
// give it one label. This file only turns those labels into the plan's bars, and
// builds the sheet they label from. It never guesses a label.

const grant = (over: Partial<VerifiedGrant> = {}): VerifiedGrant => ({
  title: 'Fund',
  funder: 'Example Foundation',
  link: 'https://fund.example.org/call',
  readOn: '2026-10-11',
  status: 'open',
  deadline: '2026-11-30',
  lastClosedOn: null,
  rolling: false,
  amount: null,
  currency: null,
  figureNote: null,
  eligibility: [],
  blanked: [],
  ...over,
});

const report = (over: Partial<GrantSearchReport> = {}): GrantSearchReport => ({
  outcome: 'ok',
  endedBy: 'done',
  degraded: false,
  facts: { genre: 'afrobeats', country: 'nigeria' },
  queries: ['q'],
  searches: [{ query: 'q', ok: true, pages: 1 }],
  open: [],
  watch: [],
  unknownDeadline: [],
  drafts: [],
  dropped: [],
  duplicates: [],
  spentUsd: 0.009,
  pagesRead: 1,
  ...over,
});

describe('knownFundersIn', () => {
  it('finds a named funder in a title, a funder or a link, ignoring case', () => {
    const r = report({
      open: [grant({ funder: 'The TONY ELUMELU Foundation' })],
      watch: [grant({ funder: null, link: 'https://www.musicinafrica.net/funding/x', status: 'closed' })],
      unknownDeadline: [grant({ funder: null, title: 'PRS Foundation Open Fund', status: 'unknown' })],
    });
    expect(knownFundersIn(r)).toEqual(['Music In Africa', 'PRS Foundation', 'Tony Elumelu Foundation']);
  });

  it('finds nothing in an empty report, and every funder in the list has at least one way to match', () => {
    expect(knownFundersIn(report())).toEqual([]);
    for (const funder of KNOWN_FUNDERS) expect(funder.match.length).toBeGreaterThan(0);
  });
});

describe('scoringSheet', () => {
  it('lists every result in the order a person would see it, with an empty label to fill', () => {
    const sheet = scoringSheet(
      report({
        open: [grant({ link: 'https://a.example/1' })],
        unknownDeadline: [grant({ link: 'https://b.example/2', status: 'unknown', deadline: null })],
        watch: [grant({ link: 'https://c.example/3', status: 'closed', deadline: null, lastClosedOn: '2026-01-01' })],
      })
    );
    expect(sheet.map((row) => [row.rank, row.link, row.bucket, row.label])).toEqual([
      [1, 'https://a.example/1', 'open', null],
      [2, 'https://b.example/2', 'unknown', null],
      [3, 'https://c.example/3', 'closed', null],
    ]);
    expect(sheet[0]).toMatchObject({ deadline: '2026-11-30', readOn: '2026-10-11' });
  });
});

describe('scoreRun', () => {
  const good = (n: number) => Array.from({ length: n }, () => 'open_eligible' as const);

  it('passes a query when at least 3 of its top 5 are real, open and eligible', () => {
    const queries: LabelledQuery[] = [
      { query: 'a', labels: [...good(3), 'closed', 'not_a_grant', 'open_eligible'], knownFunders: [], costUsd: 0.02 },
      { query: 'b', labels: ['closed', 'closed', 'not_a_grant', ...good(3)], knownFunders: ['PRS Foundation'], costUsd: 0.04 },
    ];
    const score = scoreRun(queries);
    expect(score.queriesPassing).toBe(1);
    expect(score.perQuery.map((q) => q.passes)).toEqual([true, false]);
    expect(score.perQuery[1].goodInTop5).toBe(2);
  });

  it('counts a wrong field as a zero-tolerance failure, whatever else passes', () => {
    const queries: LabelledQuery[] = Array.from({ length: 20 }, (_, i) => ({
      query: `q${i}`,
      labels: i === 7 ? [...good(4), 'field_wrong'] : good(5),
      knownFunders: ['Music In Africa'],
      costUsd: 0.03,
    }));
    const score = scoreRun(queries);
    expect(score.queriesPassing).toBe(20);
    expect(score.fieldsWrong).toBe(1);
    expect(score.passesBars).toBe(false);
    expect(score.failedBars).toContain('zero_wrong_fields');
  });

  it('passes the bars at 14 of 20 good queries, no wrong fields and some known funders found', () => {
    const queries: LabelledQuery[] = Array.from({ length: 20 }, (_, i) => ({
      query: `q${i}`,
      labels: i < 14 ? good(5) : ['closed', 'closed', 'closed'],
      knownFunders: i === 0 ? ['Tony Elumelu Foundation'] : [],
      costUsd: 0.05,
    }));
    const score = scoreRun(queries);
    expect(score).toMatchObject({ queriesPassing: 14, queries: 20, fieldsWrong: 0, passesBars: true, failedBars: [] });
    expect(score.knownFundersFound).toEqual(['Tony Elumelu Foundation']);
    expect(score.costPerQueryUsd).toBeCloseTo(0.05, 6);
  });

  it('fails the bars at 13 of 20, and when no known funder turns up at all', () => {
    const queries: LabelledQuery[] = Array.from({ length: 20 }, (_, i) => ({
      query: `q${i}`,
      labels: i < 13 ? good(5) : [],
      knownFunders: [],
      costUsd: 0,
    }));
    const score = scoreRun(queries);
    expect(score.passesBars).toBe(false);
    expect(score.failedBars).toEqual(['queries_passing', 'known_funders']);
  });

  it('holds the 14-of-20 bar as a share, so a smaller first run is judged the same way', () => {
    const five: LabelledQuery[] = Array.from({ length: 5 }, (_, i) => ({
      query: `q${i}`,
      labels: i < 4 ? good(3) : [],
      knownFunders: ['PRS Foundation'],
      costUsd: 0.01,
    }));
    expect(scoreRun(five)).toMatchObject({ queriesPassing: 4, passesBars: true });
    expect(scoreRun(five.slice(0, 2).concat(five.slice(4)))).toMatchObject({ queriesPassing: 2, passesBars: false });
  });

  it('refuses an unlabelled result rather than counting it either way', () => {
    expect(() => scoreRun([{ query: 'q', labels: [null], knownFunders: [], costUsd: 0 }])).toThrow(/unlabelled/i);
  });

  it('scores an empty run as failing, not as a pass with nothing wrong', () => {
    expect(scoreRun([])).toMatchObject({ queries: 0, passesBars: false });
  });
});
