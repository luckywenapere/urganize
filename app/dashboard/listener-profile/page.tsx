'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { clearPersistedState, readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { deleteUiDraft, fetchUiDraft, saveUiDraft } from '@/lib/ui-drafts';
import { AiRecoveryActions } from '@/components/ui/AiRecoveryActions';
import {
  EMPTY_LISTENER_PROFILE_INPUTS,
  LISTENER_PROFILE_FIELDS,
  LISTENER_PROFILE_SECTIONS,
  normalizeListenerProfileInputs,
  parseListenerPersonaResult,
  type ListenerPersonaResult,
  type ListenerProfileInputs,
} from '@/lib/listener-profile';

type RouteMode = 'flow' | 'review' | 'generating' | 'result';

type InputsResponse = {
  exists?: boolean;
  inputs?: Record<string, unknown>;
  generatedAt?: string | null;
  updatedAt?: string | null;
  error?: string;
  sql?: string;
};

type ResultResponse = {
  exists?: boolean;
  persona?: ListenerPersonaResult | null;
  generatedAt?: string | null;
  error?: string;
  sql?: string;
};

type ListenerProfileDraft = {
  mode: Exclude<RouteMode, 'generating'>;
  stepIndex: number;
  inputs: ListenerProfileInputs;
  managedArtistDraft: string;
  isEditingManagedArtist: boolean;
};

const LISTENER_PROFILE_DRAFT_VERSION = 1;
const LISTENER_PROFILE_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LISTENER_PROFILE_DRAFT_SCOPE = 'listener-profile';

const isListenerProfileDraft = (value: unknown): value is ListenerProfileDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ListenerProfileDraft>;
  return (
    (draft.mode === 'flow' || draft.mode === 'review' || draft.mode === 'result') &&
    typeof draft.stepIndex === 'number' &&
    Number.isFinite(draft.stepIndex) &&
    !!draft.inputs &&
    typeof draft.inputs === 'object'
  );
};

const getMissingCount = (
  inputs: ListenerProfileInputs,
  fields: ReadonlyArray<{ key: keyof ListenerProfileInputs }>
): number => {
  return fields.reduce((total, field) => total + (inputs[field.key] ? 0 : 1), 0);
};

const getFirstUnansweredIndex = (
  inputs: ListenerProfileInputs,
  fields: ReadonlyArray<{ key: keyof ListenerProfileInputs }>
): number => {
  const index = fields.findIndex((field) => !inputs[field.key]);
  return index < 0 ? Math.max(0, fields.length - 1) : index;
};

const toAiUiErrorMessage = (error: string | null | undefined, fallback: string): string => {
  const message = String(error || '').trim();
  if (!message) return fallback;
  if (/rate-limited|rate limited/i.test(message)) return message;
  if (/temporarily unavailable|try again shortly/i.test(message)) return message;
  return fallback;
};

