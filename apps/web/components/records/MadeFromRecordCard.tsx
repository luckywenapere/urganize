'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { recordHref } from '@/lib/artist-page';
import { fetchReleaseRecord, type ReleaseRecordLink } from '@/lib/next-records-client';

// "Made from your record" on a rollout (next record v2, mock screen 8): the
// songs, sessions and people it came from stay one tap away. Renders nothing
// for a rollout that was not planned from a record.

export function MadeFromRecordCard({ releaseId }: { releaseId: string }) {
  // Keyed by the rollout, so switching rollout never shows the last one's record.
  const [found, setFound] = useState<{ releaseId: string; link: ReleaseRecordLink | null } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchReleaseRecord(releaseId).then((link) => {
      if (live) setFound({ releaseId, link });
    });
    return () => {
      live = false;
    };
  }, [releaseId]);

  const link = found?.releaseId === releaseId ? found.link : null;
  if (!link) return null;
  return (
    <Link
      href={recordHref(link.artistId, link.recordId)}
      className="motion-focus flex items-center justify-between gap-3 rounded-[14px] border border-stroke-default bg-bg-surface px-3.5 py-3 transition-colors hover:border-stroke-strong"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-content-primary">Made from your record</span>
        <span className="block truncate text-[13px] text-content-secondary">{link.line}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
    </Link>
  );
}
