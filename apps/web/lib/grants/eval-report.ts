// The evaluation's report: one entry per case, each with the sheet a person labels.
//
// Built only from what `runGrantSearch` returns, which is already verified fields,
// fixed-vocabulary facts and the queries made from them. On top of that, writing
// the report refuses outright if any secret appears anywhere in it: a leak is a
// failed run, never a scrubbed file someone assumes was clean.

import type { EndedBy, GrantOutcome, GrantSearchReport, SearchRecord } from './pipeline';
import { knownFundersIn, scoringSheet, type SheetRow } from './scoring';

export type EvalMode = 'fake' | 'live';

export type EvalCaseEntry = {
  id: string;
  intent: string;
  outcome: GrantOutcome;
  endedBy: EndedBy;
  degraded: boolean;
  queries: string[];
  searches: SearchRecord[];
  knownFunders: string[];
  spentUsd: number;
  pagesRead: number;
  dropped: GrantSearchReport['dropped'];
  duplicates: number;
  sheet: SheetRow[];
};

export type EvalReport = {
  startedAt: string;
  mode: EvalMode;
  today: string;
  totals: { cases: number; spentUsd: number; results: number; unavailable: number; degraded: number; knownFundersFound: string[] };
  cases: EvalCaseEntry[];
};

const usd = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export function buildEvalReport(input: {
  startedAt: string;
  mode: EvalMode;
  today: string;
  runs: Array<{ id: string; intent: string; report: GrantSearchReport }>;
}): EvalReport {
  const cases: EvalCaseEntry[] = input.runs.map(({ id, intent, report }) => ({
    id,
    intent,
    outcome: report.outcome,
    endedBy: report.endedBy,
    degraded: report.degraded,
    queries: report.queries,
    searches: report.searches,
    knownFunders: knownFundersIn(report),
    spentUsd: usd(report.spentUsd),
    pagesRead: report.pagesRead,
    dropped: report.dropped,
    duplicates: report.duplicates.length,
    sheet: scoringSheet(report),
  }));

  return {
    startedAt: input.startedAt,
    mode: input.mode,
    today: input.today,
    totals: {
      cases: cases.length,
      spentUsd: usd(cases.reduce((sum, entry) => sum + entry.spentUsd, 0)),
      results: cases.reduce((sum, entry) => sum + entry.sheet.length, 0),
      unavailable: cases.filter((entry) => entry.outcome === 'unavailable').length,
      degraded: cases.filter((entry) => entry.degraded).length,
      knownFundersFound: [...new Set(cases.flatMap((entry) => entry.knownFunders))].sort(),
    },
    cases,
  };
}

/** The report as JSON, or an error if any secret appears anywhere in it. */
export function serializeEvalReport(report: EvalReport, secrets: string[]): string {
  const json = JSON.stringify(report, null, 2);
  for (const raw of secrets) {
    const secret = typeof raw === 'string' ? raw.trim() : '';
    if (secret && json.includes(secret)) throw new Error('The report holds a secret, so it was not written.');
  }
  return json;
}
