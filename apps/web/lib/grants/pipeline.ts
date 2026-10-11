// One grant search, start to finish, with every outside call handed in.
//
// The pipeline never talks to the network or a model itself. The caller passes a
// `search` and an `extract`, so the same code runs against the real vendor, a local
// fake, or a test double, and the safety rules below are the same in all three.
//
// What it promises:
//   - Nothing writes itself. It returns drafts; a person saves them.
//   - Every field of a grant survives only if the fetched page holds it
//     (`verifyExtraction`), and the link is the page's own, never the model's.
//   - A search that failed is never reported as a search that found nothing.
//   - It stops at hard limits on searches, pages and money, and says which one.
//   - Nothing it returns can hold the key, a person, or a field the model invented:
//     the report is built only from verified-grant fields, fixed-vocabulary facts and
//     the queries made from them.

import { parseOpportunityCreate, type OpportunityCreate } from '../opportunities';
import { isCalendarDate } from './dates';
import { dedupeGrants, normalizeLink, trackedLinkSet, type Duplicate, type ExistingOpportunity } from './dedupe';
import type { SearchOutcome } from './exa-client';
import { looksHostile } from './hostile';
import { grantToOpportunity } from './map';
import { buildGrantQueries, titleCase, type GrantFacts } from './query-builder';
import { createSpendMeter, type SpendKind } from './spend';
import type { ExtractedFields, FetchedPage, VerifiedGrant } from './types';
import { verifyExtraction } from './verify';

export type ExtractResult = { ok: true; fields: ExtractedFields } | { ok: false; reason: string };

export type PipelineDeps = {
  search: (query: string) => Promise<SearchOutcome>;
  extract: (page: FetchedPage) => Promise<ExtractResult>;
};

export type PipelineLimits = {
  maxSearches?: number;
  maxPages?: number;
  maxUsd?: number;
  prices?: Partial<Record<SpendKind, number>>;
};

export type PipelineInput = {
  /** Anything. Only the fixed vocabularies in `readGrantFacts` ever come through. */
  facts: unknown;
  /** `YYYY-MM-DD`. The day the pages are read, and the line a deadline is held to. */
  today: string;
  maxQueries?: number;
  existing?: ExistingOpportunity[];
  limits?: PipelineLimits;
};

export const DEFAULT_LIMITS = { maxSearches: 6, maxPages: 15, maxUsd: 0.25 } as const;
/** No caller can raise a limit past these, whatever it asks for. */
export const HARD_CEILINGS = { maxSearches: 12, maxPages: 40, maxUsd: 2 } as const;

export type GrantOutcome = 'ok' | 'empty' | 'unavailable' | 'stopped' | 'invalid_input';
export type EndedBy = 'done' | 'search_cap' | 'page_cap' | 'spend_cap' | 'search_unavailable' | 'invalid_input';

export type SearchRecord = {
  query: string;
  ok: boolean;
  pages?: number;
  reason?: string;
  detail?: string;
  retryAfterSeconds?: number | null;
};

export type DroppedPage = { url: string; reason: string };

export type GrantSearchReport = {
  outcome: GrantOutcome;
  endedBy: EndedBy;
  error?: string;
  /** True when a search or a page read failed, so the list may be shorter than it should be. */
  degraded: boolean;
  facts: GrantFacts;
  queries: string[];
  searches: SearchRecord[];
  /** Open rounds with a real deadline, soonest first, rolling ones last. */
  open: VerifiedGrant[];
  /** Rounds that have closed. Watch for the next one. */
  watch: VerifiedGrant[];
  /** Pages that look like grants but give no deadline we can stand behind. */
  unknownDeadline: VerifiedGrant[];
  /** Ready for a person to save: open first, then unknown, then closed. */
  drafts: OpportunityCreate[];
  dropped: DroppedPage[];
  duplicates: Duplicate[];
  spentUsd: number;
  pagesRead: number;
};

const MAX_DETAIL_CHARS = 200;

function readLimit(value: unknown, fallback: number, ceiling: number, whole: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  const capped = Math.min(value, ceiling);
  return whole ? Math.floor(capped) : capped;
}

function describeWhy(facts: GrantFacts): string {
  const parts: string[] = [];
  if (facts.genre) parts.push(facts.genre);
  if (facts.country) parts.push(titleCase(facts.country));
  if (facts.stage) parts.push(facts.stage);
  if (facts.need) parts.push(facts.need);
  if (facts.year) parts.push(String(facts.year));
  return `Matched on: ${parts.join(', ')}.`;
}

function compareOpen(a: VerifiedGrant, b: VerifiedGrant): number {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.deadline && !b.deadline) return -1;
  if (!a.deadline && b.deadline) return 1;
  return a.link < b.link ? -1 : a.link > b.link ? 1 : 0;
}

function compareByLink(a: VerifiedGrant, b: VerifiedGrant): number {
  return a.link < b.link ? -1 : a.link > b.link ? 1 : 0;
}

const STOPS_THE_RUN = new Set(['rate_limited', 'unauthorized', 'no_key', 'no_query']);

function recordSearch(query: string, outcome: SearchOutcome): SearchRecord {
  if (outcome.ok) return { query, ok: true, pages: outcome.pages.length };
  const record: SearchRecord = { query, ok: false, reason: outcome.reason };
  if ('detail' in outcome && typeof outcome.detail === 'string' && outcome.detail) record.detail = outcome.detail.slice(0, MAX_DETAIL_CHARS);
  if (outcome.reason === 'rate_limited') record.retryAfterSeconds = outcome.retryAfterSeconds;
  return record;
}

