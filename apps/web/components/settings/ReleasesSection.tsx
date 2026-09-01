'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { DeleteReleaseDialog } from '@/components/workspace/DeleteReleaseDialog';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useKnownReleaseCount } from '@/components/loading/known-counts';
import type { Release } from '@/types/releases';
import { panelClass } from './panelClass';

/**
 * Deleting a release is only available here (URG-163) — the workspace's
 * per-release trash icons were removed. ONE sanctioned exception since
 * 2026-09-01 (founder call): a TEST release's standing banner in the
 * workspace (TestReleaseBanner, behind NEXT_PUBLIC_FEATURE_TEST_RELEASE)
 * carries its own "Delete test release" button, because the founder asked
 * for the test path to end with the delete option. Real releases keep the
 * Settings-only rule. Self-contained like ProfileSection: reads
 * releases/tasks straight from the global stores rather than via parent
 * props, and owns its own delete-confirm dialog end to end.
 */
export function ReleasesSection() {
  const user = useAuthStore((state) => state.user);
  const releases = useReleaseStore((state) => state.releases);
  const isLoadingReleases = useReleaseStore((state) => state.isInitialLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const removeReleaseLocal = useReleaseStore((state) => state.removeReleaseLocal);
  const tasks = useTaskStore((state) => state.tasks);

  const [releaseToDelete, setReleaseToDelete] = useState<Pick<Release, 'id' | 'title'> | null>(
    null
  );
  // Count-aware loading rows — matches the user's last-known roster size.
  const knownReleaseCount = useKnownReleaseCount(2, 6);

  // Settings can be the FIRST route a session hydrates (direct link,
  // refresh) — the store's own recency guard makes this a no-op if a
  // workspace visit already loaded it, so it's safe to call unconditionally
  // here too.
  useEffect(() => {
    if (!user) return;
    void loadCommandCenter();
  }, [user, loadCommandCenter]);

  if (!user) return null;

  // Deletion is OWNER-ONLY (founder decision, 2026-07-23; the API already
  // enforces it via ensureReleaseOwnership). With whole-workspace visibility
  // the store now carries shared releases too — this list shows only the
  // ones the user actually owns, so teammates never see a Delete button
  // that would be refused. Legacy rows without ownerUserId (pre-0.27 cache)
  // are treated as owned — they only ever came from the owner-only query.
  const ownedReleases = releases.filter(
    (release) => !release.ownerUserId || release.ownerUserId === user.id
  );

  const handleReleaseDeleted = (releaseId: string) => {
    setReleaseToDelete(null);
    // Drop the release + its tasks from local state immediately, then
    // re-sync against the server — same two-step handoff the workspace used.
    removeReleaseLocal(releaseId);
    void loadCommandCenter({ force: true });
  };

  return (
    <>
      <section className={panelClass}>
        <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Releases</h2>
        {/* Used to say "only available here" (URG-163). Narrowed at the
            test-path flip (2026-09-01, v1.16.0): a TEST release's own banner
            can delete it too, so "only" stopped being true. This is still the
            one place a REAL release is deleted. */}
        <p className="mb-4 text-sm text-content-secondary">
          Delete a release here. This permanently removes it, its activities,
          and its attached files.
        </p>
        {isLoadingReleases ? (
          <div className="space-y-2">
            {Array.from({ length: knownReleaseCount }).map((_, index) => (
              <SkeletonBlock key={`release-row-skeleton-${index}`} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : ownedReleases.length === 0 ? (
          <p className="text-sm text-content-secondary">No releases yet.</p>
        ) : (
          <div className="space-y-2">
            {[...ownedReleases]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((release) => (
                <div
                  key={release.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content-primary">
                      {release.title}
                    </p>
                    <p className="truncate text-xs text-content-secondary">
                      {release.artistName || 'Unassigned artist'}
                      {/* Same rule as the catalog cards: 'draft' is the
                          universal starting status, so showing it on every
                          row is noise — the status appears only once the
                          release has moved past it. */}
                      {release.status !== 'draft' ? ` · ${release.status.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReleaseToDelete({ id: release.id, title: release.title })}
                    aria-label={`Delete ${release.title}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-xs font-semibold text-content-tertiary transition-colors hover:border-status-error/40 hover:bg-status-error/10 hover:text-status-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>

      <DeleteReleaseDialog
        open={releaseToDelete !== null}
        release={releaseToDelete}
        tasksTotal={
          releaseToDelete ? tasks.filter((task) => task.releaseId === releaseToDelete.id).length : 0
        }
        onClose={() => setReleaseToDelete(null)}
        onDeleted={handleReleaseDeleted}
      />
    </>
  );
}
