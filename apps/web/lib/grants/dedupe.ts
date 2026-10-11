// Dropping a result the team already has, or has already seen in this run.
//
// Two grants are the same if they share a link, or share a funder AND a title. A
// title alone is never enough (two funders can run a "Touring Grant"), and a funder
// alone is never enough (one funder runs several).
//
// The live run (2026-10-11) showed the common case is neither: one programme
// reposted by several blogs, each with its own title ("The Creative Fund 2026 for
// Film, Fashion and Music Projects in Nigeria", "Call for Applications: UK–Nigeria
// Creative Fund 2026 (Project-Based - MSME Africa"). `sameGrant` catches those,
// and leans towards keeping two apart: any sign of a different round (another
// year, cohort number or deadline) or a different funder keeps them separate.
// Pure.

import type { VerifiedGrant } from './types';

/** What an existing Opportunity holds that matters here. */
export type ExistingOpportunity = { title: string; counterparty: string; notes: string };

export type DuplicateReason = 'same_link' | 'same_funder_and_title' | 'same_grant_elsewhere' | 'already_tracked';
export type Duplicate = { grant: VerifiedGrant; reason: DuplicateReason };

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i;

/** A link reduced to what identifies the page: no case, no www, no fragment, no tracking. */
export function normalizeLink(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key)).sort(([a], [b]) => a.localeCompare(b));
  const query = kept.length ? `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  return `${host}${path}${query}`;
}

/** A name reduced to letters and numbers, lower case, accents removed. */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const nameKey = (funder: string | null, title: string): string | null => {
  const f = funder ? normalizeName(funder) : '';
  const t = normalizeName(title);
  return f && t ? `${f}|${t}` : null;
};

/** Words that dress a title up without naming the grant. */
const TITLE_FILLER = new Set(
  'a an the for and of in to on at by with from its our your is are be now new get call calls applications application apply open opens opened announce announces announced launch launches launched invites inviting'.split(' '),
);
/** Words that say "this is a funding programme": a shared name must end on one. */
const PROGRAMME_NOUNS = new Set(
  'fund grant scholar programme residency academy initiative prize award fellowship bursary competition accelerator incubator challenge scheme'.split(' '),
);
/** Words too common in funder names to tell two funders apart. */
const FUNDER_FILLER = new Set(
  'foundation fund trust inc ltd limited llc plc organisation organization partnership partner partners implemented facilitated supported nigeria nigerian africa african uk international national'.split(' '),
);
const STEMS: Record<string, string> = { scholarship: 'scholar', scholars: 'scholar', program: 'programme', programmes: 'programme', programs: 'programme' };

const stem = (word: string): string => STEMS[word] ?? (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);

/** A trailing "- Site Name" or "| Site Name" that a blog adds to a title. */
const SEGMENT_SPLIT = /\s[|\u2013\u2014-]\s/;
function stripSiteSuffix(title: string): string {
  const parts = title.split(SEGMENT_SPLIT);
  if (parts.length < 2) return title;
  const last = normalizeName(parts[parts.length - 1]).split(' ').filter(Boolean);
  const looksLikeSite = last.length > 0 && last.length <= 4 && !last.some((w) => /^\d+$/.test(w) || PROGRAMME_NOUNS.has(stem(w)));
  return looksLikeSite ? parts.slice(0, -1).join(' - ') : title;
}

type TitleShape = { words: string[]; numbers: Set<string> };

/** A title as the words that name the grant, in order, plus every number in it (years, cohorts). */
export function titleShape(title: string): TitleShape {
  const words: string[] = [];
  const numbers = new Set<string>();
  for (const token of normalizeName(stripSiteSuffix(title)).split(' ')) {
    if (!token) continue;
    if (/^\d+$/.test(token)) numbers.add(token);
    else if (!TITLE_FILLER.has(token)) words.push(stem(token));
  }
  return { words, numbers };
}

function funderWords(funder: string | null): Set<string> {
  if (!funder) return new Set();
  return new Set(normalizeName(funder).split(' ').filter((w) => w && !TITLE_FILLER.has(w) && !FUNDER_FILLER.has(w)));
}

type FunderMatch = 'same' | 'different' | 'unknown';
function compareFunders(a: string | null, b: string | null): FunderMatch {
  const wa = funderWords(a);
  const wb = funderWords(b);
  if (!wa.size || !wb.size) return 'unknown';
  for (const w of wa) if (wb.has(w)) return 'same';
  return 'different';
}

/** One set of numbers holding a number the other lacks, both ways: another year or cohort. */
function numbersConflict(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  const aInB = [...a].every((n) => b.has(n));
  const bInA = [...b].every((n) => a.has(n));
  return !aInB && !bInA;
}

/** True when both titles share a run of two or more words that ends on a programme noun ("creative fund"). */
function shareProgrammeName(a: string[], b: string[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let run = 0;
      while (i + run < a.length && j + run < b.length && a[i + run] === b[j + run]) {
        run += 1;
        if (run >= 2 && PROGRAMME_NOUNS.has(a[i + run - 1])) return true;
      }
    }
  }
  return false;
}

function overlap(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const smaller = Math.min(sa.size, sb.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return shared / smaller;
}

type Comparable = { title: string; funder: string | null; deadline: string | null };

function funderNamedIn(funder: string | null, title: string): boolean {
  const words = new Set(normalizeName(title).split(' '));
  for (const w of funderWords(funder)) if (words.has(w)) return true;
  return false;
}

/** True when the shorter title's words appear, in order and together, inside the longer one. */
function containsRun(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  for (let i = 0; i + short.length <= long.length; i += 1) {
    if (short.every((w, k) => long[i + k] === w)) return true;
  }
  return false;
}

// From the live run (Oct 11, 2026): "MOBO UnSung" was credited to MOBO on its own
// page and to PRS Foundation, its partner, on a news post whose title names both.
// Two different funders are still one programme when one page's title names the
// other page's funder, both state the same deadline, and the shorter title sits
// whole inside the longer one.
function partnerCredited(a: Comparable, b: Comparable, wa: string[], wb: string[]): boolean {
  if (!a.deadline || a.deadline !== b.deadline) return false;
  if (!funderNamedIn(a.funder, b.title) && !funderNamedIn(b.funder, a.title)) return false;
  return containsRun(wa, wb);
}

/**
 * The same programme under another title, usually a repost on another site.
 * Never the same when the rounds differ (a year, a cohort number, a deadline) or
 * the funders differ, unless one title credits the other funder as a partner. Otherwise the same when the funder matches and both titles
 * share a programme name, or when the titles are near identical and at least one
 * side names the funder.
 */
export function sameGrant(a: Comparable, b: Comparable): boolean {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return false;
  const ta = titleShape(a.title);
  const tb = titleShape(b.title);
  if (numbersConflict(ta.numbers, tb.numbers)) return false;
  const funders = compareFunders(a.funder, b.funder);
  if (funders === 'different') return partnerCredited(a, b, ta.words, tb.words);
  if (funders === 'same' && shareProgrammeName(ta.words, tb.words)) return true;
  const someFunderKnown = Boolean(a.funder?.trim() || b.funder?.trim());
  return someFunderKnown && Math.min(new Set(ta.words).size, new Set(tb.words).size) >= 3 && overlap(ta.words, tb.words) >= 0.8;
}

/** How many checked facts a copy carries; of two copies of one grant, keep the fuller. */
function richness(grant: VerifiedGrant): number {
  return (grant.deadline ? 2 : 0) + (grant.status === 'open' ? 1 : 0) + (grant.amount !== null ? 1 : 0) + (grant.funder ? 1 : 0) + (grant.eligibility.length ? 1 : 0);
}

const LINK_IN_TEXT = /https?:\/\/[^\s)>\]"']+/g;

/** Every link the team's existing Opportunities cite in their notes, normalized. */
export function trackedLinkSet(existing: ExistingOpportunity[]): Set<string> {
  const links = new Set<string>();
  for (const item of existing) {
    for (const found of item.notes.match(LINK_IN_TEXT) ?? []) {
      // A link at the end of a sentence carries the full stop with it.
      const normalized = normalizeLink(found.replace(/[.,;:!?]+$/, ''));
      if (normalized) links.add(normalized);
    }
  }
  return links;
}

export function dedupeGrants(grants: VerifiedGrant[], existing: ExistingOpportunity[]): { kept: VerifiedGrant[]; duplicates: Duplicate[] } {
  const trackedLinks = trackedLinkSet(existing);
  const trackedNames = new Set<string>();
  for (const item of existing) {
    const key = nameKey(item.counterparty, item.title);
    if (key) trackedNames.add(key);
  }
  const tracked: Comparable[] = existing.map((item) => ({ title: item.title, funder: item.counterparty || null, deadline: null }));

  const kept: VerifiedGrant[] = [];
  const duplicates: Duplicate[] = [];

  for (const grant of grants) {
    const link = normalizeLink(grant.link);
    const key = nameKey(grant.funder, grant.title);

    if ((link && trackedLinks.has(link)) || (key && trackedNames.has(key)) || tracked.some((item) => sameGrant(grant, item))) {
      duplicates.push({ grant, reason: 'already_tracked' });
      continue;
    }

    let match = -1;
    let reason: DuplicateReason | null = null;
    for (let i = 0; i < kept.length && match < 0; i += 1) {
      const other = kept[i];
      if (link && normalizeLink(other.link) === link) reason = 'same_link';
      else if (key && nameKey(other.funder, other.title) === key) reason = 'same_funder_and_title';
      else if (sameGrant(grant, other)) reason = 'same_grant_elsewhere';
      else continue;
      match = i;
    }

    if (match < 0 || !reason) {
      kept.push(grant);
      continue;
    }
    // Keep the copy with more checked facts in the earlier copy's place; ties keep the first.
    if (richness(grant) > richness(kept[match])) {
      duplicates.push({ grant: kept[match], reason });
      kept[match] = grant;
    } else {
      duplicates.push({ grant, reason });
    }
  }
  return { kept, duplicates };
}
