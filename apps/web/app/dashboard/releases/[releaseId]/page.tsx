'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Toast } from '@/components/shared/Toast';
import { ReleaseHeader } from '@/components/releases/ReleaseHeader';
import { ReleaseWorkspaceTabs } from '@/components/releases/ReleaseWorkspaceTabs';
import { ReleaseSuggestedActionBanner } from '@/components/releases/ReleaseSuggestedActionBanner';
import { CollaboratorStatusTable } from '@/components/releases/CollaboratorStatusTable';
import { MetadataPreviewCard } from '@/components/releases/MetadataPreviewCard';
import { ReleaseTracksSection } from '@/components/tracks/ReleaseTracksSection';
import { CommandCenterSkeleton } from '@/components/loading/CommandCenterSkeleton';
import {
  createReleasePublicCollectionToken,
  type ReadinessChecklistItem,
  type ReadinessNextAction,
} from '@/lib/release-ops';

type CommandCenterPayload = {
  release: {
    id: string;
    title: string;
    artistName: string;
    status: string;
  };
  readiness: {
    completionPercent: number;
    creditsCollected: boolean;
    metadataComplete: boolean;
    metadataReviewed: boolean;
    readyForDistribution: boolean;
    nextStep: string;
    submittedCollaborators: number;
    pendingCollaborators: number;
    checklist: ReadinessChecklistItem[];
    nextAction: ReadinessNextAction;
  };
  collaborators: Array<{
    id: string;
    inviteName: string;
    inviteContact: string;
    role: string;
    status: 'pending' | 'submitted';
    submissionToken: string;
    submittedAt: string | null;
    submission: {
      legalName: string;
      stageName: string;
      notes: string;
      email: string;
      phone: string;
      role: string;
    } | null;
  }>;
  metadata: {
    producerCredits: Array<Record<string, unknown>>;
    writerCredits: Array<Record<string, unknown>>;
    featuredArtistCredits: Array<Record<string, unknown>>;
    mixingCredits: Array<Record<string, unknown>>;
    masteringCredits: Array<Record<string, unknown>>;
    allCredits: Array<Record<string, unknown>>;
  } | null;
  retention: {
    taskCount: number;
    teamMemberCount: number;
    trackCount: number;
    preSaveCampaignCount: number;
    suggestedAction:
      | {
          type: 'upload_track';
          title: string;
          description: string;
          ctaLabel: string;
          target: 'tracks';
        }
      | {
          type: 'add_task' | 'invite_team' | 'launch_pre_save';
          title: string;
          description: string;
          ctaLabel: string;
          href: string;
        }
      | {
          type: 'none';
          title: '';
          description: '';
          ctaLabel: '';
        };
  };
  error?: string;
};

type ToastState = {
  tone: 'success' | 'error';
  message: string;
};