export default function ListenerProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSavingInputs, setIsSavingInputs] = useState(false);
  const [mode, setMode] = useState<RouteMode>('flow');
  const [inputs, setInputs] = useState<ListenerProfileInputs>({ ...EMPTY_LISTENER_PROFILE_INPUTS });
  const [stepIndex, setStepIndex] = useState(0);
  const [stepValue, setStepValue] = useState('');
  const [persona, setPersona] = useState<ListenerPersonaResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [isEditingManagedArtist, setIsEditingManagedArtist] = useState(false);
  const [managedArtistDraft, setManagedArtistDraft] = useState('');
  const [resumeMessage, setResumeMessage] = useState('');
  const [showResumeMessage, setShowResumeMessage] = useState(false);

  const flowFields = useMemo(
    () => (user?.role === 'manager' ? LISTENER_PROFILE_FIELDS : LISTENER_PROFILE_FIELDS.filter((field) => field.key !== 'artist_name')),
    [user?.role]
  );
  const draftStorageKey = useMemo(() => (user?.id ? `urganize.listenerProfileDraft.v${LISTENER_PROFILE_DRAFT_VERSION}.${user.id}` : ''), [user?.id]);

  const totalSteps = flowFields.length;
  const activeField = flowFields[stepIndex] || null;
  const missingCount = useMemo(() => getMissingCount(inputs, flowFields), [flowFields, inputs]);
  const completionPercent = totalSteps === 0 ? 100 : Math.round(((totalSteps - missingCount) / totalSteps) * 100);
  const isArtistLockedName = user?.role === 'artist' && String(user?.artist_name || '').trim().length > 0;

  useEffect(() => {
    if (!activeField) return;
    setStepValue(inputs[activeField.key] || '');
  }, [activeField, inputs]);

  useEffect(() => {
    setStepIndex((current) => Math.min(current, Math.max(0, flowFields.length - 1)));
  }, [flowFields.length]);

  const getToken = useCallback(async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  const applyArtistNameLock = useCallback(
    (baseInputs: ListenerProfileInputs): ListenerProfileInputs => {
      if (isArtistLockedName) {
        return {
          ...baseInputs,
          artist_name: String(user?.artist_name || '').trim(),
        };
      }
      return baseInputs;
    },
    [isArtistLockedName, user?.artist_name]
  );

  const getDraftInputs = useCallback((): ListenerProfileInputs => {
    if (!activeField) return inputs;
    if ((isArtistLockedName || user?.role === 'manager') && activeField.key === 'artist_name') {
      return inputs;
    }
    return {
      ...inputs,
      [activeField.key]: stepValue.trim() || null,
    };
  }, [activeField, inputs, isArtistLockedName, stepValue, user?.role]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setIsLoadingPage(true);
    setError('');
    setSchemaSql(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        return;
      }

      const [inputsRes, resultRes] = await Promise.all([
        fetch('/api/listener-profile/inputs', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/listener-profile/result', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      const inputsPayload = (await inputsRes.json().catch(() => ({}))) as InputsResponse;
      const resultPayload = (await resultRes.json().catch(() => ({}))) as ResultResponse;

      if (!inputsRes.ok) {
        setError(inputsPayload.error || 'Could not load listener inputs.');
        if (inputsRes.status === 501 && inputsPayload.sql) setSchemaSql(inputsPayload.sql);
        return;
      }
      if (!resultRes.ok) {
        setError(resultPayload.error || 'Could not load listener result.');
        if (resultRes.status === 501 && resultPayload.sql) setSchemaSql(resultPayload.sql);
        return;
      }

      let normalizedInputs = applyArtistNameLock(normalizeListenerProfileInputs((inputsPayload.inputs || null) as Record<string, unknown> | null));
      let nextMode: RouteMode = 'flow';
      let nextStepIndex = getFirstUnansweredIndex(normalizedInputs, flowFields);
      const localDraft = readPersistedState<ListenerProfileDraft>(
        draftStorageKey,
        LISTENER_PROFILE_DRAFT_VERSION,
        isListenerProfileDraft,
        LISTENER_PROFILE_DRAFT_MAX_AGE_MS
      );
      const remoteDraftResult = await fetchUiDraft<ListenerProfileDraft>(LISTENER_PROFILE_DRAFT_SCOPE, draftStorageKey);
      const restoredDraft = localDraft || (remoteDraftResult.payload && isListenerProfileDraft(remoteDraftResult.payload) ? remoteDraftResult.payload : null);

      if (restoredDraft) {
        normalizedInputs = applyArtistNameLock(normalizeListenerProfileInputs(restoredDraft.inputs));
        nextStepIndex = Math.min(Math.max(restoredDraft.stepIndex, 0), Math.max(flowFields.length - 1, 0));
        setManagedArtistDraft(restoredDraft.managedArtistDraft || '');
        setIsEditingManagedArtist(Boolean(restoredDraft.isEditingManagedArtist));
        setResumeMessage('Resumed where you left off.');
        setShowResumeMessage(true);
      } else {
        setManagedArtistDraft('');
        setIsEditingManagedArtist(false);
        setResumeMessage('');
        setShowResumeMessage(false);
      }

      setInputs(normalizedInputs);
      setStepIndex(nextStepIndex);

      const parsedPersona = parseListenerPersonaResult(resultPayload.persona);
      setPersona(parsedPersona);
      setGeneratedAt(resultPayload.generatedAt || inputsPayload.generatedAt || null);

      if (restoredDraft?.mode === 'result' && parsedPersona) {
        nextMode = 'result';
      } else if (restoredDraft?.mode === 'review') {
        nextMode = 'review';
      } else if (restoredDraft?.mode === 'flow') {
        nextMode = 'flow';
      } else if (parsedPersona) {
        nextMode = 'result';
      } else if (inputsPayload.exists) {
        nextMode = 'review';
      } else {
        nextMode = 'flow';
      }
      setMode(nextMode);
    } catch {
      setError('Could not load listener profile right now.');
    } finally {
      setIsLoadingPage(false);
    }
  }, [applyArtistNameLock, draftStorageKey, flowFields, getToken, user]);

  useEffect(() => {
    if (!draftStorageKey || isLoadingPage || authLoading || !user) return;

    writePersistedState<ListenerProfileDraft>(draftStorageKey, LISTENER_PROFILE_DRAFT_VERSION, {
      mode: mode === 'generating' ? 'review' : mode,
      stepIndex,
      inputs: getDraftInputs(),
      managedArtistDraft,
      isEditingManagedArtist,
    });
    void saveUiDraft<ListenerProfileDraft>(LISTENER_PROFILE_DRAFT_SCOPE, draftStorageKey, {
      mode: mode === 'generating' ? 'review' : mode,
      stepIndex,
      inputs: getDraftInputs(),
      managedArtistDraft,
      isEditingManagedArtist,
    });
  }, [authLoading, draftStorageKey, getDraftInputs, isEditingManagedArtist, isLoadingPage, managedArtistDraft, mode, stepIndex, user]);

  const clearDraft = useCallback(() => {
    clearPersistedState(draftStorageKey);
    void deleteUiDraft(LISTENER_PROFILE_DRAFT_SCOPE, draftStorageKey);
    const resetInputs = applyArtistNameLock({ ...EMPTY_LISTENER_PROFILE_INPUTS });
    setInputs(resetInputs);
    setStepIndex(getFirstUnansweredIndex(resetInputs, flowFields));
    setStepValue('');
    setManagedArtistDraft('');
    setIsEditingManagedArtist(false);
    setPersona(null);
    setGeneratedAt(null);
    setMode('flow');
    setError('');
    setResumeMessage('');
    setShowResumeMessage(false);
    setSuccess('Draft cleared.');
  }, [applyArtistNameLock, draftStorageKey, flowFields]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    loadProfile();
  }, [authLoading, loadProfile, router, user]);

  const persistInputs = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setError('');
    setSuccess('');
    setSchemaSql(null);
    setIsSavingInputs(true);
    try {
      const token = await getToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        return false;
      }
      const response = await fetch('/api/listener-profile/inputs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inputs }),
      });
      const payload = (await response.json().catch(() => ({}))) as InputsResponse;
      if (!response.ok) {
        setError(payload.error || 'Could not save inputs.');
        if (response.status === 501 && payload.sql) setSchemaSql(payload.sql);
        return false;
      }
      setSuccess('Inputs saved.');
      return true;
    } catch {
      setError('Could not save inputs.');
      return false;
    } finally {
      setIsSavingInputs(false);
    }
  }, [getToken, inputs, user]);

  const saveCurrentStepIntoState = useCallback(() => {
    if (!activeField) return;
    if ((isArtistLockedName || user?.role === 'manager') && activeField.key === 'artist_name') return;
    setInputs((current) => ({
      ...current,
      [activeField.key]: stepValue.trim() || null,
    }));
  }, [activeField, isArtistLockedName, stepValue, user?.role]);

  const goToNextStep = () => {
    if (!activeField) return;
    saveCurrentStepIntoState();
    if (stepIndex >= totalSteps - 1) {
      setMode('review');
      return;
    }
    setStepIndex((index) => Math.min(totalSteps - 1, index + 1));
  };

  const skipStep = () => {
    if (!activeField) return;
    if (!(isArtistLockedName && activeField.key === 'artist_name')) {
      setInputs((current) => ({
        ...current,
        [activeField.key]: null,
      }));
    }
    setStepValue('');
    if (stepIndex >= totalSteps - 1) {
      setMode('review');
      return;
    }
    setStepIndex((index) => Math.min(totalSteps - 1, index + 1));
  };

  const goToPreviousStep = () => {
    if (stepIndex === 0) return;
    saveCurrentStepIntoState();
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const generatePersona = useCallback(async () => {
    if (!user) return;
    setError('');
    setSuccess('');
    setSchemaSql(null);
    setMode('generating');
    try {
      const token = await getToken();
      if (!token) {
        setError('Session expired. Please sign in again.');
        setMode('review');
        return;
      }
      const response = await fetch('/api/listener-profile/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inputs }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        persona?: ListenerPersonaResult;
        generatedAt?: string | null;
        error?: string;
        sql?: string;
      };
      if (!response.ok) {
        setError(
          toAiUiErrorMessage(payload.error, 'Could not generate ideal listener profile.')
        );
        if (response.status === 501 && payload.sql) setSchemaSql(payload.sql);
        setMode('review');
        return;
      }
      const parsedPersona = parseListenerPersonaResult(payload.persona);
      if (!parsedPersona) {
        setError('Generation finished, but persona output was empty. Try again.');
        setMode('review');
        return;
      }
      setPersona(parsedPersona);
      setGeneratedAt(payload.generatedAt || new Date().toISOString());
      setMode('result');
    } catch {
      setError('Could not generate ideal listener profile right now.');
      setMode('review');
    }
  }, [getToken, inputs, user]);

  const exportSummary = () => {
    if (!persona) return;
    const lines: string[] = [];
    lines.push('Ideal Listener Profile');
    lines.push('');
    lines.push(`Generated: ${generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()}`);
    lines.push('');
    for (const [key, value] of Object.entries(persona)) {
      const label = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      lines.push(`${label}: ${value || '-'}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ideal-listener-profile.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderLoading = () => (
    <section className="rounded-3xl border border-stroke-default bg-bg-elevated/75 p-8 text-center">
      <SilhouetteLoader />
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.14em] text-content-tertiary">Analyzing audience signals</p>
      <p className="mt-2 text-sm text-content-secondary">Building your listener profile</p>
    </section>
  );

  if (isLoadingPage || authLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto w-full max-w-[980px] px-6 py-12">
          <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
          <div className="mt-5 h-48 rounded-3xl skeleton-shimmer" />
          <div className="mt-5 h-72 rounded-3xl skeleton-shimmer" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto w-full max-w-[1040px] px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-xs uppercase tracking-[0.14em] text-content-tertiary hover:text-content-primary">
              Back to Dashboard
            </Link>
            <h1 className="mt-2 text-[clamp(2rem,5vw,3.3rem)] tracking-tight">Ideal Listener Profile</h1>
                <p className="mt-2 text-sm text-content-secondary">
                  Define your likely fan, then generate an AI persona you can use for release strategy and campaigns.
                </p>
              </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              Clear Draft
            </button>
            <div className="rounded-2xl border border-stroke-default bg-bg-elevated/75 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Completion</p>
              <p className="mt-1 text-xl font-semibold text-content-primary">{completionPercent}%</p>
            </div>
          </div>
        </div>

        {showResumeMessage && resumeMessage && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand/35 bg-brand-muted px-4 py-2 text-sm text-content-primary">
            <p>{resumeMessage}</p>
            <button type="button" onClick={() => setShowResumeMessage(false)} className="text-xs uppercase tracking-[0.14em] text-content-secondary hover:text-content-primary">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <AiRecoveryActions
            className="mt-4"
            message={error}
            onRetry={mode === 'review' || mode === 'result' ? generatePersona : undefined}
            onBack={
              mode === 'review' || mode === 'result'
                ? () => {
                    setStepIndex(getFirstUnansweredIndex(inputs, flowFields));
                    setMode('flow');
                  }
                : undefined
            }
            onSaveDraft={mode === 'review' || mode === 'result' ? () => void persistInputs() : undefined}
            saveDraftBusy={isSavingInputs}
          />
        )}
        {success && <p className="mt-4 rounded-xl border border-brand/35 bg-brand-muted px-4 py-2 text-sm text-content-primary">{success}</p>}
        {schemaSql && (
          <div className="mt-4 rounded-xl border border-stroke-default bg-bg-elevated/70 p-4">
            <p className="text-sm text-content-secondary">Database table is missing. Run this SQL in Supabase, then reload.</p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-bg-surface p-3 text-xs text-content-secondary">{schemaSql}</pre>
          </div>
        )}

        {mode === 'generating' && <div className="mt-6">{renderLoading()}</div>}

        {mode === 'flow' && activeField && (
          <section className="mt-6 rounded-3xl border border-stroke-default bg-bg-elevated/70 p-6">
            {user?.role === 'manager' && (
              <article className="mb-5 rounded-2xl border border-stroke-subtle bg-bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Managed Artist</p>
                    <p className="mt-1 text-sm text-content-secondary">Add one artist to profile. Maximum: 1 artist.</p>
                    <p className="mt-2 text-sm text-content-primary">{inputs.artist_name || 'No managed artist added yet.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManagedArtistDraft(inputs.artist_name || '');
                      setIsEditingManagedArtist((current) => !current);
                    }}
                    className="rounded-xl border border-stroke-default bg-bg-surface px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    {inputs.artist_name ? 'Replace Artist' : 'Add Artist'}
                  </button>
                </div>
                {isEditingManagedArtist && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={managedArtistDraft}
                      onChange={(event) => setManagedArtistDraft(event.target.value)}
                      placeholder="Enter managed artist name"
                      className="w-full min-w-[220px] flex-1 rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextName = managedArtistDraft.trim();
                        if (!nextName) {
                          setError('Artist name is required for manager profile context.');
                          return;
                        }
                        setInputs((current) => ({ ...current, artist_name: nextName }));
                        if (activeField?.key === 'artist_name') setStepValue(nextName);
                        setIsEditingManagedArtist(false);
                        setSuccess('Managed artist updated.');
                        setError('');
                      }}
                      className="rounded-xl border border-brand/40 bg-brand-muted px-3 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20"
                    >
                      Save Artist
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingManagedArtist(false)}
                      className="rounded-xl border border-stroke-default bg-bg-surface px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">{activeField.sectionTitle}</p>
              <p className="text-xs text-content-secondary">
                Step {stepIndex + 1} of {totalSteps}
              </p>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-bg-surface">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }} />
            </div>
            <h2 className="mt-5 text-2xl tracking-tight text-content-primary">{activeField.label}</h2>
            <p className="mt-2 text-sm text-content-secondary">{activeField.helper}</p>
            {user?.role === 'manager' && activeField.key === 'artist_name' ? (
              <div className="mt-5 rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-4 text-sm">
                <p className="text-content-secondary">Use the Managed Artist control above to set this value.</p>
                <p className="mt-2 font-medium text-content-primary">{inputs.artist_name || '-'}</p>
              </div>
            ) : (
              <textarea
                value={isArtistLockedName && activeField.key === 'artist_name' ? String(user?.artist_name || '') : stepValue}
                onChange={(event) => setStepValue(event.target.value)}
                disabled={isArtistLockedName && activeField.key === 'artist_name'}
                placeholder={activeField.placeholder}
                className="mt-5 min-h-[115px] w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 text-sm text-content-primary outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-75"
              />
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={goToPreviousStep}
                disabled={stepIndex === 0}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={skipStep}
                  className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20"
                >
                  {stepIndex === totalSteps - 1 ? 'Review Inputs' : 'Next'}
                </button>
              </div>
            </div>
          </section>
        )}

        {mode === 'review' && (
          <section className="mt-6 rounded-3xl border border-stroke-default bg-bg-elevated/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Review Inputs</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Locked Summary</h2>
                <p className="mt-2 text-sm text-content-secondary">Fields are read-only here. Go back to edit if needed.</p>
              </div>
              <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs text-content-secondary">
                Missing {missingCount} of {totalSteps}
              </span>
            </div>
            <div className="mt-5 space-y-4">
              {LISTENER_PROFILE_SECTIONS.map((section) => (
                <article key={section.id} className="rounded-2xl border border-stroke-subtle bg-bg-surface p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-content-tertiary">{section.title}</h3>
                  <div className="mt-3 space-y-2">
                    {section.fields.map((field) => (
                      <div key={field.key} className="flex flex-col gap-1 border-b border-stroke-subtle/65 pb-2 last:border-b-0">
                        <p className="text-xs uppercase tracking-wide text-content-tertiary">{field.label}</p>
                        <p className="text-sm text-content-primary">{inputs[field.key] || <span className="text-content-secondary">-</span>}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStepIndex(getFirstUnansweredIndex(inputs, flowFields));
                  setMode('flow');
                }}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Edit Inputs
              </button>
              <button
                type="button"
                onClick={persistInputs}
                disabled={isSavingInputs}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
              >
                {isSavingInputs ? 'Saving...' : 'Save Inputs'}
              </button>
              <button
                type="button"
                onClick={generatePersona}
                className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20"
              >
                Generate Ideal Listener Profile
              </button>
            </div>
          </section>
        )}

        {mode === 'result' && persona && (
          <section className="mt-6 rounded-3xl border border-stroke-default bg-bg-elevated/70 p-6">
            {missingCount > 10 && (
              <p className="rounded-xl border border-status-warning/45 bg-status-warning/10 px-4 py-2 text-sm text-status-warning">
                Profile generated with limited data. Accuracy may improve with more inputs.
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-stroke-subtle bg-bg-surface p-4">
                <PersonaIllustration />
                <div className="mt-4 space-y-2 text-sm text-content-secondary">
                  <p>
                    <span className="text-content-tertiary">Age:</span> {persona.age_range || '-'}
                  </p>
                  <p>
                    <span className="text-content-tertiary">Location:</span> {persona.location_tendency || '-'}
                  </p>
                  <p>
                    <span className="text-content-tertiary">Lifestyle:</span> {persona.lifestyle_summary || '-'}
                  </p>
                  <p>
                    <span className="text-content-tertiary">Primary Platform:</span> {persona.best_platforms || '-'}
                  </p>
                  <p>
                    <span className="text-content-tertiary">Music Taste:</span> {persona.music_behavior || '-'}
                  </p>
                </div>
              </aside>
              <div className="space-y-4">
                <article className="rounded-2xl border border-stroke-subtle bg-bg-surface p-4">
                  <h3 className="text-sm uppercase tracking-[0.14em] text-content-tertiary">Persona Overview</h3>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-content-primary">{persona.persona_name || 'Unnamed Listener Persona'}</p>
                  <p className="mt-2 text-sm text-content-secondary">{persona.lifestyle_summary || '-'}</p>
                </article>
                <DetailBlock title="Personality" value={persona.personality_traits} />
                <DetailBlock title="Emotional Drivers" value={persona.emotional_drivers} />
                <DetailBlock title="Music Behavior" value={persona.music_behavior} />
                <DetailBlock title="Content Behavior" value={persona.content_behavior} />
                <DetailBlock title="Marketing Insights" value={persona.campaign_messaging} />
                <DetailBlock title="Campaign Ideas" value={persona.best_campaign_styles} />
                <DetailBlock title="Confidence Score" value={persona.confidence_score} />
                <DetailBlock title="Missing Data Suggestions" value={persona.missing_data_suggestions} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={persistInputs}
                disabled={isSavingInputs}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
              >
                {isSavingInputs ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStepIndex(getFirstUnansweredIndex(inputs, flowFields));
                  setMode('flow');
                }}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Edit Inputs
              </button>
              <button
                type="button"
                onClick={generatePersona}
                className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20"
              >
                Regenerate Persona
              </button>
              <button
                type="button"
                onClick={exportSummary}
                className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Export Summary
              </button>
            </div>
            {generatedAt && <p className="mt-4 text-xs text-content-tertiary">Generated {new Date(generatedAt).toLocaleString()}</p>}
          </section>
        )}
      </div>
    </main>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border border-stroke-subtle bg-bg-surface p-4">
      <h3 className="text-sm uppercase tracking-[0.14em] text-content-tertiary">{title}</h3>
      <p className="mt-2 text-sm text-content-secondary">{value || '-'}</p>
    </article>
  );
}

function SilhouetteLoader() {
  return (
    <div className="mx-auto flex h-56 w-44 items-end justify-center rounded-[2.2rem] border border-stroke-default bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.09),transparent_62%)]">
      <svg viewBox="0 0 200 260" className="h-52 w-40 animate-pulse text-content-tertiary/70" aria-hidden="true">
        <circle cx="100" cy="56" r="30" fill="currentColor" opacity="0.4" />
        <path d="M34 232c0-43 30-75 66-75s66 32 66 75" fill="currentColor" opacity="0.22" />
        <path d="M58 210c6-32 24-48 42-48 17 0 36 16 42 48" fill="currentColor" opacity="0.28" />
      </svg>
    </div>
  );
}

function PersonaIllustration() {
  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-stroke-default bg-[linear-gradient(145deg,rgba(229,224,209,0.12),rgba(255,255,255,0.03))] p-3">
      <svg viewBox="0 0 260 360" className="h-[340px] w-full" aria-hidden="true">
        <defs>
          <linearGradient id="skinTone" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EAC6A8" />
            <stop offset="100%" stopColor="#D49B72" />
          </linearGradient>
          <linearGradient id="coatTone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2C2A36" />
            <stop offset="100%" stopColor="#191823" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="260" height="360" rx="26" fill="transparent" />
        <ellipse cx="130" cy="70" rx="34" ry="38" fill="url(#skinTone)" />
        <path d="M88 67c8-32 74-35 84 0-2-27-15-42-42-42S92 40 88 67Z" fill="#1C1B26" />
        <path d="M66 320c0-83 28-138 64-138s64 55 64 138" fill="url(#coatTone)" />
        <path d="M96 220c8 10 17 15 34 15s26-5 34-15" stroke="#E4DBCC" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="117" cy="72" r="3.8" fill="#2D221A" />
        <circle cx="143" cy="72" r="3.8" fill="#2D221A" />
        <path d="M116 93c8 7 20 7 28 0" stroke="#734A30" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
