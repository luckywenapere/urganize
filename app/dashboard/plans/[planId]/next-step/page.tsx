'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { trackEvent } from '@/lib/analytics';
import { getRolePermissions } from '@/lib/role-permissions';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';

type PlanRow = {
  id: string;
  title: string;
  artist_name: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  order_index: number | null;
  status: 'current' | 'pending' | 'completed';
};

type AiTaskGenerationPayload = {
  title: string;
  description: string;
  why_it_matters: string;
  measurable_outcome: string;
};

type ScreenMode = 'decision' | 'custom' | 'generating' | 'archived';

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'] as const;

export default function PlanNextStepPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const planId = Array.isArray(params?.planId) ? params.planId[0] : params?.planId;
  const { user, isLoading: authLoading, setNeedsOnboarding } = useAuthStore();
  const permissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);

  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [mode, setMode] = useState<ScreenMode>('decision');
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);

  const [customTitle, setCustomTitle] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customOwner, setCustomOwner] = useState('');
  const [customDueDate, setCustomDueDate] = useState('');
  const [customPriority, setCustomPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>('Medium');
  const [customEstimate, setCustomEstimate] = useState('');

  const allTasksCompleted = useMemo(
    () => totalTasks > 0 && completedTasks >= totalTasks && !activeTask,
    [activeTask, completedTasks, totalTasks]
  );

  const clearPlanFeedbackDrafts = () => {
    if (typeof window === 'undefined' || !user?.id || !planId) return;
    const prefix = `urganize.feedbackDraft.${user.id}.${planId}.`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  };

  const routeToTaskExecution = (options?: { forceStep7?: boolean }) => {
    if (!planId) return;
    setNeedsOnboarding(true);
    const shouldForceStep7 = options?.forceStep7 === true;
    const query = shouldForceStep7
      ? `?startOnboarding=7&planId=${planId}&flow=next-task`
      : `?planId=${planId}&flow=next-task`;
    router.push(`/dashboard${query}`);
  };

  const getNextOrderIndex = async (): Promise<number> => {
    if (!planId) return 0;
    const { data: lastTask, error: lastTaskError } = await supabase
      .from('ai_tasks')
      .select('order_index')
      .eq('release_id', planId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastTaskError) throw lastTaskError;
    return (lastTask?.order_index ?? -1) + 1;
  };

  const findActiveTask = async (): Promise<TaskRow | null> => {
    if (!planId) return null;
    const { data, error: activeTaskError } = await supabase
      .from('ai_tasks')
      .select('id,title,description,order_index,status')
      .eq('release_id', planId)
      .in('status', ['current', 'pending'])
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (activeTaskError) throw activeTaskError;
    return data || null;
  };

  const createTask = async ({
    title,
    description,
    whyItMatters,
  }: {
    title: string;
    description: string;
    whyItMatters: string;
  }) => {
    if (!user?.id || !planId) return;

    const existingActiveTask = await findActiveTask();
    if (existingActiveTask) {
      setActiveTask(existingActiveTask);
      routeToTaskExecution();
      return;
    }

    const nextOrderIndex = await getNextOrderIndex();
    const { data: insertedTask, error: insertError } = await supabase
      .from('ai_tasks')
      .insert({
        release_id: planId,
        user_id: user.id,
        title,
        description,
        why_it_matters: whyItMatters,
        input_type: 'text',
        status: 'current',
        phase: 'pre-production',
        order_index: nextOrderIndex,
      })
      .select('id,title,description,order_index,status')
      .single();

    if (insertError || !insertedTask) {
      throw insertError || new Error('Could not create next step');
    }
    trackEvent('ai_plan_generated', {
      userId: user.id,
      payload: { releaseId: planId, taskId: insertedTask.id, mode: 'next-step' },
    });

    const { error: profileStepResetError } = await supabase
      .from('release_profiles')
      .update({
        setup_step: 7,
        setup_completed: false,
      })
      .eq('release_id', planId);
    if (profileStepResetError) throw profileStepResetError;

    clearPlanFeedbackDrafts();
    setActiveTask(insertedTask);
    routeToTaskExecution({ forceStep7: true });
  };

  const handleGenerateAIGuidedStep = async () => {
    if (!permissions.canEditWorkspace) {
      setError('Read-only role: cannot generate next steps.');
      return;
    }
    if (isBusy || !planId) return;
    setError('');
    setIsBusy(true);
    setMode('generating');
    try {
      const startedAt = Date.now();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Session expired. Sign in again and retry.');
      }

      const generateResponse = await fetch('/api/ai/generate-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          mode: 'next-step',
          releaseId: planId,
        }),
      });

      const generatedPayload = (await generateResponse.json().catch(() => ({}))) as
        | Partial<AiTaskGenerationPayload>
        | { error?: string; detail?: string };

      if (!generateResponse.ok) {
        const failurePayload = generatedPayload as { error?: string; detail?: string };
        throw new Error(
          String(
            `${failurePayload.error || 'Task generation failed after retries. Please generate again.'}${
              failurePayload.detail ? ` (${failurePayload.detail})` : ''
            }`
          )
        );
      }

      const generatedTitle = String((generatedPayload as Partial<AiTaskGenerationPayload>).title || '').trim();
      const generatedDescription = String((generatedPayload as Partial<AiTaskGenerationPayload>).description || '').trim();
      const generatedWhy = String((generatedPayload as Partial<AiTaskGenerationPayload>).why_it_matters || '').trim();
      const measurableOutcome = String((generatedPayload as Partial<AiTaskGenerationPayload>).measurable_outcome || '').trim();
      if (!generatedTitle || !generatedDescription || !generatedWhy || !measurableOutcome) {
        throw new Error('AI returned an invalid task format. Please generate again.');
      }

      await createTask({
        title: generatedTitle,
        description: `${generatedDescription}\n\nMeasurable outcome: ${measurableOutcome}`,
        whyItMatters: `${generatedWhy}\nMeasurable outcome: ${measurableOutcome}`,
      });

      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) {
        await new Promise((resolve) => setTimeout(resolve, 650 - elapsed));
      }
    } catch (err: any) {
      setError(err?.message || 'Could not generate the next step right now.');
      setMode('decision');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateCustomStep = async () => {
    if (!permissions.canEditWorkspace) {
      setError('Read-only role: cannot create next steps.');
      return;
    }
    if (isBusy || !planId) return;

    const title = customTitle.trim();
    const notes = customNotes.trim();
    const owner = customOwner.trim();
    const dueDate = customDueDate.trim();
    const estimate = customEstimate.trim();

    if (!title || !notes || !owner || !dueDate || !customPriority) {
      setError('Fill all required fields before adding your step.');
      return;
    }

    const dueDateValue = new Date(dueDate);
    if (Number.isNaN(dueDateValue.getTime())) {
      setError('Select a valid due date.');
      return;
    }

    setError('');
    setIsBusy(true);
    try {
      const detailLines = [
        notes,
        '',
        `Owner: ${owner}`,
        `Due date: ${dueDate}`,
        `Priority: ${customPriority}`,
        estimate ? `Estimated time: ${estimate}` : null,
      ].filter(Boolean);

      await createTask({
        title,
        description: detailLines.join('\n'),
        whyItMatters: 'User-defined next step chosen before AI suggestion.',
      });
    } catch (err: any) {
      setError(err?.message || 'Could not add your custom step.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkPlanComplete = async () => {
    if (!permissions.canManagePlans) {
      setError('Only managers can mark plans complete.');
      return;
    }
    if (!planId) return;
    setError('');
    setIsMarkingComplete(true);
    try {
      const { error: releaseError } = await supabase
        .from('releases')
        .update({ status: 'released', updated_at: new Date().toISOString() })
        .eq('id', planId)
        .eq('user_id', user?.id || '');
      if (releaseError) throw releaseError;
      setMode('archived');
      setShowCompleteConfirm(false);
    } catch (err: any) {
      setError(err?.message || 'Could not mark this plan as complete.');
    } finally {
      setIsMarkingComplete(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (authLoading) return;
      if (!user) {
        router.replace('/auth');
        return;
      }
      if (!planId) {
        setError('Plan not found.');
        setLoading(false);
        return;
      }

      try {
        const entitlement = await getSubscriptionAccess(user.id);
        setHasSubscriptionAccess(entitlement.hasAccess);
        if (!entitlement.hasAccess) {
          return;
        }

        const [{ data: release, error: releaseError }, { data: task, error: activeTaskError }, { count: total, error: totalError }, { count: done, error: doneError }] =
          await Promise.all([
            supabase.from('releases').select('id,title,artist_name,status').eq('id', planId).eq('user_id', user.id).maybeSingle(),
            supabase
              .from('ai_tasks')
              .select('id,title,description,order_index,status')
              .eq('release_id', planId)
              .in('status', ['current', 'pending'])
              .order('order_index', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase.from('ai_tasks').select('id', { head: true, count: 'exact' }).eq('release_id', planId),
            supabase.from('ai_tasks').select('id', { head: true, count: 'exact' }).eq('release_id', planId).eq('status', 'completed'),
          ]);

        if (releaseError) throw releaseError;
        if (activeTaskError) throw activeTaskError;
        if (totalError) throw totalError;
        if (doneError) throw doneError;
        if (!release) throw new Error('Plan not found.');

        if (cancelled) return;

        setPlan(release);
        setActiveTask(task || null);
        setTotalTasks(total || 0);
        setCompletedTasks(done || 0);
        setCustomOwner(user.name || user.email || 'Owner');
        setMode(release.status === 'released' ? 'archived' : 'decision');
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load next step screen.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, planId, router, user]);

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[880px] flex-col px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute -right-16 -top-14 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />
        <div className="flex items-center justify-between">
          <Link href={planId ? `/dashboard/plans/${planId}` : '/dashboard'} className="text-sm text-content-secondary hover:text-content-primary">
            Back to Plan
          </Link>
          <Link href="/dashboard" className="text-sm text-content-secondary hover:text-content-primary">
            Dashboard
          </Link>
        </div>

        {loading ? (
          <section className="mt-10 rounded-2xl border border-stroke-default bg-bg-surface p-6">
            <div className="h-7 w-48 rounded-lg skeleton-shimmer" />
            <div className="mt-4 h-24 rounded-xl skeleton-shimmer" />
          </section>
        ) : hasSubscriptionAccess === false ? (
          <section className="mt-10">
            <SubscriptionPaywall
              title="Upgrade to generate your next step"
              description="Your plan is visible, but next-step generation and execution require an active subscription."
            />
          </section>
        ) : (
          <>
            <section className="mt-10">
              <p className="text-xs uppercase tracking-[0.15em] text-content-tertiary">Next Step</p>
              <h1 className="mt-2 text-[clamp(2rem,4.8vw,3.2rem)] tracking-tight">{plan?.title || 'Plan'}</h1>
              <p className="mt-2 text-sm text-content-secondary">{plan?.artist_name || ''}</p>
              <p className="mt-2 text-xs text-content-secondary">
                Role: <span className="font-medium text-content-primary">{permissions.role}</span>
                {!permissions.canEditWorkspace ? ' • Read-only actions' : ''}
              </p>
            </section>

            {mode === 'archived' ? (
              <section className="mt-8 rounded-3xl border border-brand/35 bg-brand-muted p-6 shadow-[0_10px_28px_rgba(0,0,0,0.15)]">
                <p className="text-lg font-semibold text-content-primary">Plan archived</p>
                <p className="mt-2 text-sm text-content-secondary">
                  This plan is marked complete and moved to archive-style status.
                </p>
                <Link
                  href="/dashboard"
                  className="mt-5 inline-flex rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
                >
                  Return to Dashboard
                </Link>
              </section>
            ) : activeTask ? (
              <section className="mt-8 rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_10px_28px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.15em] text-content-tertiary">Current step ready</p>
                <p className="mt-3 text-xl font-semibold text-content-primary">{activeTask.title}</p>
                <p className="mt-2 text-sm text-content-secondary">{activeTask.description || 'Open this step to continue execution.'}</p>
                <button
                  type="button"
                  disabled={!permissions.canEditWorkspace}
                  onClick={() => routeToTaskExecution()}
                  className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                >
                  Execute current step
                </button>
              </section>
            ) : (
              <>
                {allTasksCompleted && (
                  <section className="mt-8 rounded-3xl border border-status-info/35 bg-status-info/10 p-5 shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
                    <p className="text-sm text-content-secondary">All current tasks are complete.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!permissions.canManagePlans}
                        onClick={() => setShowCompleteConfirm(true)}
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                      >
                        Mark plan complete
                      </button>
                      <span className="text-xs text-content-tertiary">or continue creating new steps below</span>
                    </div>
                  </section>
                )}

                {mode === 'decision' && (
                  <section className="mt-8 rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_10px_28px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                    <p className="text-sm text-content-secondary">Before we generate the next step:</p>
                    <h2 className="mt-2 text-2xl font-semibold text-content-primary">Do you already have the next step in mind?</h2>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={!permissions.canEditWorkspace}
                        onClick={() => {
                          setError('');
                          setMode('custom');
                        }}
                        className="rounded-lg border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20 disabled:opacity-60"
                      >
                        Yes, I will add it
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || !permissions.canEditWorkspace}
                        onClick={handleGenerateAIGuidedStep}
                        className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-60"
                      >
                        No, suggest one now
                      </button>
                    </div>
                  </section>
                )}

                {mode === 'custom' && (
                  <section className="mt-8 rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_10px_28px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                    <h2 className="text-xl font-semibold text-content-primary">Add your next custom step</h2>
                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="text-sm sm:col-span-2">
                        <span className="mb-1 block text-content-secondary">Step title *</span>
                        <input
                          value={customTitle}
                          onChange={(event) => setCustomTitle(event.target.value)}
                          className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                          placeholder="Example: Confirm influencer shortlist"
                        />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        <span className="mb-1 block text-content-secondary">Description / notes *</span>
                        <textarea
                          value={customNotes}
                          onChange={(event) => setCustomNotes(event.target.value)}
                          className="min-h-[110px] w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                          placeholder="What exactly should be executed and what done looks like."
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-content-secondary">Owner *</span>
                        <input
                          value={customOwner}
                          onChange={(event) => setCustomOwner(event.target.value)}
                          className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-content-secondary">Due date *</span>
                        <input
                          type="date"
                          value={customDueDate}
                          onChange={(event) => setCustomDueDate(event.target.value)}
                          className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-content-secondary">Priority *</span>
                        <select
                          value={customPriority}
                          onChange={(event) => setCustomPriority(event.target.value as (typeof PRIORITY_OPTIONS)[number])}
                          className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                        >
                          {PRIORITY_OPTIONS.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-content-secondary">Estimated time (optional)</span>
                        <input
                          value={customEstimate}
                          onChange={(event) => setCustomEstimate(event.target.value)}
                          className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                          placeholder="Example: 2 hours"
                        />
                      </label>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy || !permissions.canEditWorkspace}
                        onClick={handleCreateCustomStep}
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                      >
                        {isBusy ? 'Adding...' : 'Add and execute this step'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setMode('decision')}
                        className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
                      >
                        Back
                      </button>
                    </div>
                  </section>
                )}

                {mode === 'generating' && (
                  <section className="mt-8 rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_10px_28px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                    <p className="text-sm text-content-secondary">Generating your next best step...</p>
                    <div className="mt-4 h-24 rounded-xl skeleton-shimmer" />
                    <div className="mt-3 h-4 w-2/3 rounded-lg skeleton-shimmer" />
                  </section>
                )}
              </>
            )}

            {showCompleteConfirm && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-6">
                  <h2 className="text-xl font-semibold text-content-primary">Mark plan complete?</h2>
                  <p className="mt-2 text-sm text-content-secondary">
                    This will close this plan as completed and move it to archive status.
                  </p>
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleteConfirm(false)}
                      disabled={isMarkingComplete}
                      className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkPlanComplete}
                      disabled={isMarkingComplete}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
                    >
                      {isMarkingComplete ? 'Completing...' : 'Mark plan complete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-6 rounded-lg border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</p>}
      </div>
    </main>
  );
}