export default function ReleaseCommandCenterPage() {
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [error, setError] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const lastTrackedReleaseIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    if (!releaseId) return;
    setIsLoading(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as CommandCenterPayload;
      if (!response.ok || !payload.release) {
        throw new Error(payload.error || 'Could not load release dashboard.');
      }

      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load release dashboard.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!authLoading && user && releaseId) {
      void loadData();
    }
  }, [authLoading, loadData, releaseId, user]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const currentReleaseId = data?.release?.id || '';
    if (!currentReleaseId || lastTrackedReleaseIdRef.current === currentReleaseId) {
      return;
    }

    lastTrackedReleaseIdRef.current = currentReleaseId;
    captureAnalyticsEvent({
      name: 'release_opened',
      properties: { release_id: currentReleaseId },
    });
  }, [data?.release?.id]);

  const collaborators = data?.collaborators || [];
  const selectedSubmission = useMemo(
    () => collaborators.find((item) => item.id === selectedSubmissionId)?.submission || null,
    [collaborators, selectedSubmissionId]
  );

  const submissionUrlById = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const entries = collaborators.map(
      (item) => [item.id, `${origin}/credits/${item.submissionToken}`] as const
    );
    return new Map(entries);
  }, [collaborators]);
  const publicCollectionUrl = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    if (!origin || !releaseId) return '';
    return `${origin}/credits/${createReleasePublicCollectionToken(releaseId)}`;
  }, [releaseId]);

  const handleCopyLink = async (id: string) => {
    const url = submissionUrlById.get(id);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ tone: 'success', message: 'Credit request link copied.' });
    } catch {
      setToast({ tone: 'error', message: 'Could not copy the credit request link.' });
    }
  };

  const handleRemind = async (id: string) => {
    if (!releaseId) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}/collaborators/${id}/remind`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as { submissionUrl?: string; error?: string };
      if (!response.ok || !payload.submissionUrl) {
        throw new Error(payload.error || 'Could not send reminder.');
      }

      await navigator.clipboard.writeText(payload.submissionUrl);
      setToast({ tone: 'success', message: 'Credit request copied for sharing.' });
      await loadData();
    } catch (remindError: any) {
      setToast({ tone: 'error', message: remindError?.message || 'Could not send credit request.' });
    }
  };

  const handleCopyCreditCollectionLink = async () => {
    if (!publicCollectionUrl) {
      setToast({ tone: 'error', message: 'Credit collection link is not ready yet.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(publicCollectionUrl);
      setToast({ tone: 'success', message: 'Credit collection link copied.' });
    } catch {
      setToast({ tone: 'error', message: 'Could not copy the credit collection link.' });
    }
  };

  const handleOpenCreditCollectionLink = () => {
    if (!publicCollectionUrl) {
      setToast({ tone: 'error', message: 'Credit collection link is not ready yet.' });
      return;
    }

    window.open(publicCollectionUrl, '_blank', 'noopener,noreferrer');
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <CommandCenterSkeleton />;
  }

  if (!user) return <CommandCenterSkeleton />;

  return (
    <main
      className="min-h-screen bg-bg-base text-content-primary"
      data-ph-capture-attribute-section="release_workspace"
    >
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary"
          >
            Back to dashboard
          </Link>
        </div>

        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        {data?.release ? (
          <div className="space-y-7">
            <ReleaseSuggestedActionBanner
              releaseId={data.release.id}
              action={data.retention?.suggestedAction || { type: 'none', title: '', description: '', ctaLabel: '' }}
            />

            <SectionCard className="sm:p-7">
              <ReleaseHeader release={data.release} />
            </SectionCard>

            <SectionCard className="sm:p-5">
              <ReleaseWorkspaceTabs releaseId={data.release.id} />
            </SectionCard>

            <ReleaseTracksSection
              releaseId={data.release.id}
              releaseTitle={data.release.title}
              artistName={data.release.artistName}
            />

            <PaywallGate>
              {({ requireAccess }) => (
                <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
                  <div className="contents lg:block lg:min-w-0 lg:space-y-7">
                    <div className="order-2 min-w-0">
                      <SectionCard className="sm:p-7" data-ph-capture-attribute-section="credits">
                        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-content-primary">Credits</p>
                            <p className="mt-2 text-sm text-content-secondary">
                              Share the public credit link and watch credits appear here.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <StatusBadge label={`Credits ${collaborators.length}`} size="sm" />
                          <StatusBadge
                            label={`Credits received ${data.readiness.submittedCollaborators}`}
                            tone="success"
                            size="sm"
                          />
                          <StatusBadge
                            label={`Waiting on credits ${data.readiness.pendingCollaborators}`}
                            tone={data.readiness.pendingCollaborators > 0 ? 'warning' : 'neutral'}
                            size="sm"
                          />
                        </div>

                        <div className="mt-5">
                          {collaborators.length === 0 ? (
                            <EmptyState
                              title="No credits yet"
                              description="Send your link to start collecting."
                              action={
                                <button
                                  type="button"
                                  onClick={() => void requireAccess(() => handleCopyCreditCollectionLink())}
                                  className="min-h-11 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:w-auto sm:rounded-full sm:py-2"
                                >
                                  Copy credit link
                                </button>
                              }
                            />
                          ) : (
                            <CollaboratorStatusTable
                              collaborators={collaborators}
                              onCopyLink={(id) => void requireAccess(() => handleCopyLink(id))}
                              onRemind={(id) => void requireAccess(() => handleRemind(id))}
                              onViewSubmission={(id) => setSelectedSubmissionId(id)}
                            />
                          )}
                        </div>
                      </SectionCard>
                    </div>
                  </div>

                  <div className="contents lg:block lg:min-w-0 lg:space-y-4">
                    <div className="order-1 min-w-0">
                      <SectionCard className="p-5 sm:p-6" data-ph-capture-attribute-section="credits">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <h2 className="text-lg font-semibold tracking-tight text-content-primary">
                              Collect Credits
                            </h2>
                            <p className="mt-2 text-sm text-content-secondary">
                              Send this link to everyone involved in the release.
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                              Same link for everyone on the release
                            </p>
                          </div>
                          <StatusBadge label="Release-wide" size="sm" />
                        </div>

                        <div className="mt-4 rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">
                            Credit link
                          </p>
                          <p className="mt-2 break-all text-sm text-content-secondary">
                            {publicCollectionUrl || 'Link available after this release finishes loading.'}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void requireAccess(() => handleCopyCreditCollectionLink())}
                            className="min-h-11 flex-1 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                          >
                            Copy credit link
                          </button>
                          <button
                            type="button"
                            onClick={() => void requireAccess(() => handleOpenCreditCollectionLink())}
                            className="min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                          >
                            Open link
                          </button>
                        </div>

                        <p className="mt-4 text-sm text-content-secondary">
                          {data.readiness.submittedCollaborators} credit
                          {data.readiness.submittedCollaborators === 1 ? '' : 's'} received so far
                        </p>
                      </SectionCard>
                    </div>

                    <div className="order-3 min-w-0">
                      <SectionCard className="sm:p-7">
                        <MetadataPreviewCard releaseId={data.release.id} metadata={data.metadata} />
                      </SectionCard>
                    </div>
                  </div>
                </div>
              )}
            </PaywallGate>
          </div>
        ) : (
          <SectionCard>
            <EmptyState
              title="Could not load release."
              description="We could not load this release dashboard."
            />
          </SectionCard>
        )}
      </div>

      {selectedSubmission && data?.release ? (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Credit detail</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">
                  {selectedSubmission.stageName || selectedSubmission.legalName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmissionId('')}
                className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Close
              </button>
            </div>
            <div
              className="mt-5 grid gap-3 text-sm text-content-secondary sm:grid-cols-2"
              data-ph-no-capture
            >
              <p><span className="font-medium text-content-primary">Legal name:</span> {selectedSubmission.legalName}</p>
              <p><span className="font-medium text-content-primary">Stage name:</span> {selectedSubmission.stageName || '—'}</p>
              <p><span className="font-medium text-content-primary">Role:</span> {selectedSubmission.role}</p>
              <p><span className="font-medium text-content-primary">Email:</span> {selectedSubmission.email || '—'}</p>
              <p><span className="font-medium text-content-primary">Phone:</span> {selectedSubmission.phone || '—'}</p>
              <p className="sm:col-span-2"><span className="font-medium text-content-primary">Notes:</span> {selectedSubmission.notes || '—'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
