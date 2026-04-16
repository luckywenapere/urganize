'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Toast } from '@/components/shared/Toast';
import { ReleasePlaybookProgressCard } from '@/components/releases/ReleasePlaybookProgressCard';
import { ReleasePlaybookPhaseCard } from '@/components/releases/ReleasePlaybookPhaseCard';
import { ReleaseWorkspaceTabs } from '@/components/releases/ReleaseWorkspaceTabs';
import { ReleasePlaybookSkeleton } from '@/components/loading/ReleasePlaybookSkeleton';
import type {
  PlaybookStep,
  ReleasePlaybookPhase,
  ReleasePlaybookPhaseKey,
} from '@/lib/release-playbook';

type PlaybookPayload = {
  release: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string;
    status: 'draft' | 'in_progress' | 'ready';
  };
  playbook: {
    phases: ReleasePlaybookPhase[];
    steps: PlaybookStep[];
    completedCount: number;
    totalCount: number;
    remainingCount: number;
    completionPercent: number;
  };
  error?: string;
  sql?: string;
};

type PlaybookMutationPayload = {
  playbook?: PlaybookPayload['playbook'];
  error?: string;
  sql?: string;
};

type ToastState = {
  tone: 'success' | 'error';
  message: string;
};

type DraftStepState = {
  title: string;
  description: string;
  isSubmitting: boolean;
};

type DraftStepStateByPhase = Partial<Record<ReleasePlaybookPhaseKey, DraftStepState>>;

const EMPTY_DRAFT_STEP: DraftStepState = {
  title: '',
  description: '',
  isSubmitting: false,
};

const formatReleaseDate = (value: string) => {
  if (!value) return 'Not scheduled yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled yet' : date.toLocaleDateString();
};

const statusToneByReleaseStatus: Record<PlaybookPayload['release']['status'], 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  in_progress: 'warning',
  ready: 'success',
};

async function parseJsonResponse<T>(response: Response): Promise<Partial<T>> {
  return (await response.json().catch(() => ({}))) as Partial<T>;
}

