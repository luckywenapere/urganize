'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownNoteCount } from './known-counts';

/**
 * Loading shape for /dashboard/notes. Mirrors NotesPageClient's layout
 * term-for-term, including the .notes-shell-height column lock — keep the two
 * in sync (CLAUDE.md's loading-skeleton rule).
 *
 * Deliberately NOT reserved: the release filter pill (it depends on a URL
 * param this component can't see) and the mobile editor pane (a fresh load
 * below lg always resolves to the list, never straight into a note).
 */
export function NotesPageSkeleton() {
  const noteCount = useKnownNoteCount();

  return (
    <div className="notes-shell-height flex flex-col gap-4 lg:flex-row lg:gap-6" aria-hidden="true">
      <section className="flex min-h-0 flex-col lg:w-[320px] lg:shrink-0">
        <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
          <SkeletonBlock className="h-6 w-16 rounded" />
          {/* The archived toggle and New note. A cold load always resolves
              to the ACTIVE view, which is the pair that renders there —
              the archive shows a single wider control instead, and is
              never what a fresh load lands on. */}
          <div className="flex shrink-0 items-center gap-2">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <SkeletonBlock className="h-8 w-24 rounded-full" />
          </div>
        </div>
        {/* The search bar renders unconditionally, so it is reserved
            unconditionally — h-9 plus the pb-3 the real one carries. */}
        <div className="shrink-0 pb-3">
          <SkeletonBlock className="h-9 w-full rounded-full" />
        </div>
        <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
          {Array.from({ length: noteCount }).map((_, index) => (
            <div
              key={index}
              className={`px-3.5 py-2.5 ${index > 0 ? 'border-t border-stroke-subtle' : ''}`}
            >
              <SkeletonBlock className="h-3.5 w-2/3 rounded" />
              <SkeletonBlock className="mt-1.5 h-3 w-full rounded" />
              <SkeletonBlock className="mt-1.5 h-2.5 w-24 rounded" />
            </div>
          ))}
        </div>
      </section>

      <section className="hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
        <div className="flex shrink-0 items-center gap-2 pb-3">
          <SkeletonBlock className="h-8 w-32 rounded-full" />
          <div className="flex-1" />
          {/* Pin, archive, delete. */}
          <SkeletonBlock className="h-8 w-8 rounded-full" />
          <SkeletonBlock className="h-8 w-8 rounded-full" />
          <SkeletonBlock className="h-8 w-8 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-[46rem] space-y-3">
          <SkeletonBlock className="h-4 w-1/2 rounded" />
          <SkeletonBlock className="h-3 w-full rounded" />
          <SkeletonBlock className="h-3 w-5/6 rounded" />
          <SkeletonBlock className="h-3 w-2/3 rounded" />
        </div>
      </section>
    </div>
  );
}
