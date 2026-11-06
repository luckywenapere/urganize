'use client';

// The smart link at the top of a rollout once its song is out (Nov 2026, #1092,
// docs/mocks/out-now-placement, founder approved). Above the tabs, so it is
// there on every tab. Nothing shows before release day or while the link is
// still being made.

import { useState } from 'react';
import { isReleasedOn } from '@/lib/altlink/rules';
import { displayReleaseTitle } from '@/types/releases';
import { SmartLinkBox, useReleaseSmartLink } from '@/components/releases/SmartLinkBox';

export function RolloutOutNowLink({
  releaseId,
  releaseDate,
  title,
  className = '',
}: {
  releaseId: string;
  releaseDate: string | null | undefined;
  title: string;
  className?: string;
}) {
  const [now] = useState(() => Date.now());
  const released = isReleasedOn(releaseDate ?? null, now);
  const url = useReleaseSmartLink(releaseId, released);
  if (!url) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 text-xs font-semibold text-brand">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        Out now
      </span>
      <SmartLinkBox url={url} title={displayReleaseTitle(title)} releaseId={releaseId} className="min-w-0 flex-1" />
    </div>
  );
}