export default function ReleasePlaybookPage() {
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [data, setData] = useState<PlaybookPayload | null>(null);
  const [error, setError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingStepId, setPendingStepId] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [draftSteps, setDraftSteps] = useState<DraftStepStateByPhase>({});
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);

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

  const clearTransientEditState = useCallback(() => {
    setEditingStepId(null);
    setEditingTitle('');
    setEditingDescription('');
    setDraftSteps({});
    setDraggedStepId(null);
    setDragOverStepId(null);
  }, []);

  const applyPlaybookUpdate = useCallback((playbook: PlaybookPayload['playbook']) => {
    setData((current) => (current ? { ...current, playbook } : current));
  }, []);

  const requestPlaybookMutation = useCallback(
    async (
      path: string,
      init: RequestInit
    ): Promise<PlaybookPayload['playbook']> => {
      const accessToken = await getAccessToken();
      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers || {}),
        },
      });

      const payload = await parseJsonResponse<PlaybookMutationPayload>(response);
      if (response.status === 501 && typeof payload.sql === 'string') {
        setSchemaSql(payload.sql);
      }

      if (!response.ok || !payload.playbook) {
        throw new Error(payload.error || 'Could not update the release playbook.');
      }

      setSchemaSql('');
      return payload.playbook;
    },
    [getAccessToken]
  );

  const loadData = useCallback(async () => {
    if (!releaseId) return;
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/releases/${releaseId}/playbook`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = await parseJsonResponse<PlaybookPayload>(response);
      if (response.status === 501 && typeof payload.sql === 'string') {
        setSchemaSql(payload.sql);
      }

      if (!response.ok || !payload.release || !payload.playbook) {
        throw new Error(payload.error || 'Could not load release playbook.');
      }

      setSchemaSql('');
      setData(payload as PlaybookPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load release playbook.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [getAccessToken, releaseId]);

  useEffect(() => {
    if (!authLoading && user && releaseId) {
      void loadData();
    }
  }, [authLoading, loadData, releaseId, user]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const handleToggle = useCallback(
    async (stepId: string, isCompleted: boolean) => {
      if (!releaseId) return;

      setPendingStepId(stepId);
      setError('');

      try {
        const playbook = await requestPlaybookMutation(
          `/api/releases/${releaseId}/playbook/steps/${stepId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ isCompleted }),
          }
        );

        applyPlaybookUpdate(playbook);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update release playbook.');
      } finally {
        setPendingStepId('');
      }
    },
    [applyPlaybookUpdate, releaseId, requestPlaybookMutation]
  );

  const handleStartEditing = useCallback((step: PlaybookStep) => {
    setEditingStepId(step.id);
    setEditingTitle(step.title);
    setEditingDescription(step.description || '');
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingStepId(null);
    setEditingTitle('');
    setEditingDescription('');
  }, []);

  const handleCommitEditing = useCallback(
    async (step: PlaybookStep) => {
      if (!releaseId) return;

      const nextTitle = editingTitle.trim();
      const nextDescription = editingDescription.trim();

      if (!nextTitle) {
        setError('Step title is required.');
        return;
      }

      if (nextTitle === step.title && nextDescription === (step.description || '')) {
        handleCancelEditing();
        return;
      }

      setPendingStepId(step.id);
      setError('');

      try {
        const playbook = await requestPlaybookMutation(
          `/api/releases/${releaseId}/playbook/steps/${step.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: nextTitle,
              description: nextDescription,
            }),
          }
        );

        applyPlaybookUpdate(playbook);
        handleCancelEditing();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update playbook step.');
      } finally {
        setPendingStepId('');
      }
    },
    [
      applyPlaybookUpdate,
      editingDescription,
      editingTitle,
      handleCancelEditing,
      releaseId,
      requestPlaybookMutation,
    ]
  );

  const handleDelete = useCallback(
    async (step: PlaybookStep) => {
      if (!releaseId) return;

      const shouldDelete = step.isCustom
        ? true
        : window.confirm('Remove this step from your playbook?');

      if (!shouldDelete) {
        return;
      }

      setPendingStepId(step.id);
      setError('');

      try {
        const playbook = await requestPlaybookMutation(
          `/api/releases/${releaseId}/playbook/steps/${step.id}`,
          {
            method: 'DELETE',
          }
        );

        applyPlaybookUpdate(playbook);
        if (editingStepId === step.id) {
          handleCancelEditing();
        }

        setToast({
          tone: 'success',
          message: step.isCustom ? 'Custom step deleted.' : 'Default step removed for this release.',
        });
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Could not delete playbook step.');
      } finally {
        setPendingStepId('');
      }
    },
    [
      applyPlaybookUpdate,
      editingStepId,
      handleCancelEditing,
      releaseId,
      requestPlaybookMutation,
    ]
  );

  const handleBeginAddStep = useCallback((phaseKey: ReleasePlaybookPhaseKey) => {
    setDraftSteps((current) => ({
      ...current,
      [phaseKey]: current[phaseKey] || { ...EMPTY_DRAFT_STEP },
    }));
  }, []);

  const handleChangeDraftTitle = useCallback((phaseKey: ReleasePlaybookPhaseKey, value: string) => {
    setDraftSteps((current) => ({
      ...current,
      [phaseKey]: {
        ...(current[phaseKey] || { ...EMPTY_DRAFT_STEP }),
        title: value,
      },
    }));
  }, []);

  const handleChangeDraftDescription = useCallback((phaseKey: ReleasePlaybookPhaseKey, value: string) => {
    setDraftSteps((current) => ({
      ...current,
      [phaseKey]: {
        ...(current[phaseKey] || { ...EMPTY_DRAFT_STEP }),
        description: value,
      },
    }));
  }, []);

  const handleCancelDraft = useCallback((phaseKey: ReleasePlaybookPhaseKey) => {
    setDraftSteps((current) => {
      const next = { ...current };
      delete next[phaseKey];
      return next;
    });
  }, []);

  const handleSubmitDraft = useCallback(
    async (
      phaseKey: ReleasePlaybookPhaseKey,
      options?: { keepOpen?: boolean }
    ) => {
      if (!releaseId) return;

      const draftStep = draftSteps[phaseKey];
      if (!draftStep) {
        return;
      }

      const title = draftStep.title.trim();
      const description = draftStep.description.trim();

      if (!title) {
        if (!options?.keepOpen) {
          handleCancelDraft(phaseKey);
        }
        return;
      }

      setDraftSteps((current) => ({
        ...current,
        [phaseKey]: {
          ...(current[phaseKey] || { ...EMPTY_DRAFT_STEP }),
          isSubmitting: true,
        },
      }));
      setError('');

      try {
        const playbook = await requestPlaybookMutation(
          `/api/releases/${releaseId}/playbook/steps`,
          {
            method: 'POST',
            body: JSON.stringify({
              phaseKey,
              title,
              description,
            }),
          }
        );

        applyPlaybookUpdate(playbook);
        if (options?.keepOpen) {
          setDraftSteps((current) => ({
            ...current,
            [phaseKey]: { ...EMPTY_DRAFT_STEP },
          }));
        } else {
          handleCancelDraft(phaseKey);
        }
      } catch (createError) {
        setDraftSteps((current) => ({
          ...current,
          [phaseKey]: {
            ...(current[phaseKey] || { ...EMPTY_DRAFT_STEP }),
            isSubmitting: false,
          },
        }));
        setError(createError instanceof Error ? createError.message : 'Could not create playbook step.');
      }
    },
    [
      applyPlaybookUpdate,
      draftSteps,
      handleCancelDraft,
      releaseId,
      requestPlaybookMutation,
    ]
  );

  const handleRestoreDefaults = useCallback(async () => {
    if (!releaseId) return;

    setError('');

    try {
      const playbook = await requestPlaybookMutation(
        `/api/releases/${releaseId}/playbook/restore-defaults`,
        {
          method: 'POST',
        }
      );

      applyPlaybookUpdate(playbook);
      setToast({ tone: 'success', message: 'Missing default steps restored.' });
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Could not restore defaults.');
    }
  }, [applyPlaybookUpdate, releaseId, requestPlaybookMutation]);

  const handleDoneEditMode = useCallback(() => {
    setIsEditMode(false);
    clearTransientEditState();
  }, [clearTransientEditState]);

  const handleDragStartStep = useCallback((stepId: string) => {
    setDraggedStepId(stepId);
    setDragOverStepId(stepId);
  }, []);

  const handleDragEndStep = useCallback(() => {
    setDraggedStepId(null);
    setDragOverStepId(null);
  }, []);

  const handleDragEnterStep = useCallback((stepId: string) => {
    setDragOverStepId(stepId);
  }, []);

  const handleDropStep = useCallback(
    async (phaseKey: ReleasePlaybookPhaseKey, targetStepId: string) => {
      if (!releaseId || !data?.playbook || !draggedStepId || draggedStepId === targetStepId) {
        setDraggedStepId(null);
        setDragOverStepId(null);
        return;
      }

      const phase = data.playbook.phases.find((entry) => entry.key === phaseKey);
      if (!phase) {
        setDraggedStepId(null);
        setDragOverStepId(null);
        return;
      }

      const currentSteps = [...phase.items];
      const draggedIndex = currentSteps.findIndex((step) => step.id === draggedStepId);
      const targetIndex = currentSteps.findIndex((step) => step.id === targetStepId);

      if (draggedIndex < 0 || targetIndex < 0) {
        setDraggedStepId(null);
        setDragOverStepId(null);
        return;
      }

      const [draggedStep] = currentSteps.splice(draggedIndex, 1);
      currentSteps.splice(targetIndex, 0, draggedStep);

      setPendingStepId(draggedStepId);
      setError('');

      try {
        const playbook = await requestPlaybookMutation(
          `/api/releases/${releaseId}/playbook/steps/reorder`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              orderedStepIds: currentSteps.map((step) => step.id),
            }),
          }
        );

        applyPlaybookUpdate(playbook);
      } catch (reorderError) {
        setError(reorderError instanceof Error ? reorderError.message : 'Could not reorder playbook steps.');
      } finally {
        setPendingStepId('');
        setDraggedStepId(null);
        setDragOverStepId(null);
      }
    },
    [applyPlaybookUpdate, data?.playbook, draggedStepId, releaseId, requestPlaybookMutation]
  );

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <ReleasePlaybookSkeleton />;
  }

  if (!user) return <ReleasePlaybookSkeleton />;

  const visiblePhases = isEditMode
    ? data?.playbook.phases || []
    : (data?.playbook.phases || []).filter((phase) => phase.items.length > 0);

  return (
    <PaywallGate>
      {({ requireAccess }) => (
        <main className="min-h-screen bg-bg-base text-content-primary">
          <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
            <div className="mb-4">
              <Link
                href={`/dashboard/releases/${releaseId}`}
                className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary"
              >
                Back to release
              </Link>
            </div>

            {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
            {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}
            {schemaSql ? (
              <div className="mb-4">
                <SqlSetupNotice
                  title="Playbook tables still need to be created"
                  description="Run this SQL once in Supabase to enable editable release playbooks, then reload the page."
                  sql={schemaSql}
                />
              </div>
            ) : null}

            {data?.release ? (
              <div className="space-y-6">
                <SectionCard className="sm:p-7">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Playbook</p>
                        <StatusBadge
                          label={data.release.status.replace('_', ' ')}
                          tone={statusToneByReleaseStatus[data.release.status]}
                        />
                        {isEditMode ? <StatusBadge label="Edit mode" tone="warning" /> : null}
                      </div>
                      <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
                        {data.release.title}
                      </h1>
                      <p className="mt-4 max-w-3xl text-sm text-content-secondary">
                        A structured checklist of the key steps strong music teams typically take when preparing and
                        releasing a song.
                      </p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Artist</p>
                          <p className="mt-2 text-base font-semibold text-content-primary">
                            {data.release.artistName || 'Not set'}
                          </p>
                        </div>
                        <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Release date</p>
                          <p className="mt-2 text-base font-semibold text-content-primary">
                            {formatReleaseDate(data.release.releaseDate)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[280px]">
                      <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Workspace</p>
                      <div className="mt-3 flex flex-col gap-3">
                        {isEditMode ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void requireAccess(() => handleRestoreDefaults())}
                              className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                            >
                              Restore Defaults
                            </button>
                            <button
                              type="button"
                              onClick={handleDoneEditMode}
                              className="min-h-11 w-full rounded-2xl bg-brand px-5 py-3 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                            >
                              Done
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void requireAccess(() => setIsEditMode(true))}
                            className="min-h-11 w-full rounded-2xl bg-brand px-5 py-3 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                          >
                            Edit Playbook
                          </button>
                        )}
                        <Link
                          href={`/dashboard/releases/${releaseId}`}
                          className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        >
                          Overview
                        </Link>
                        <Link
                          href={`/dashboard/releases/${releaseId}/metadata`}
                          className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        >
                          View Metadata
                        </Link>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard className="sm:p-5">
                  <ReleaseWorkspaceTabs releaseId={releaseId} />
                </SectionCard>

                <SectionCard className="sm:p-7">
                  <ReleasePlaybookProgressCard
                    completionPercent={data.playbook.completionPercent}
                    completedCount={data.playbook.completedCount}
                    totalCount={data.playbook.totalCount}
                    remainingCount={data.playbook.remainingCount}
                  />
                </SectionCard>

                {visiblePhases.length === 0 ? (
                  <SectionCard>
                    <EmptyState
                      title={isEditMode ? 'No playbook steps yet' : 'No playbook items yet'}
                      description={
                        isEditMode
                          ? 'Add custom steps or restore the default template to bring this release playbook back.'
                          : 'This release playbook will populate with the default phased checklist.'
                      }
                      action={
                        isEditMode ? (
                          <button
                            type="button"
                            onClick={() => {
                              captureAnalyticsEvent({
                                name: 'empty_state_cta_clicked',
                                properties: {
                                  feature: 'playbook',
                                  cta_label: 'Restore Defaults',
                                },
                              });
                              void requireAccess(() => handleRestoreDefaults());
                            }}
                            className="min-h-11 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                          >
                            Restore Defaults
                          </button>
                        ) : undefined
                      }
                    />
                  </SectionCard>
                ) : (
                  <div className="grid gap-5 xl:grid-cols-2">
                    {visiblePhases.map((phase) => (
                      <ReleasePlaybookPhaseCard
                        key={phase.key}
                        phase={phase}
                        isEditMode={isEditMode}
                        pendingStepId={pendingStepId}
                        editingStepId={editingStepId}
                        editingTitle={editingTitle}
                        editingDescription={editingDescription}
                        draftStep={draftSteps[phase.key] || null}
                        draggedStepId={draggedStepId}
                        dragOverStepId={dragOverStepId}
                        onToggle={(stepId, isCompleted) => void requireAccess(() => handleToggle(stepId, isCompleted))}
                        onStartEditing={(step) => void requireAccess(() => handleStartEditing(step))}
                        onChangeEditingTitle={setEditingTitle}
                        onChangeEditingDescription={setEditingDescription}
                        onCommitEditing={(step) => void requireAccess(() => handleCommitEditing(step))}
                        onCancelEditing={handleCancelEditing}
                        onDelete={(step) => void requireAccess(() => handleDelete(step))}
                        onBeginAddStep={(phaseKey) => void requireAccess(() => handleBeginAddStep(phaseKey))}
                        onChangeDraftTitle={handleChangeDraftTitle}
                        onChangeDraftDescription={handleChangeDraftDescription}
                        onSubmitDraft={(phaseKey, options) => void requireAccess(() => handleSubmitDraft(phaseKey, options))}
                        onCancelDraft={handleCancelDraft}
                        onDragStartStep={handleDragStartStep}
                        onDragEndStep={handleDragEndStep}
                        onDragEnterStep={handleDragEnterStep}
                        onDropStep={(phaseKey, targetStepId) => void requireAccess(() => handleDropStep(phaseKey, targetStepId))}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <SectionCard>
                {schemaSql ? (
                  <SqlSetupNotice
                    title="Playbook tables still need to be created"
                    description="Run this SQL once in Supabase to enable editable release playbooks, then reload the page."
                    sql={schemaSql}
                  />
                ) : (
                  <EmptyState
                    title="Could not load playbook."
                    description="We could not load this release playbook."
                  />
                )}
              </SectionCard>
            )}
          </div>
        </main>
      )}
    </PaywallGate>
  );
}
