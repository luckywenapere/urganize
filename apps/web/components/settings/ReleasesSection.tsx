'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Trash2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { DeleteReleaseDialog } from '@/components/workspace/DeleteReleaseDialog';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useKnownReleaseCount } from '@/components/loading/known-counts';
import { displayReleaseTitle, type Release } from '@/types/releases';
import { panelClass } from './panelClass';
import { InfoTip } from '@/components/shared/HelpTip';
import { formatRolloutCreatedLabel } from '@/lib/settings-rollout-row';

/**
 * Deleting a rollout moves it to Trash (30 days, then removed; see
 * lib/rollout-trash.ts). Since v1.169.1 the owner can also delete from the
 * rollout menu (Delete rollout, last row, in red), after the STMZ user
 * interview (Oct 22, 2026) found the Settings-only delete hard to find. This
 * list stays as the one place to see and clear every rollout at once. Before
 * that it was only available here (URG-163). ONE sanctioned exception since
 * 2026-09-01 (founder call): a TEST release's standing banner in the
 * workspace (TestReleaseBanner, behind NEXT_PUBLIC_FEATURE_TEST_RELEASE)
 * carries its own "Delete test release" button, because the founder asked
 * for the test path to end with the delete option. Real releases keep the
 * Settings-only rule. Self-contained like ProfileSection: reads
 * releases straight from the global stores rather than via parent
 * props, and owns its own delete-confirm dialog end to end.
 */
export function ReleasesSection() {
  const user = useAuthStore((state) => state.user);
  const releases = useReleaseStore((state) => state.releases);
  const isLoadingReleases = useReleaseStore((state) => state.isInitialLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const removeReleaseLocal = useReleaseStore((state) => state.removeReleaseLocal);

  const [releaseToDelete, setReleaseToDelete] = useState<Pick<Release, 'id' | 'title'> | null>(
    null
  );
  // How many rollouts sit in Trash, for the link. A failed read just shows
  // "Trash" with no number; nothing here depends on it.
  const [trashCount, setTrashCount] = useState<number | null>(null);
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch('/api/releases/trash', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: unknown[] };
        if (!cancelled && Array.isArray(payload.items)) setTrashCount(payload.items.length);
      } catch {
        /* the link still works without a count */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, releases.length]);

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
    setTrashCount((count) => (count === null ? count : count + 1));
    void loadCommandCenter({ force: true });
  };

  return (
    <>
      <section id="delete-rollouts" className={`${panelClass} scroll-mt-4`}>
        <h2 className="mb-1 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
          Delete rollout
          <InfoTip
            label="Delete rollout"
            text="Deleting a rollout moves it to Trash with its activities and files. You can restore it for 30 days, then it is removed for good."
          />
        </h2>
        <p className="mb-4 text-sm text-content-secondary">
          Deleting a rollout moves it to Trash. You can restore it for 30 days.
        </p>
        {isLoadingReleases ? (
          <div className="space-y-2">
            {Array.from({ length: knownReleaseCount }).map((_, index) => (
              <SkeletonBlock key={`release-row-skeleton-${index}`} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : ownedReleases.length === 0 ? (
          <p className="text-sm text-content-secondary">No rollouts yet.</p>
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
                      {displayReleaseTitle(release.title)}
                    </p>
                    <p className="truncate text-xs text-content-secondary">
                      {release.artistName || 'Unassigned artist'}
                      {/* Same rule as the catalog cards: 'draft' is the
                          universal starting status, so showing it on every
                          row is noise: the status appears only once the
                          release has moved past it. */}
                      {release.status !== 'draft' ? ` · ${release.status.replace(/_/g, ' ')}` : ''}
                    </p>
                    {/* Tells identical "Untitled rollout" rows apart (v1.92.2). */}
                    {formatRolloutCreatedLabel(release.createdAt) ? (
                      <p className="truncate text-xs text-content-tertiary">
                        {formatRolloutCreatedLabel(release.createdAt)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setReleaseToDelete({ id: release.id, title: displayReleaseTitle(release.title) })}
                    aria-label={`Delete rollout ${displayReleaseTitle(release.title)}`}
                    className="hit-44 relative inline-flex items-center gap-1.5 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-1.5 text-xs font-semibold text-status-error transition-colors hover:bg-status-error/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete rollout
                  </button>
                </div>
              ))}
          </div>
        )}
        <Link
          href="/dashboard/trash"
          className="hit-44 relative mt-4 inline-flex text-[13px] font-medium text-brand-primary underline underline-offset-4"
        >
          {trashCount === null ? 'Trash' : `Trash (${trashCount})`}
        </Link>
      </section>

      <DeleteReleaseDialog
        open={releaseToDelete !== null}
        release={releaseToDelete}
        onClose={() => setReleaseToDelete(null)}
        onDeleted={handleReleaseDeleted}
      />
    </>
  );
}
