'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Toast } from '@/components/shared/Toast';
import { ReleaseHeader } from '@/components/releases/ReleaseHeader';
import { ReleaseReadinessCard } from '@/components/releases/ReleaseReadinessCard';
import { CollaboratorStatusTable } from '@/components/releases/CollaboratorStatusTable';
import { AddCollaboratorModal } from '@/components/releases/AddCollaboratorModal';
import { MetadataPreviewCard } from '@/components/releases/MetadataPreviewCard';
import { ReleaseStatsMiniCards } from '@/components/releases/ReleaseStatsMiniCards';
import { NextStepCard } from '@/components/releases/NextStepCard';
import type { ReadinessChecklistItem, ReadinessNextAction } from '@/lib/release-ops';

type CommandCenterPayload = {
  release: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string;
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
    allCredits: Array<Record<string, unknown>>;
  } | null;
  error?: string;
};

type ToastState = {
  tone: 'success' | 'error';
  message: string;
};

export default function ReleaseCommandCenterPage() {
  const router = useRouter();
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isAddingCollaborators, setIsAddingCollaborators] = useState(false);
  const [addCollaboratorError, setAddCollaboratorError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [error, setError] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');

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
        throw new Error(payload.error || 'Could not load release command center.');
      }

      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load release command center.');
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

  const collaborators = data?.collaborators || [];
  const selectedSubmission = useMemo(
    () => collaborators.find((item) => item.id === selectedSubmissionId)?.submission || null,
    [collaborators, selectedSubmissionId]
  );
  const firstPendingCollaboratorId = useMemo(
    () => collaborators.find((item) => item.status === 'pending')?.id || '',
    [collaborators]
  );

  const submissionUrlById = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const entries = collaborators.map(
      (item) => [item.id, `${origin}/credits/${item.submissionToken}`] as const
    );
    return new Map(entries);
  }, [collaborators]);

  const handleAddCollaborators = async (
    items: Array<{ inviteName: string; inviteContact: string; role: string }>
  ) => {
    if (!releaseId) return;
    setIsAddingCollaborators(true);
    setAddCollaboratorError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}/collaborators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ collaborators: items }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not add collaborators.');
      }

      setShowAddModal(false);
      setToast({ tone: 'success', message: 'Collaborators added. Links are ready to copy.' });
      await loadData();
    } catch (submitError: any) {
      setAddCollaboratorError(submitError?.message || 'Could not add collaborators.');
    } finally {
      setIsAddingCollaborators(false);
    }
  };

  const handleCopyLink = async (id: string) => {
    const url = submissionUrlById.get(id);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ tone: 'success', message: 'Submission link copied.' });
    } catch {
      setToast({ tone: 'error', message: 'Could not copy the submission link.' });
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
      setToast({ tone: 'success', message: 'Reminder logged and link copied for sharing.' });
      await loadData();
    } catch (remindError: any) {
      setToast({ tone: 'error', message: remindError?.message || 'Could not send reminder.' });
    }
  };

  const handleNextAction = async () => {
    const nextAction = data?.readiness.nextAction;
    if (!nextAction) return;

    if (nextAction.type === 'add_collaborators') {
      setShowAddModal(true);
      return;
    }

    if (nextAction.type === 'send_reminder') {
      if (!firstPendingCollaboratorId) {
        setToast({ tone: 'error', message: 'No pending collaborators to remind.' });
        return;
      }
      await handleRemind(firstPendingCollaboratorId);
      return;
    }

    if (nextAction.type === 'view_metadata') {
      router.push(`/dashboard/releases/${releaseId}/metadata`);
    }
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return (
      <LoadingScreen
        variant="detail"
        eyebrow="Release Command Center"
        title="Loading release operations"
        description="Pulling collaborator status, metadata readiness, and next actions into one workspace."
      />
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-10 pt-20 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link href="/dashboard" className="text-sm text-content-secondary hover:text-content-primary">
            Back to Dashboard
          </Link>
        </div>

        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        {data?.release ? (
          <div className="space-y-6">
            <SectionCard>
              <ReleaseHeader release={data.release} onAddCollaborator={() => setShowAddModal(true)} />
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <SectionCard>
                <ReleaseReadinessCard readiness={data.readiness} />
              </SectionCard>
              <NextStepCard
                nextStep={data.readiness.nextStep}
                action={data.readiness.nextAction}
                onAction={() => void handleNextAction()}
                actionDisabled={
                  data.readiness.nextAction.type === 'send_reminder' && !firstPendingCollaboratorId
                }
              />
            </div>

            <ReleaseStatsMiniCards
              invited={collaborators.length}
              submitted={data.readiness.submittedCollaborators}
              pending={data.readiness.pendingCollaborators}
            />

            <SectionCard>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-content-primary">Collaborator status</p>
                  <p className="mt-2 text-sm text-content-secondary">
                    Copy public links, nudge pending collaborators, and review submitted credits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  Add Collaborator
                </button>
              </div>

              <div className="mt-5">
                {collaborators.length === 0 ? (
                  <EmptyState
                    title="No collaborators added yet."
                    description="Add collaborators to start collecting credits"
                    action={
                      <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                      >
                        Add Collaborator
                      </button>
                    }
                  />
                ) : (
                  <CollaboratorStatusTable
                    collaborators={collaborators}
                    onCopyLink={handleCopyLink}
                    onRemind={handleRemind}
                    onViewSubmission={(id) => setSelectedSubmissionId(id)}
                  />
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <MetadataPreviewCard releaseId={data.release.id} metadata={data.metadata} />
            </SectionCard>
          </div>
        ) : (
          <SectionCard>
            <EmptyState
              title="Something went wrong. Try again."
              description="We could not load this release workspace."
            />
          </SectionCard>
        )}
      </div>

      <AddCollaboratorModal
        open={showAddModal}
        isSubmitting={isAddingCollaborators}
        error={addCollaboratorError}
        onClose={() => setShowAddModal(false)}
        onSubmit={(items) => void handleAddCollaborators(items)}
      />

      {selectedSubmission && data?.release ? (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Submission detail</p>
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
            <div className="mt-5 grid gap-3 text-sm text-content-secondary sm:grid-cols-2">
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
