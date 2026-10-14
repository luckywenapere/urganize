'use client';

import Link from 'next/link';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import type { UpNext } from '@/lib/home/up-next';

/**
 * Shown in the tasks slot on a day with no tasks, so Home always ends in one
 * next move. The stack's chip says "Up next", so the card does not repeat it.
 */
export function UpNextCard({ next }: { next: UpNext }) {
  return (
    <div>
      <p className="break-words font-display text-lg font-semibold leading-snug text-content-primary">
        {next.title}
      </p>
      <p className="mt-1 text-sm text-content-secondary">{next.detail}</p>
      <div className="mt-4 flex">
        <Link
          href={next.href}
          onClick={next.href === '/dashboard' ? leaveReleaseForCatalog : undefined}
          className="motion-focus motion-press inline-flex h-11 w-full items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse hover:opacity-90 sm:w-auto"
        >
          {next.action}
        </Link>
      </div>
    </div>
  );
}
