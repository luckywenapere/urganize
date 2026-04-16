/* eslint-disable @next/next/no-img-element */
'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { PaywallGate } from '@/components/billing/PaywallGate';
import {
  STREAMING_PLATFORMS,
  buildAbsolutePreSaveUrl,
  buildPreSavePath,
  formatReleaseDate,
  type CreatePreSaveCampaignBody,
  type CreatePreSaveCampaignResponse,
  type PreSaveApiError,
  type PreSaveCampaign,
  type PreSaveCampaignListResponse,
  type PreSaveReleaseOption,
  type ReleaseSelectorListResponse,
  type StreamingPlatformKey,
} from '@/lib/pre-save';
import { SectionCard } from '@/components/shared/SectionCard';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
import { Toast } from '@/components/shared/Toast';
import { PreSaveDashboardSkeleton } from '@/components/pre-save/PreSaveDashboardSkeleton';
import { ReleaseCombobox } from '@/components/pre-save/ReleaseCombobox';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

type CampaignFormState = {
  artistName: string;
  streamingLinks: Record<StreamingPlatformKey, string>;
};

type CreateReleaseResponse = {
  release?: PreSaveReleaseOption;
  releaseId?: string;
  error?: string;
  details?: string;
  sql?: string;
};

function createEmptyStreamingLinks(): Record<StreamingPlatformKey, string> {
  return {
    spotify: '',
    apple: '',
    youtube: '',
    audiomack: '',
    boomplay: '',
    soundcloud: '',
  };
}

function createInitialFormState(defaultArtistName = ''): CampaignFormState {
  return {
    artistName: defaultArtistName,
    streamingLinks: createEmptyStreamingLinks(),
  };
}

