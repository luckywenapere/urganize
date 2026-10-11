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
    <details className="group text-sm">
      <summary className="cursor-pointer select-none font-semibold text-content-secondary marker:text-content-tertiary hover:text-content-primary">
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
