'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

type FeatureUpsellCardProps = {
  title: string;
  body: string;
};

// Inline (not modal) upsell for a gated section that would otherwise render
// empty — URG-178's "not a dead click or an unexplained 403" requirement.
// Used where a whole section of a page is paid-tier (e.g. the release
// detail Asset section, the Files page) rather than a single nav click
// (which uses UpsellModal via useUpsellStore instead).
export function FeatureUpsellCard({ title, body }: FeatureUpsellCardProps) {
  return (
    <div className="border border-stroke-default bg-bg-surface p-6 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-brand" aria-hidden="true" />
      <p className="mt-3 font-display text-lg font-semibold text-content-primary">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-content-secondary">{body}</p>
      <Link
        href="/locked"
        className="motion-focus motion-press mt-4 inline-flex h-9 items-center bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
      >
        See paid plans
      </Link>
    </div>
  );
}
