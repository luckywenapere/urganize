import { describe, expect, it } from 'vitest';
import { buildEvalReport, serializeEvalReport } from './eval-report';
import type { GrantSearchReport } from './pipeline';

const base = (over: Partial<GrantSearchReport> = {}): GrantSearchReport => ({
  outcome: 'ok',
  endedBy: 'done',
  degraded: false,
  facts: { country: 'nigeria' },
  queries: ['music grants Nigeria 2027'],
  searches: [{ query: 'music grants Nigeria 2027', ok: true, pages: 1 }],
  open: [
    {
      title: 'Music In Africa Fund',
      funder: 'Music In Africa',
      link: 'https://www.musicinafrica.net/fund',
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
    },
  ],
  watch: [],
  unknownDeadline: [],
  drafts: [],
  dropped: [{ url: 'https://x.example/', reason: 'not_a_grant' }],
  duplicates: [],
  spentUsd: 0.009,
  pagesRead: 1,
  ...over,
});

describe('buildEvalReport', () => {
  it('lists each case with its sheet, known funders and cost, and totals the run', () => {
    const report = buildEvalReport({
      startedAt: '2026-10-11T09:00:00.000Z',
      mode: 'fake',
      today: '2026-10-11',
      runs: [
        { id: 'a', intent: 'x', report: base() },
        { id: 'b', intent: 'y', report: base({ outcome: 'unavailable', endedBy: 'search_unavailable', open: [], spentUsd: 0.007 }) },
      ],
    });
    expect(report.totals).toEqual({ cases: 2, spentUsd: 0.016, results: 1, unavailable: 1, degraded: 0, knownFundersFound: ['Music In Africa'] });
    expect(report.cases[0]).toMatchObject({ id: 'a', outcome: 'ok', knownFunders: ['Music In Africa'] });
    expect(report.cases[0].sheet[0]).toMatchObject({ rank: 1, label: null, link: 'https://www.musicinafrica.net/fund' });
    expect(report.cases[1].sheet).toEqual([]);
  });
});

describe('serializeEvalReport', () => {
  const report = buildEvalReport({ startedAt: 't', mode: 'live', today: '2026-10-11', runs: [{ id: 'a', intent: 'x', report: base() }] });

  it('writes plain JSON when no secret is in it', () => {
    expect(JSON.parse(serializeEvalReport(report, ['exa_SECRET_123']))).toEqual(report);
  });

  it('refuses to write a report that holds a secret anywhere, even nested', () => {
    const leaky = buildEvalReport({
      startedAt: 't',
      mode: 'live',
      today: '2026-10-11',
      runs: [{ id: 'a', intent: 'x', report: base({ searches: [{ query: 'q', ok: false, reason: 'unauthorized', detail: 'bad key exa_SECRET_123' }] }) }],
    });
    expect(() => serializeEvalReport(leaky, ['exa_SECRET_123'])).toThrow(/secret/i);
  });

  it('ignores empty and whitespace secrets rather than refusing every report', () => {
    expect(() => serializeEvalReport(report, ['', '   '])).not.toThrow();
  });
});