export async function runGrantSearch(deps: PipelineDeps, input: PipelineInput): Promise<GrantSearchReport> {
  const empty = (error: string): GrantSearchReport => ({
    outcome: 'invalid_input',
    endedBy: 'invalid_input',
    error,
    degraded: false,
    facts: {},
    queries: [],
    searches: [],
    open: [],
    watch: [],
    unknownDeadline: [],
    drafts: [],
    dropped: [],
    duplicates: [],
    spentUsd: 0,
    pagesRead: 0,
  });

  if (typeof input.today !== 'string' || !isCalendarDate(input.today)) return empty('Today must be a calendar day, like 2026-10-11.');
  const built = buildGrantQueries(input.facts, { max: input.maxQueries });
  if ('error' in built) return empty(built.error);

  const today = input.today;
  const existing = Array.isArray(input.existing) ? input.existing : [];
  const trackedLinks = trackedLinkSet(existing);

  const limits = input.limits ?? {};
  const maxSearches = readLimit(limits.maxSearches, DEFAULT_LIMITS.maxSearches, HARD_CEILINGS.maxSearches, true);
  const maxPages = readLimit(limits.maxPages, DEFAULT_LIMITS.maxPages, HARD_CEILINGS.maxPages, true);
  const maxUsd = readLimit(limits.maxUsd, DEFAULT_LIMITS.maxUsd, HARD_CEILINGS.maxUsd, false);
  const meter = createSpendMeter({ maxUsd, prices: limits.prices });

  const searches: SearchRecord[] = [];
  const dropped: DroppedPage[] = [];
  const collected: VerifiedGrant[] = [];
  const seenPages = new Set<string>();
  let pagesRead = 0;
  let searchesMade = 0;
  let searchesFailed = 0;
  let searchesWorked = 0;
  let extractionsFailed = 0;
  // Set inside `stop`, so the compiler must not narrow it to its first value.
  let endedBy = 'done' as EndedBy;

  const stop = (reason: EndedBy): void => {
    if (endedBy === 'done') endedBy = reason;
  };

  outer: for (const query of built.queries) {
    if (searchesMade >= maxSearches) {
      stop('search_cap');
      break;
    }
    if (!meter.tryCharge('search')) {
      stop('spend_cap');
      break;
    }
    searchesMade += 1;

    let outcome: SearchOutcome;
    try {
      outcome = await deps.search(query);
    } catch {
      // The message could carry anything, so it is not kept.
      outcome = { ok: false, reason: 'unavailable' };
    }
    searches.push(recordSearch(query, outcome));

    if (!outcome.ok) {
      searchesFailed += 1;
      if (STOPS_THE_RUN.has(outcome.reason)) {
        stop('search_unavailable');
        break;
      }
      continue;
    }
    searchesWorked += 1;

    for (const page of outcome.pages) {
      const key = normalizeLink(page.url) || page.url;
      if (seenPages.has(key)) continue;
      seenPages.add(key);

      if (trackedLinks.has(key)) {
        dropped.push({ url: page.url, reason: 'already_tracked' });
        continue;
      }
      // A page that speaks to the model is refused before any model reads it.
      if (looksHostile(page.text) || looksHostile(page.title)) {
        dropped.push({ url: page.url, reason: 'hostile_page' });
        continue;
      }
      if (pagesRead >= maxPages) {
        stop('page_cap');
        break outer;
      }
      if (!meter.tryCharge('extraction')) {
        stop('spend_cap');
        break outer;
      }
      pagesRead += 1;

      let extracted: ExtractResult;
      try {
        extracted = await deps.extract(page);
      } catch {
        extracted = { ok: false, reason: 'threw' };
      }
      if (!extracted.ok) {
        extractionsFailed += 1;
        dropped.push({ url: page.url, reason: 'extraction_failed' });
        continue;
      }

      const verified = verifyExtraction({ page, fields: extracted.fields, readOn: today, today });
      if (!verified.ok) {
        dropped.push({ url: page.url, reason: verified.reason });
        continue;
      }
      collected.push(verified.grant);
    }
  }

  const { kept, duplicates } = dedupeGrants(collected, existing);
  const open = kept.filter((grant) => grant.status === 'open').sort(compareOpen);
  const unknownDeadline = kept.filter((grant) => grant.status === 'unknown').sort(compareByLink);
  const watch = kept.filter((grant) => grant.status === 'closed').sort(compareByLink);

  const why = describeWhy(built.facts);
  const drafts: OpportunityCreate[] = [];
  for (const grant of [...open, ...unknownDeadline, ...watch]) {
    const parsed = parseOpportunityCreate(grantToOpportunity(grant, { why }));
    if ('error' in parsed) {
      dropped.push({ url: grant.link, reason: 'draft_invalid' });
      continue;
    }
    drafts.push(parsed.value);
  }

  let outcome: GrantOutcome;
  if (kept.length > 0) outcome = 'ok';
  else if (searchesWorked === 0 && searchesMade > 0) outcome = 'unavailable';
  else if (endedBy === 'search_cap' || endedBy === 'page_cap' || endedBy === 'spend_cap') outcome = 'stopped';
  else outcome = 'empty';

  return {
    outcome,
    endedBy,
    degraded: searchesFailed > 0 || extractionsFailed > 0,
    facts: built.facts,
    queries: built.queries,
    searches,
    open,
    watch,
    unknownDeadline,
    drafts,
    dropped,
    duplicates,
    spentUsd: meter.spentUsd(),
    pagesRead,
  };
}
