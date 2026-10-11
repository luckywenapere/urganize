// Suggested grants as a team sees them, and what Add turns one into.
//
// A suggestion is a pointer to a curated programme (grant_programmes) plus why
// it matched. Add copies the programme into the team's own Opportunities as a
// grant at "Idea", with the funder's page kept as its source. Dismiss keeps the
// row as a tombstone so the programme never comes back to that team.
//
// Pure. Today is passed in.

import { MAX_NOTES, MAX_TITLE, OPPORTUNITY_CURRENCIES, type OpportunityCurrency } from '@/lib/opportunities';
import type { GrantProgramme } from './programmes';

export type GrantSuggestionView = {
  id: string;
  why: string;
  funder: string;
  programme: string;
  kind: GrantProgramme['kind'];
  summary: string;
  /** "Up to $5,000", "£500 to £2,000", or empty when the funder states no figure. */
  award: string;
  deadlineOn: string | null;
  url: string;
  suggestedAt: string;
};

export const GRANT_SUGGESTIONS_COPY = {
  title: 'Suggested grants',
  description: 'Open grants that fit your profile. Add one to track it, or dismiss it and it will not come back.',
  add: 'Add',
  dismiss: 'Dismiss',
  read: 'Read the call',
  rolling: 'No fixed deadline',
};

const SYMBOL: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

function money(amount: number, currency: string): string {
  const figure = amount.toLocaleString('en', { maximumFractionDigits: 0 });
  const symbol = SYMBOL[currency];
  return symbol ? `${symbol}${figure}` : `${figure} ${currency}`;
}

/** The per-recipient award in words. Never a fund total: the curator only stores awards. */
export function describeAward(p: Pick<GrantProgramme, 'amountMin' | 'amountMax' | 'currency'>): string {
  if (!p.currency) return '';
  const { amountMin: min, amountMax: max } = p;
  if (min !== null && max !== null && min !== max) return `${money(min, p.currency)} to ${money(max, p.currency)}`;
  const one = max ?? min;
  if (one === null) return '';
  return max !== null ? `Up to ${money(one, p.currency)}` : `From ${money(one, p.currency)}`;
}

/** A suggestion whose round has closed since it was made is not shown. */
export function isSuggestionLive(deadlineOn: string | null, today: string): boolean {
  return deadlineOn === null || deadlineOn >= today;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The body Add sends through parseOpportunityCreate, so an added grant passes
 * the same rules as one typed by hand. The amount is set only when the funder's
 * currency is one Opportunities knows; otherwise it goes in the notes as words.
 */
export function opportunityFromProgramme(p: GrantProgramme): Record<string, unknown> {
  const known = (OPPORTUNITY_CURRENCIES as readonly string[]).includes(p.currency ?? '');
  const amount = p.amountMax ?? p.amountMin;
  const award = describeAward(p);
  const notes = [
    p.summary,
    award ? `Award: ${award}.` : '',
    p.eligibility ? `Who can apply: ${p.eligibility}` : '',
    `Call: ${p.sourceUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    title: clip(p.programme, MAX_TITLE),
    kind: 'grant',
    status: 'idea',
    counterparty: clip(p.funder, 120),
    amount: known && amount !== null ? amount : null,
    currency: known ? (p.currency as OpportunityCurrency) : 'NGN',
    nextStep: 'Read the call and check you qualify',
    nextStepOn: null,
    deadlineOn: p.deadlineOn,
    notes: clip(notes, MAX_NOTES),
  };
}

export type SuggestionAction = 'add' | 'dismiss';

export function parseSuggestionAction(body: unknown): { value: SuggestionAction } | { error: string } {
  const action = body && typeof body === 'object' ? (body as Record<string, unknown>).action : undefined;
  if (action === 'add' || action === 'dismiss') return { value: action };
  return { error: 'Say add or dismiss.' };
}
