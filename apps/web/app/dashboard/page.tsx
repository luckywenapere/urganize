'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { DashboardPageSkeleton } from '@/components/loading/DashboardPageSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { getDashboardEmptyStateCopy } from '@/lib/onboarding';

type ReleaseCard = {
  id: string;
  title: string;
  artistName: string;
  progress: number;
  invitedCount: number;
  submittedCount: number;
  pendingCount: number;
  playbook: {
    completedCount: number;
    totalCount: number;
    completionPercent: number;
  };
  setup: {
    progressPercent: number;
    hasTask: boolean;
    hasTrack: boolean;
  };
};

const buildProgressMessage = (release: ReleaseCard) => {
  if (release.invitedCount === 0) {
    return 'No credits yet. Share the link.';
  }

  if (release.pendingCount > 0) {
    return 'Waiting on credits';
  }

  return release.progress >= 100 ? 'Ready' : 'Credits received';
};

const buildSetupMessage = (release: ReleaseCard) => {
  if (release.setup.hasTask && release.setup.hasTrack) {
    return 'Task and track added';
  }

  if (release.setup.hasTask) {
    return 'Task added';
  }

  if (release.setup.hasTrack) {
    return 'Track added';
  }

  return 'Not started';
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [releases, setReleases] = useState<ReleaseCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [releasePendingDelete, setReleasePendingDelete] = useState<ReleaseCard | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredReleases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [...releases];

    return releases.filter((release) => {
      const haystack = `${release.title} ${release.artistName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [releases, searchQuery]);
  const emptyStateCopy = useMemo(() => getDashboardEmptyStateCopy(user?.onboarding_role || null), [user?.onboarding_role]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnce) {
      setIsLoading(true);
    }
    setError('');

    try {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) return;

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const handleWindowClick = () => {
      setOpenMenuId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [openMenuId]);

  const handleCreateRelease = (source: 'dashboard' | 'empty_state') => {
    if (source === 'empty_state') {
      captureAnalyticsEvent({
        name: 'empty_state_cta_clicked',
        properties: {
          feature: 'dashboard',
          cta_label: 'Create Release',
        },
      });
    }

    router.push(`/dashboard/releases/new?source=${source}`);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setReleasePendingDelete(null);
    setDeleteConfirmText('');
  };

  const requestDeleteRelease = (release: ReleaseCard) => {
    setOpenMenuId(null);
    setReleasePendingDelete(release);
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

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
        <div className="space-y-4">
          <header className="panel-shell p-5 sm:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1">
                <p className="saas-eyebrow">Release dashboard</p>
                <h1 className="mt-3 text-[clamp(2.1rem,4vw,3.4rem)] tracking-tight text-content-primary">
                  Track every release
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-content-secondary">
                  Search, open, and clean up rollout work from one board.
                </p>

                <label className="group relative mt-5 flex w-full max-w-full items-center transition-[width] duration-200 ease-out sm:w-[300px] sm:focus-within:w-[360px]">
                  <span className="pointer-events-none absolute left-3.5 text-content-tertiary">
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search releases"
                    aria-label="Search releases"
                    aria-keyshortcuts="Control+K Meta+K"
                    className="input h-12 w-full rounded-full pl-10 pr-16"
                  />
                  <span className="pointer-events-none absolute right-3">
                    <kbd className="kbd">⌘K</kbd>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex min-h-12 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold leading-none text-content-primary">
                  {releases.length} release{releases.length === 1 ? '' : 's'}
                </span>
                <PaywallGate>
                  {({ hasAccess, isLoading: isPaywallLoading, openPaywall }) => (
                    <button
                      type="button"
                      onClick={() => {
                        if (releases.length >= 1 && !isPaywallLoading && !hasAccess) {
                          openPaywall();
                          return;
                        }
                        handleCreateRelease('dashboard');
                      }}
                      className="inline-flex min-h-12 items-center rounded-full border border-brand/20 bg-brand px-5 text-sm font-semibold leading-none text-content-inverse shadow-[0_16px_34px_-24px_rgba(62,207,142,0.52)] hover:bg-brand-hover"
                    >
                      Create release
                    </button>
                  )}
                </PaywallGate>
              </div>
            </div>
          </header>

          {error ? (
            <p className="rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {error}
            </p>
          ) : null}

          <SectionCard className="rounded-[28px] p-4 sm:p-6">
            {filteredReleases.length === 0 ? (
              <EmptyState
                title={releases.length === 0 ? emptyStateCopy.title : 'No matches'}
                description={
                  releases.length === 0 ? emptyStateCopy.description : 'Try another release title or artist.'
                }
                action={
                  releases.length === 0 ? (
                    <PaywallGate>
                      {({ hasAccess, isLoading: isPaywallLoading, openPaywall }) => (
                        <button
                          type="button"
                          onClick={() => {
                            if (releases.length >= 1 && !isPaywallLoading && !hasAccess) {
                              openPaywall();
                              return;
                            }
                            handleCreateRelease('empty_state');
                          }}
                          className="rounded-full border border-brand/20 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                        >
                          Create release
                        </button>
                      )}
                    </PaywallGate>
                  ) : null
                }
              />
            ) : (
              <div className="space-y-4">
                {filteredReleases.map((release) => (
                  <div
                    key={release.id}
                    className="rounded-3xl border border-stroke-subtle bg-bg-elevated p-4 transition hover:-translate-y-[1px] hover:border-stroke-default hover:bg-bg-hover sm:p-6"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/releases/${release.id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-content-primary">{release.title}</p>
                            <p className="mt-1 text-sm text-content-secondary">{release.artistName || 'Unknown artist'}</p>
                          </div>
                          <div className="flex items-center gap-4 sm:justify-end">
                            <div className="flex items-center gap-3 rounded-[20px] border border-stroke-subtle bg-bg-surface/85 px-3 py-2">
                              <div className="relative h-12 w-12 shrink-0">
                                <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
                                  <circle
                                    cx="22"
                                    cy="22"
                                    r="18"
                                    className="fill-none stroke-white/8"
                                    strokeWidth="4"
                                  />
                                  <circle
                                    cx="22"
                                    cy="22"
                                    r="18"
                                    className="fill-none stroke-brand transition-all"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={113.1}
                                    strokeDashoffset={113.1 - 113.1 * (release.setup.progressPercent / 100)}
                                  />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-content-primary">
                                  {release.setup.progressPercent}%
                                </span>
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                                  Setup
                                </p>
                                <p className="text-sm font-semibold text-content-primary">
                                  {buildSetupMessage(release)}
                                </p>
                              </div>
                            </div>
                            <div className="min-w-0 text-left sm:min-w-[130px] sm:text-right">
                              <p className="text-2xl font-semibold text-content-primary">{release.progress}%</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                                Release readiness
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${release.progress}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary">
                          <span>
                            {release.submittedCount} credits received / {release.invitedCount} total credits
                          </span>
                          <span>{buildProgressMessage(release)}</span>
                        </div>
                      </button>

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label={`Open actions for ${release.title}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === release.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((current) => (current === release.id ? null : release.id));
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                        >
                          <span aria-hidden="true" className="text-lg leading-none">⋯</span>
                        </button>

                        {openMenuId === release.id ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="menu-shell absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[180px] p-2"
                          >
                            <button
                              type="button"
                              onClick={() => requestDeleteRelease(release)}
                              className="block w-full rounded-[12px] px-3 py-2 text-left text-sm text-status-error transition hover:bg-status-error/10"
                            >
                              Delete release
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {releasePendingDelete ? (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-release-title"
          className="modal-scrim fixed inset-0 z-[120] flex items-center justify-center p-4"
        >
          <div className="modal-shell w-full max-w-md p-5 sm:p-6">
            <h2 id="delete-release-title" className="text-xl font-semibold text-content-primary">Delete release</h2>
            <p className="mt-2 text-sm text-content-secondary">
              This permanently removes <span className="font-semibold text-content-primary">{releasePendingDelete.title}</span> and its workspace data.
            </p>
            <p className="mt-3 text-sm text-content-secondary">
              Type <span className="font-semibold text-content-primary">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="input mt-3 rounded-2xl border-status-error/35 bg-bg-elevated"
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
                {isDeleting ? 'Deleting...' : 'Delete release'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
