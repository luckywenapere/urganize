'use client';

// The Curator Terms or the Artist Terms, folded behind their title. Shared by
// the curator's bank account step and the artist's checkout, so both read the
// same clauses from lib/pitch-payment-terms.ts and neither can drift.

import type { TermsClause } from '@/lib/pitch-payment-terms';

type PitchTermsProps = {
  terms: { title: string; clauses: TermsClause[] };
};

export function PitchTerms({ terms }: PitchTermsProps) {
  return (
    <details className="group rounded-xl border border-stroke-default bg-bg-base px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-semibold text-content-primary marker:text-content-tertiary">
        {terms.title}
      </summary>
      <ul className="mt-2 space-y-2 pb-1">
        {terms.clauses.map((clause) => (
          <li key={clause.title} className="text-sm text-content-secondary">
            <span className="font-semibold text-content-primary">{clause.title}</span> {clause.body}
          </li>
        ))}
      </ul>
    </details>
  );
}
