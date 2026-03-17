'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';
import { DashboardPageSkeleton } from '@/components/loading/DashboardPageSkeleton';

type ReleaseCard = {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string;
  status: 'draft' | 'in_progress' | 'ready';
  progress: number;
  invitedCount: number;
  submittedCount: number;
  pendingCount: number;
};

const statusLabels: Record<ReleaseCard['status'], string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  ready: 'Ready',
};

const statusClasses: Record<ReleaseCard['status'], string> = {
  draft: 'border-stroke-default bg-bg-elevated text-content-secondary',
  in_progress: 'border-status-warning/35 bg-status-warning/10 text-status-warning',
  ready: 'border-status-success/35 bg-status-success/10 text-status-success',
};

const formatReleaseDate = (value: string) => {
  if (!value) return 'Not scheduled yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled yet';
  return date.toLocaleDateString();
};

const buildProgressMessage = (release: ReleaseCard) => {
  if (release.invitedCount === 0) {
    return 'Add collaborators to start collecting credits.';
  }

  if (release.pendingCount > 0) {
    return `${release.pendingCount} collaborator${release.pendingCount === 1 ? '' : 's'} still pending.`;
  }

  if (release.status === 'ready') {
    return 'Credits collected and metadata ready for distribution.';
  }

  return 'Credits are in. Review the release metadata next.';
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);
  const [releases, setReleases] = useState<ReleaseCard[]>([]);
  const [releasePendingDelete, setReleasePendingDelete] = useState<ReleaseCard | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedReleases = useMemo(
    () =>
      [...releases].sort((a, b) => {
        const left = new Date(a.releaseDate || '9999-12-31').getTime();
        const right = new Date(b.releaseDate || '9999-12-31').getTime();
        return left - right;
      }),
    [releases]
  );

  const totals = useMemo(
    () => ({
      ready: releases.filter((release) => release.status === 'ready').length,
      active: releases.filter((release) => release.status === 'in_progress').length,
      pendingCollaborators: releases.reduce((sum, release) => sum + release.pendingCount, 0),
    }),
    [releases]
  );

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnce) {
      setIsLoading(true);
    }
    setError('');

    try {
      const entitlement = await getSubscriptionAccess(user.id);
      setHasSubscriptionAccess(entitlement.hasAccess);
      if (!entitlement.hasAccess) {
        setReleases([]);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || '';
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/releases', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as {
        releases?: ReleaseCard[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Could not load releases.');
      }

      setReleases(Array.isArray(payload.releases) ? payload.releases : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load releases.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }

    void loadDashboard();
  }, [authLoading, loadDashboard, router, user]);

  const handleCreateRelease = () => {
    router.push('/dashboard/releases/new');
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setReleasePendingDelete(null);
    setDeleteConfirmText('');
  };

  const confirmDeleteRelease = async () => {
    if (!releasePendingDelete || !user?.id || isDeleting) return;

    setIsDeleting(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || '';
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/plans/${releasePendingDelete.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          confirmationText: deleteConfirmText,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete release.');
      }

      setReleasePendingDelete(null);
      setDeleteConfirmText('');
      await loadDashboard();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete release.');
    } finally {
      setIsDeleting(false);
    }
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <DashboardPageSkeleton />;
  }

  if (hasSubscriptionAccess === false) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[760px] px-6 py-12">
          <SubscriptionPaywall title="Unlock the release command center" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-20 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Dashboard</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.2rem)] tracking-tight text-content-primary">
              Release Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-content-secondary">
              Create release workspaces, invite collaborators, collect credits, and keep every rollout ready for
              distribution.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCreateRelease}
              className="w-full rounded-full bg-brand px-4 py-3 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:w-auto sm:py-2"
            >
              New Release
            </button>
            <Link
              href="/settings"
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Account
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Logout
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Total Releases</p>
            <p className="mt-3 text-3xl font-semibold text-content-primary">{releases.length}</p>
            <p className="mt-2 text-sm text-content-secondary">Every active release workspace in one view.</p>
          </div>
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Ready To Deliver</p>
            <p className="mt-3 text-3xl font-semibold text-content-primary">{totals.ready}</p>
            <p className="mt-2 text-sm text-content-secondary">Releases with credits collected and metadata complete.</p>
          </div>
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Pending Collaborators</p>
            <p className="mt-3 text-3xl font-semibold text-content-primary">{totals.pendingCollaborators}</p>
            <p className="mt-2 text-sm text-content-secondary">
              {totals.active} release{totals.active === 1 ? '' : 's'} currently moving through collection.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">New Workspace</p>
            <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Start the next release</h2>
            <p className="mt-3 text-sm text-content-secondary">
              Create the workspace first, then invite collaborators, gather submissions, and review the structured
              metadata snapshot before distribution.
            </p>

            <button
              type="button"
              onClick={handleCreateRelease}
              className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Create Release Workspace
            </button>

            <div className="mt-6 space-y-3 rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4">
              <div>
                <p className="text-sm font-semibold text-content-primary">1. Create the release</p>
                <p className="mt-1 text-sm text-content-secondary">Set the title, artist, release date, and workspace context.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-content-primary">2. Invite collaborators</p>
                <p className="mt-1 text-sm text-content-secondary">Share secure submission links for writers, producers, and featured artists.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-content-primary">3. Finalize metadata</p>
                <p className="mt-1 text-sm text-content-secondary">Review the generated credits snapshot before delivery.</p>
              </div>
            </div>
          </div>

          <section className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Releases</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Active command-center workspaces</h2>
              </div>
              <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
                {sortedReleases.length} release{sortedReleases.length === 1 ? '' : 's'}
              </span>
            </div>

            {sortedReleases.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-stroke-default bg-bg-elevated px-6 py-10 text-center text-sm text-content-secondary">
                <p className="font-semibold text-content-primary">No release workspaces yet.</p>
                <p className="mt-2">Create your first release to start collecting collaborator credits.</p>
                <button
                  type="button"
                  onClick={handleCreateRelease}
                  className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Create Release
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {sortedReleases.map((release) => (
                  <div
                    key={release.id}
                    className="rounded-3xl border border-stroke-subtle bg-bg-elevated px-4 py-4 transition hover:-translate-y-[1px] hover:border-stroke-default hover:bg-bg-hover sm:px-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/releases/${release.id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-content-primary">{release.title}</p>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClasses[release.status]}`}
                              >
                                {statusLabels[release.status]}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-content-secondary">Artist: {release.artistName || 'Unknown artist'}</p>
                            <p className="mt-1 text-sm text-content-secondary">
                              Release Date: {formatReleaseDate(release.releaseDate)}
                            </p>
                          </div>
                          <div className="min-w-0 text-left sm:min-w-[130px] sm:text-right">
                            <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Readiness</p>
                            <p className="mt-1 text-2xl font-semibold text-content-primary">{release.progress}%</p>
                          </div>
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${release.progress}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary">
                          <span>
                            {release.submittedCount} submitted / {release.invitedCount} invited
                          </span>
                          <span>{buildProgressMessage(release)}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReleasePendingDelete(release);
                          setDeleteConfirmText('');
                        }}
                        className="w-full rounded-2xl border border-status-error/35 bg-status-error/10 px-3 py-3 text-xs font-semibold text-status-error hover:bg-status-error/15 sm:w-auto sm:py-2"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      {releasePendingDelete ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-content-primary">Delete this release?</h2>
            <p className="mt-2 text-sm text-content-secondary">
              This will permanently delete <span className="font-semibold text-content-primary">{releasePendingDelete.title}</span> and its linked release workspace data.
            </p>
            <p className="mt-3 text-sm text-content-secondary">
              Type <span className="font-semibold text-content-primary">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-status-error/35 bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-status-error"
              placeholder="DELETE"
            />
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteRelease()}
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                className="rounded-full bg-status-error px-4 py-2 text-sm font-semibold text-white hover:bg-status-error/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete Release'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
