'use client';

import Link from 'next/link';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import type { UpNext } from '@/lib/home/up-next';

/** Shown in the Do this first slot on a day with no tasks, so Home always ends in one next move. */
export function UpNextCard({ next }: { next: UpNext }) {
  return (
    <section aria-label={next.eyebrow} className="rounded-2xl border border-stroke-default bg-bg-surface p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">{next.eyebrow}</p>
      <p className="mt-3 break-words font-display text-xl font-semibold leading-snug text-content-primary sm:text-2xl">
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
    </section>
  );
}
