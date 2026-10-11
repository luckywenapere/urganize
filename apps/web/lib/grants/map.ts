// Turning a verified grant into the body of a new Opportunity.
//
// The result goes through the real `parseOpportunityCreate` before it is trusted, so
// the validation stays in one place. Three things the table forces, all handled here:
// the currency defaults to naira (so an amount never travels without its own
// currency), a past deadline would sit at the top of the list as overdue forever (so
// a closed round saves no deadline), and there is no column for the source link or
// the date it was read (so both live in the notes). Pure.

import { MAX_COUNTERPARTY, MAX_NOTES, MAX_TITLE, type OpportunityCreate } from '../opportunities';
import { describeFigure } from './money';
import type { VerifiedGrant } from './types';

export const GRANT_NEXT_STEP = 'Check eligibility and apply';

/** Cut at a word within the limit. Never adds an ellipsis: a title is a name. */
function cutAtWord(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const space = slice.lastIndexOf(' ');
  return (space > 0 ? slice.slice(0, space) : text.slice(0, max)).trim();
}

function describeTiming(grant: VerifiedGrant): string {
  if (grant.status === 'closed') {
    return grant.lastClosedOn
      ? `Closed for now: last round closed on ${grant.lastClosedOn}, watch for the next.`
      : 'Closed for now. Watch for the next round.';
  }
  if (grant.rolling) return 'Rolling applications, so there is no single deadline.';
  if (grant.status === 'open' && grant.deadline) return `Applications close on ${grant.deadline}.`;
  return 'No deadline found on the page.';
}

function describeMoney(grant: VerifiedGrant): string | null {
  if (grant.figureNote) return `Award: ${grant.figureNote} (a currency we cannot save, so it is not in the amount field).`;
  if (grant.amount !== null && grant.currency === null) {
    return `Award: ${describeFigure({ amount: grant.amount, currency: 'NGN', raw: '' }).replace(/^NGN /, '')} (no currency found, so it is not in the amount field).`;
  }
  return null;
}

export function grantToOpportunity(grant: VerifiedGrant, options: { why: string }): OpportunityCreate {
  const head = [`Source: ${grant.link}`, `Read on ${grant.readOn}.`, describeTiming(grant)];
  const money = describeMoney(grant);
  if (money) head.push(money);
  if (options.why.trim()) head.push(options.why.trim());
  const fixed = head.join('\n');

  // Eligibility is the only part that gives way when the notes run long.
  const lines = [...grant.eligibility];
  const build = (): string => (lines.length ? `${fixed}\n\nEligibility, as the page words it:\n${lines.map((line) => `- ${line}`).join('\n')}` : fixed);
  let notes = build();
  while (notes.length > MAX_NOTES && lines.length > 0) {
    lines.pop();
    notes = build();
  }
  if (notes.length > MAX_NOTES) notes = notes.slice(0, MAX_NOTES);

  const hasCurrency = grant.amount !== null && grant.currency !== null;
  return {
    title: cutAtWord(grant.title, MAX_TITLE),
    kind: 'grant',
    status: 'idea',
    counterparty: grant.funder ? cutAtWord(grant.funder, MAX_COUNTERPARTY) : '',
    amount: hasCurrency ? grant.amount : null,
    currency: hasCurrency ? (grant.currency as NonNullable<VerifiedGrant['currency']>) : 'NGN',
    nextStep: GRANT_NEXT_STEP,
    nextStepOn: null,
    deadlineOn: grant.status === 'open' ? grant.deadline : null,
    notes,
    artistId: null,
    releaseId: null,
  };
}
