// Home's Opportunities card (URG-266, 2026-10-14): the newest open things a team
// can go after, at the top of Home, with a way into /dashboard/opportunities.
//
// Two sources, both read through the routes the Opportunities page already uses.
// No new table and no new query:
//
//  1. Suggested grants (`GET /api/opportunities/grant-suggestions`). These are
//     the matched ones: the weekly run in lib/grants/weekly-run-core.ts picks
//     them against the team's grant profile (country, genres, career stage,
//     who applies, what they need) and writes the reason into `why`. Paid teams
//     only (founder, 2026-10-11), so the card never matches live itself: doing
//     that here would hand the paid feed to every team through Home.
//  2. The team's own open opportunities (`GET /api/opportunities`), newest
//     first. This is the fallback when there is no match data, and it fills the
//     card when there are fewer than three suggestions.
//
// Pure. Today is passed in.

import { isClosed, KIND_LABEL, type OpportunityView } from '@/lib/opportunities';
import { isSuggestionLive, type GrantSuggestionView } from '@/lib/grants/suggestions';

export const HOME_OPPORTUNITIES_MAX = 3;
export const HOME_OPPORTUNITIES_HREF = '/dashboard/opportunities';

export const HOME_OPPORTUNITIES_COPY = {
  label: 'Opportunities',
  seeAll: 'See all',
  suggested: 'Suggested',
  rolling: 'No fixed deadline',
  emptyTitle: 'No open opportunities yet',
  emptyDescription: 'Grants and deals that fit your team will show up here.',
  emptyAction: 'Find opportunities',
} as const;

export type HomeOpportunitySource = 'suggested' | 'saved';

export type HomeOpportunityItem = {
  key: string;
  source: HomeOpportunitySource;
  title: string;
  /** "Grant", "Brand", "Residency". */
  kindLabel: string;
  /** "Closes in 12 days", "No fixed deadline", or empty when there is nothing to say. */
  deadlineLabel: string;
  /** Why a suggestion matched, or who a saved one is with. May be empty. */
  detail: string;
  /** For analytics: the raw kind, never a title or a name. */
  kind: string;
};

function titleCase(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function daysFrom(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** A deadline in words. Past deadlines say so rather than counting days late. */
export function describeDeadline(deadlineOn: string | null, today: string): string {
  if (!deadlineOn) return '';
  const days = daysFrom(today, deadlineOn);
  if (!Number.isFinite(days)) return '';
  if (days < 0) return 'Deadline passed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return `Closes in ${days} days`;
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Up to three items: live suggestions first (newest suggestion first), then the
 * team's open opportunities (newest added first), never the same title twice.
 */
export function pickHomeOpportunities(
  input: {
    suggestions: readonly GrantSuggestionView[];
    opportunities: readonly OpportunityView[];
  },
  today: string,
  max: number = HOME_OPPORTUNITIES_MAX
): HomeOpportunityItem[] {
  const items: HomeOpportunityItem[] = [];

  const suggestions = input.suggestions
    .filter((s) => isSuggestionLive(s.deadlineOn, today))
    .slice()
    .sort((a, b) => (a.suggestedAt < b.suggestedAt ? 1 : a.suggestedAt > b.suggestedAt ? -1 : 0));
  for (const s of suggestions) {
    if (items.length >= max) break;
    if (items.some((item) => sameTitle(item.title, s.programme))) continue;
    items.push({
      key: `suggested:${s.id}`,
      source: 'suggested',
      title: s.programme,
      kindLabel: titleCase(s.kind),
      deadlineLabel: s.deadlineOn ? describeDeadline(s.deadlineOn, today) : HOME_OPPORTUNITIES_COPY.rolling,
      detail: s.why || s.funder,
      kind: s.kind,
    });
  }

  const open = input.opportunities
    .filter((o) => !isClosed(o.status))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  for (const o of open) {
    if (items.length >= max) break;
    if (items.some((item) => sameTitle(item.title, o.title))) continue;
    items.push({
      key: `saved:${o.id}`,
      source: 'saved',
      title: o.title,
      kindLabel: KIND_LABEL[o.kind] ?? titleCase(o.kind),
      deadlineLabel: describeDeadline(o.deadlineOn, today),
      detail: o.counterparty,
      kind: o.kind,
    });
  }

  return items;
}

/** The card's meta line under a title: kind, then "Suggested", then the deadline. */
export function homeOpportunityMeta(item: HomeOpportunityItem): string {
  return [item.kindLabel, item.source === 'suggested' ? HOME_OPPORTUNITIES_COPY.suggested : '', item.deadlineLabel]
    .filter(Boolean)
    .join(' · ');
}

/**
 * What the card draws once its loads settle:
 *  - 'hidden' when neither list could be read (an artist-scoped teammate gets a
 *    403 from both, a signed-out tab gets nothing): no card, not an empty one.
 *  - 'empty' when the reads worked and there is nothing open.
 *  - 'list' otherwise.
 */
export function homeOpportunitiesView(input: {
  opportunitiesOk: boolean;
  items: readonly HomeOpportunityItem[];
}): 'hidden' | 'empty' | 'list' {
  if (input.items.length > 0) return 'list';
  if (!input.opportunitiesOk) return 'hidden';
  return 'empty';
}
