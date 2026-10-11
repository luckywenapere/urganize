// Turning a person's labels into the plan's pass or fail.
//
// The evaluation is scored by a person reading each result against its source page
// (plan section 7). This file builds the sheet they fill in and adds up what they
// wrote. It never guesses a label: an unlabelled result stops the count, because a
// result counted as neither good nor bad quietly moves the bar.
//
// Pure. No network, no clock.

import type { GrantSearchReport } from './pipeline';
import type { GrantStatus } from './types';

/**
 * Funders the plan names as a coverage check, from general knowledge and
 * UNCONFIRMED: each must be checked to still run a programme before a miss counts
 * against the search. Finding none of them is a finding in itself.
 */
export const KNOWN_FUNDERS: ReadonlyArray<{ name: string; match: readonly string[] }> = [
  { name: 'Afreximbank CANEX', match: ['canex'] },
  { name: 'British Council', match: ['british council', 'britishcouncil'] },
  { name: 'Help Musicians', match: ['help musicians', 'helpmusicians'] },
  { name: 'Music In Africa', match: ['music in africa', 'musicinafrica'] },
  { name: 'PRS Foundation', match: ['prs foundation', 'prsfoundation'] },
  { name: 'Prince Claus Fund', match: ['prince claus', 'princeclausfund'] },
  { name: 'Tony Elumelu Foundation', match: ['tony elumelu', 'tonyelumelufoundation', 'tefconnect'] },
];

/** The known funders that appear anywhere in a report's results, by name, sorted. */
export function knownFundersIn(report: GrantSearchReport): string[] {
  const haystacks = [...report.open, ...report.unknownDeadline, ...report.watch].map((grant) =>
    [grant.title, grant.funder ?? '', grant.link].join(' ').toLowerCase()
  );
  const found = KNOWN_FUNDERS.filter((funder) => haystacks.some((text) => funder.match.some((needle) => text.includes(needle))));
  return found.map((funder) => funder.name).sort();
}

/** One label per result, given by a person who read the source page. */
export type ResultLabel = 'open_eligible' | 'closed' | 'ineligible' | 'not_a_grant' | 'field_wrong' | 'duplicate';

export type SheetRow = {
  rank: number;
  bucket: GrantStatus;
  title: string;
  funder: string | null;
  link: string;
  readOn: string;
  deadline: string | null;
  lastClosedOn: string | null;
  amount: number | null;
  currency: string | null;
  label: ResultLabel | null;
};

/** Every result, in the order a person would see it, each with an empty label. */
export function scoringSheet(report: GrantSearchReport): SheetRow[] {
  const ordered = [...report.open, ...report.unknownDeadline, ...report.watch];
  return ordered.map((grant, index) => ({
    rank: index + 1,
    bucket: grant.status,
    title: grant.title,
    funder: grant.funder,
    link: grant.link,
    readOn: grant.readOn,
    deadline: grant.deadline,
    lastClosedOn: grant.lastClosedOn,
    amount: grant.amount,
    currency: grant.currency,
    label: null,
  }));
}

export type LabelledQuery = {
  query: string;
  /** In rank order. */
  labels: Array<ResultLabel | null>;
  knownFunders: string[];
  costUsd: number;
};

/** Proposed bars from the plan. The founder sets the real ones. */
export const BARS = {
  topN: 5,
  goodInTopN: 3,
  /** 14 of 20, held as a share so a smaller first run is judged the same way. */
  passingShare: 14 / 20,
} as const;

export type FailedBar = 'no_queries' | 'queries_passing' | 'zero_wrong_fields' | 'known_funders';

export type RunScore = {
  queries: number;
  queriesPassing: number;
  fieldsWrong: number;
  knownFundersFound: string[];
  costPerQueryUsd: number;
  perQuery: Array<{ query: string; goodInTop5: number; passes: boolean; fieldsWrong: number }>;
  passesBars: boolean;
  failedBars: FailedBar[];
};

export function scoreRun(queries: LabelledQuery[]): RunScore {
  const perQuery = queries.map((entry) => {
    if (entry.labels.some((label) => label === null)) throw new Error(`An unlabelled result in "${entry.query}". Label every result first.`);
    const labels = entry.labels as ResultLabel[];
    const goodInTop5 = labels.slice(0, BARS.topN).filter((label) => label === 'open_eligible').length;
    return {
      query: entry.query,
      goodInTop5,
      passes: goodInTop5 >= BARS.goodInTopN,
      fieldsWrong: labels.filter((label) => label === 'field_wrong').length,
    };
  });

  const queriesPassing = perQuery.filter((entry) => entry.passes).length;
  const fieldsWrong = perQuery.reduce((sum, entry) => sum + entry.fieldsWrong, 0);
  const knownFundersFound = [...new Set(queries.flatMap((entry) => entry.knownFunders))].sort();
  const totalCost = queries.reduce((sum, entry) => sum + (Number.isFinite(entry.costUsd) ? entry.costUsd : 0), 0);

  const failedBars: FailedBar[] = [];
  if (queries.length === 0) failedBars.push('no_queries');
  else {
    if (queriesPassing / queries.length < BARS.passingShare - 1e-9) failedBars.push('queries_passing');
    if (fieldsWrong > 0) failedBars.push('zero_wrong_fields');
    if (knownFundersFound.length === 0) failedBars.push('known_funders');
  }

  return {
    queries: queries.length,
    queriesPassing,
    fieldsWrong,
    knownFundersFound,
    costPerQueryUsd: queries.length > 0 ? totalCost / queries.length : 0,
    perQuery,
    passesBars: failedBars.length === 0,
    failedBars,
  };
}