function formatCampaignCreatedDate(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Recently created';
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildCampaignRequestBody(
  formState: CampaignFormState,
  selectedRelease: PreSaveReleaseOption
): CreatePreSaveCampaignBody {
  return {
    artistName: formState.artistName,
    releaseId: selectedRelease.id,
    streamingLinks: formState.streamingLinks,
  };
}

function getCoverFallbackMonogram(artistName: string, releaseTitle: string): string {
  const source = `${artistName} ${releaseTitle}`.trim();
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return initials || 'U';
}

function normalizeReleaseTitle(value: string): string {
  return value.trim().toLowerCase();
}

function findExactReleaseMatch(
  releases: PreSaveReleaseOption[],
  value: string
): PreSaveReleaseOption | null {
  const normalizedValue = normalizeReleaseTitle(value);
  if (!normalizedValue) {
    return null;
  }

  return (
    releases.find((release) => normalizeReleaseTitle(release.title) === normalizedValue) || null
  );
}

function getDefaultArtistName(user: unknown): string {
  const candidateRecord = (user || {}) as {
    artist_name?: string;
    artistName?: string;
    name?: string;
  };

  return String(candidateRecord.artist_name || candidateRecord.artistName || candidateRecord.name || '').trim();
}

function PreSaveDashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const [campaigns, setCampaigns] = useState<PreSaveCampaign[]>([]);
  const [releases, setReleases] = useState<PreSaveReleaseOption[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<PreSaveReleaseOption | null>(null);
  const [releaseQuery, setReleaseQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pageError, setPageError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingInlineRelease, setIsCreatingInlineRelease] = useState(false);
  const [createError, setCreateError] = useState('');
  const [exportingCampaignId, setExportingCampaignId] = useState<string | null>(null);
  const [formState, setFormState] = useState<CampaignFormState>(createInitialFormState());
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const inlineCreateRequestRef = useRef<Promise<PreSaveReleaseOption | null> | null>(null);
  const prefillReleaseId = searchParams.get('releaseId');

  const isModalBusy = isCreating || isCreatingInlineRelease;
  const totalSubscribers = useMemo(
    () => campaigns.reduce((sum, campaign) => sum + campaign.subscriberCount, 0),
    [campaigns]
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || '';
    if (!accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    return accessToken;
  }, []);

  const loadCampaigns = useCallback(async (showInitialLoading = false) => {
    if (!user) {
      return;
    }

    if (showInitialLoading) {
      setIsLoading(true);
    }

    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/pre-save/campaigns', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        PreSaveCampaignListResponse & PreSaveApiError
      >;

      if (!response.ok) {
        if (response.status === 501 && payload.sql) {
          setSchemaSql(payload.sql);
          setCampaigns([]);
          return;
        }

        throw new Error(payload.error || 'Could not load pre-save campaigns.');
      }

      setSchemaSql('');
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load pre-save campaigns.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [getAccessToken, user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.replace('/auth');
      return;
    }

    void loadCampaigns(!hasLoadedOnce);
  }, [authLoading, hasLoadedOnce, loadCampaigns, router, user]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timeoutId = window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 40);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isModalBusy) {
        setIsCreateModalOpen(false);
        setCreateError('');
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timeoutId);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isCreateModalOpen, isModalBusy]);

  useEffect(() => {
    if (!isCreateModalOpen || !user) {
      return;
    }

    let isActive = true;

    const loadReleases = async () => {
      setIsLoadingReleases(true);
      setCreateError('');

      try {
        const accessToken = await getAccessToken();
        const response = await fetch('/api/releases?view=selector', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<
          ReleaseSelectorListResponse & PreSaveApiError
        >;

        if (!response.ok) {
          throw new Error(payload.error || 'Could not load your releases.');
        }

        if (!isActive) {
          return;
        }

        setReleases(Array.isArray(payload.releases) ? payload.releases : []);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setCreateError(error instanceof Error ? error.message : 'Could not load your releases.');
      } finally {
        if (isActive) {
          setIsLoadingReleases(false);
        }
      }
    };

    void loadReleases();

    return () => {
      isActive = false;
    };
  }, [getAccessToken, isCreateModalOpen, user]);

  useEffect(() => {
    if (!prefillReleaseId || authLoading || !user) {
      return;
    }

    setIsCreateModalOpen(true);
  }, [authLoading, prefillReleaseId, user]);

  const applySelectedRelease = useCallback((release: PreSaveReleaseOption) => {
    setSelectedRelease(release);
    setReleaseQuery(release.title);
    setFormState((current) =>
      current.artistName || !release.artistName
        ? current
        : {
            ...current,
            artistName: release.artistName,
          }
    );
    setCreateError('');
  }, []);

  useEffect(() => {
    if (!prefillReleaseId || !isCreateModalOpen || releases.length === 0) {
      return;
    }

    const matchingRelease = releases.find((release) => release.id === prefillReleaseId) || null;
    if (!matchingRelease) {
      return;
    }

    if (selectedRelease?.id !== matchingRelease.id) {
      applySelectedRelease(matchingRelease);
    }

    router.replace('/dashboard/pre-save');
  }, [applySelectedRelease, isCreateModalOpen, prefillReleaseId, releases, router, selectedRelease?.id]);

  const openCreateModal = (source: 'header' | 'empty_state' = 'header') => {
    if (source === 'empty_state') {
      captureAnalyticsEvent({
        name: 'empty_state_cta_clicked',
        properties: {
          feature: 'pre_save',
          cta_label: 'Create your first campaign',
        },
      });
    }

    const defaultArtistName = getDefaultArtistName(user);
    setFormState(createInitialFormState(defaultArtistName));
    setReleases([]);
    setSelectedRelease(null);
    setReleaseQuery('');
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isModalBusy) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateError('');
  };

  const updateStreamingLink = (platformKey: StreamingPlatformKey, value: string) => {
    setFormState((current) => ({
      ...current,
      streamingLinks: {
        ...current.streamingLinks,
        [platformKey]: value,
      },
    }));
  };

  const handleReleaseQueryChange = (value: string) => {
    setReleaseQuery(value);
    setCreateError('');
    setSelectedRelease((current) => {
      if (!current) {
        return null;
      }

      return normalizeReleaseTitle(current.title) === normalizeReleaseTitle(value) ? current : null;
    });
  };

  const createInlineRelease = useCallback(async (title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return null;
    }

    const existingRelease = findExactReleaseMatch(releases, trimmedTitle);
    if (existingRelease) {
      applySelectedRelease(existingRelease);
      return existingRelease;
    }

    if (inlineCreateRequestRef.current) {
      return inlineCreateRequestRef.current;
    }

    const requestPromise = (async () => {
      setIsCreatingInlineRelease(true);
      setCreateError('');

      try {
        const accessToken = await getAccessToken();
        const response = await fetch('/api/releases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: trimmedTitle,
            artistName: formState.artistName.trim() || undefined,
            source: 'dashboard',
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<
          CreateReleaseResponse & PreSaveApiError
        >;

        if (!response.ok) {
          throw new Error(payload.error || 'Could not create a release from that title.');
        }

        if (!payload.release?.id) {
          throw new Error('Release created, but no release record was returned.');
        }

        const createdRelease = payload.release;
        setReleases((current) => [
          createdRelease,
          ...current.filter((release) => release.id !== createdRelease.id),
        ]);
        applySelectedRelease(createdRelease);
        return createdRelease;
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Could not create a release from that title.');
        return null;
      } finally {
        inlineCreateRequestRef.current = null;
        setIsCreatingInlineRelease(false);
      }
    })();

    inlineCreateRequestRef.current = requestPromise;
    return requestPromise;
  }, [applySelectedRelease, formState.artistName, getAccessToken, releases]);

  const handleCopyLink = async (slug: string) => {
    try {
      const absoluteUrl = buildAbsolutePreSaveUrl(slug, window.location.origin);
      await navigator.clipboard.writeText(absoluteUrl);
      const matchingCampaign = campaigns.find((campaign) => campaign.slug === slug) || null;
      if (matchingCampaign) {
        captureAnalyticsEvent({
          name: 'presave_link_copied',
          properties: { campaign_id: matchingCampaign.id },
        });
      }
      setToast({
        message: 'Pre-save link copied.',
        tone: 'success',
      });
    } catch {
      setToast({
        message: 'Could not copy the link right now.',
        tone: 'error',
      });
    }
  };

  const handleExport = async (campaign: PreSaveCampaign) => {
    if (exportingCampaignId) {
      return;
    }

    setExportingCampaignId(campaign.id);
    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/pre-save/campaigns/${campaign.id}/export`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Partial<PreSaveApiError>;
        throw new Error(payload.error || 'Could not export subscribers.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = `subscribers-${campaign.slug}.csv`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      window.URL.revokeObjectURL(blobUrl);

      setToast({
        message: 'Subscriber export downloaded.',
        tone: 'success',
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not export subscribers.');
    } finally {
      setExportingCampaignId(null);
    }
  };

  const handleCreateCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setCreateError('');
    setPageError('');

    try {
      let release = selectedRelease;
      if (!release) {
        if (!releaseQuery.trim()) {
          throw new Error('Choose a release or type a new release title to create one.');
        }

        release = await createInlineRelease(releaseQuery);
        if (!release) {
          return;
        }
      }

      const accessToken = await getAccessToken();
      const response = await fetch('/api/pre-save/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildCampaignRequestBody(formState, release)),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        CreatePreSaveCampaignResponse & PreSaveApiError
      >;

      if (!response.ok) {
        if (response.status === 501 && payload.sql) {
          setSchemaSql(payload.sql);
          setIsCreateModalOpen(false);
          throw new Error('Pre-save tables still need to be set up.');
        }

        throw new Error(payload.error || 'Could not create this campaign.');
      }

      setIsCreateModalOpen(false);
      setFormState(createInitialFormState(getDefaultArtistName(user)));
      setSelectedRelease(null);
      setReleaseQuery('');
      setToast({
        message: 'Pre-save campaign created.',
        tone: 'success',
      });

      await loadCampaigns(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create this campaign.');
    } finally {
      setIsCreating(false);
    }
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <PreSaveDashboardSkeleton />;
  }

  if (!user) {
    return <PreSaveDashboardSkeleton />;
  }

  const selectedReleaseMonogram = selectedRelease
    ? getCoverFallbackMonogram(selectedRelease.artistName, selectedRelease.title)
    : 'U';

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_22px_56px_-32px_rgba(0,0,0,0.46)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-content-tertiary">
            Pre-save links
          </p>
          <h1 className="mt-4 text-4xl text-content-primary sm:text-5xl">
            Launch pre-save pages fast
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-content-secondary sm:text-base">
            Launch a capture page, collect emails, and export the full list anytime.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary">
              {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
            </div>
            <div className="inline-flex min-h-11 items-center rounded-full border border-brand/20 bg-brand-muted px-4 text-sm font-semibold text-content-primary">
              {totalSubscribers} subscriber{totalSubscribers === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

          {pageError ? (
            <p className="rounded-[24px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {pageError}
            </p>
          ) : null}

          {schemaSql ? (
            <SqlSetupNotice
              title="Pre-save tables still need to be created"
              description="Run this SQL once in Supabase, then refresh the dashboard to start creating campaigns."
              sql={schemaSql}
            />
          ) : null}
        </div>

        <SectionCard
          className="mt-5 rounded-[32px] p-4 sm:p-6"
          data-ph-capture-attribute-section="presave"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl text-content-primary">Campaigns</h2>
              <p className="mt-2 text-sm text-content-secondary">
                Copy the link, preview the public page, or export every subscriber as CSV.
              </p>
            </div>

            <PaywallGate>
              {({ requireAccess }) => (
                <button
                  type="button"
                  onClick={() => void requireAccess(() => openCreateModal('header'))}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand/20 bg-brand px-5 text-sm font-semibold text-content-inverse shadow-[0_18px_40px_-26px_rgba(62,207,142,0.58)] transition hover:bg-brand-hover"
                >
                  New campaign
                </button>
              )}
            </PaywallGate>
          </div>

          {campaigns.length === 0 ? (
            <div className="mt-5 rounded-[30px] border border-dashed border-stroke-default bg-bg-elevated/80 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-content-primary">No pre-save campaigns yet.</p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-content-secondary">
                Create your first link to collect fan emails before release day.
              </p>
              <PaywallGate>
                {({ requireAccess }) => (
                  <button
                    type="button"
                    onClick={() => void requireAccess(() => openCreateModal('empty_state'))}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-5 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
                  >
                    Create campaign
                  </button>
                )}
              </PaywallGate>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {campaigns.map((campaign) => {
                const platformCount = Object.values(campaign.streamingLinks).filter(Boolean).length;
                const coverFallbackMonogram = getCoverFallbackMonogram(campaign.artistName, campaign.releaseTitle);
                const isExporting = exportingCampaignId === campaign.id;

                return (
                  <article
                    key={campaign.id}
                    className="rounded-[30px] border border-stroke-subtle bg-bg-elevated/80 p-4 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.5)] transition hover:border-stroke-default hover:bg-bg-hover sm:p-5"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] border border-stroke-default bg-bg-overlay">
                          {campaign.coverArtUrl ? (
                            <img
                              src={campaign.coverArtUrl}
                              alt={`${campaign.releaseTitle} cover`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.24),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                              <span className="text-2xl font-semibold tracking-[-0.08em] text-content-primary">
                                {coverFallbackMonogram}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-2xl text-content-primary">{campaign.releaseTitle}</h3>
                            <span className="inline-flex min-h-7 items-center rounded-full border border-brand/20 bg-brand-muted px-3 text-xs font-semibold uppercase tracking-[0.16em] text-content-primary">
                              {campaign.subscriberCount} subscriber{campaign.subscriberCount === 1 ? '' : 's'}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-content-secondary">{campaign.artistName}</p>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                            <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-content-secondary">
                              {formatReleaseDate(campaign.releaseDate)}
                            </span>
                            <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-content-secondary">
                              {platformCount} platform{platformCount === 1 ? '' : 's'}
                            </span>
                            <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-content-secondary">
                              Created {formatCampaignCreatedDate(campaign.createdAt)}
                            </span>
                          </div>

                          <div className="mt-4 rounded-[22px] border border-stroke-default bg-bg-surface/95 px-4 py-3 text-sm text-content-secondary">
                            <span className="text-content-tertiary">Shareable link</span>
                            <p className="mt-1 truncate font-mono text-[13px] text-content-primary">
                              {buildPreSavePath(campaign.slug)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <a
                          href={buildPreSavePath(campaign.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary transition hover:bg-bg-hover"
                        >
                          Preview
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleCopyLink(campaign.slug)}
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary transition hover:bg-bg-hover"
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleExport(campaign)}
                          disabled={isExporting}
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-65"
                        >
                          {isExporting ? 'Preparing CSV...' : 'Export CSV'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-[150] flex items-start justify-center bg-black/70 p-4 sm:p-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-[32px] border border-stroke-default bg-bg-surface/98 p-5 shadow-[0_36px_90px_-48px_rgba(0,0,0,0.72)] sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-content-tertiary">
                  New campaign
                </p>
                <h2 className="mt-3 text-3xl text-content-primary">Create pre-save page</h2>
                <p className="mt-3 text-sm leading-7 text-content-secondary">
                  Pick an existing release or create one inline, then add the fan-facing links.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={isModalBusy}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-65"
              >
                <span className="sr-only">Close create campaign modal</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 6 18 18" strokeLinecap="round" />
                  <path d="M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {createError ? (
              <p className="mt-5 rounded-[24px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                {createError}
              </p>
            ) : null}

            <PaywallGate>
              {({ requireAccess }) => (
                <form
                  className="mt-6 space-y-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void requireAccess(() => handleCreateCampaign(event));
                  }}
                >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Artist name</span>
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={formState.artistName}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        artistName: event.target.value,
                      }))
                    }
                    className="input h-12 rounded-[18px]"
                    placeholder="Artist name"
                    required
                  />
                </label>

                <div className="rounded-[22px] border border-stroke-default bg-bg-elevated/80 px-4 py-3 text-sm text-content-secondary">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                    Release source
                  </p>
                  <p className="mt-2 leading-6">
                    Campaign artwork, title, and release date now come from the linked release record.
                  </p>
                </div>
              </div>

              <section className="rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">Release</h3>
                    <p className="mt-1 text-sm text-content-secondary">
                      Search your releases or type a new title and press Enter.
                    </p>
                  </div>
                  <div className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-secondary">
                    {isLoadingReleases
                      ? 'Loading...'
                      : `${releases.length} release${releases.length === 1 ? '' : 's'}`}
                  </div>
                </div>

                <div className="mt-5">
                  <ReleaseCombobox
                    releases={releases}
                    selectedRelease={selectedRelease}
                    query={releaseQuery}
                    isLoading={isLoadingReleases}
                    isCreating={isCreatingInlineRelease}
                    onQueryChange={handleReleaseQueryChange}
                    onSelectRelease={applySelectedRelease}
                    onCreateRelease={createInlineRelease}
                  />
                </div>

                {selectedRelease ? (
                  <div className="mt-5 flex flex-col gap-4 rounded-[24px] border border-stroke-default bg-bg-surface/90 p-4 sm:flex-row sm:items-center">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] border border-stroke-default bg-bg-overlay">
                      {selectedRelease.coverArtUrl ? (
                        <img
                          src={selectedRelease.coverArtUrl}
                          alt={`${selectedRelease.title} cover`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.24),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                          <span className="text-2xl font-semibold tracking-[-0.08em] text-content-primary">
                            {selectedReleaseMonogram}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                        Selected release
                      </p>
                      <h4 className="mt-2 truncate text-xl text-content-primary">{selectedRelease.title}</h4>
                      <p className="mt-1 text-sm text-content-secondary">{selectedRelease.artistName || 'Artist name pending'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                        <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-content-secondary">
                          {formatReleaseDate(selectedRelease.releaseDate)}
                        </span>
                        <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-content-secondary">
                          {selectedRelease.coverArtUrl ? 'Artwork linked' : 'Artwork can be added later'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-content-secondary">
                    Choose a release or type a new title and press Enter.
                  </p>
                )}
              </section>

              <section className="rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">Streaming links</h3>
                    <p className="mt-1 text-sm text-content-secondary">
                      Add any destinations you want fans to see after they subscribe.
                    </p>
                  </div>
                  <div className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-secondary">
                    Optional
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {STREAMING_PLATFORMS.map((platform) => (
                    <label key={platform.key} className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">
                        {platform.label}
                      </span>
                      <input
                        type="url"
                        value={formState.streamingLinks[platform.key]}
                        onChange={(event) => updateStreamingLink(platform.key, event.target.value)}
                        className="input h-12 rounded-[18px]"
                        placeholder="https://..."
                      />
                    </label>
                  ))}
                </div>
              </section>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isModalBusy}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-stroke-default bg-bg-elevated px-5 text-sm font-semibold text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-65"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || isCreatingInlineRelease}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand/20 bg-brand px-5 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isCreating
                    ? 'Creating campaign...'
                    : isCreatingInlineRelease
                      ? 'Creating release...'
                      : 'Create Campaign'}
                </button>
              </div>
                </form>
              )}
            </PaywallGate>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function PreSaveDashboardPage() {
  return (
    <Suspense fallback={<PreSaveDashboardSkeleton />}>
      <PreSaveDashboardPageContent />
    </Suspense>
  );
}
