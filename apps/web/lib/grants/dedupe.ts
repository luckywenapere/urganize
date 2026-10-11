// Dropping a result the team already has, or has already seen in this run.
//
// Two grants are the same if they share a link, or share a funder AND a title. A
// title alone is never enough (two funders can run a "Touring Grant"), and a funder
// alone is never enough (one funder runs several). Pure.

import type { VerifiedGrant } from './types';

/** What an existing Opportunity holds that matters here. */
export type ExistingOpportunity = { title: string; counterparty: string; notes: string };

export type DuplicateReason = 'same_link' | 'same_funder_and_title' | 'already_tracked';
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

  const seenLinks = new Set<string>();
  const seenNames = new Set<string>();
  const kept: VerifiedGrant[] = [];
  const duplicates: Duplicate[] = [];

  for (const grant of grants) {
    const link = normalizeLink(grant.link);
    const key = nameKey(grant.funder, grant.title);

    let reason: DuplicateReason | null = null;
    if ((link && trackedLinks.has(link)) || (key && trackedNames.has(key))) reason = 'already_tracked';
    else if (link && seenLinks.has(link)) reason = 'same_link';
    else if (key && seenNames.has(key)) reason = 'same_funder_and_title';

    if (reason) {
      duplicates.push({ grant, reason });
      continue;
    }
    if (link) seenLinks.add(link);
    if (key) seenNames.add(key);
    kept.push(grant);
  }
  return { kept, duplicates };
}
