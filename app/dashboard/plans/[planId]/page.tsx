'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_TOTAL_STEPS = 13;
const DEFAULT_PLAN_DURATION_DAYS = 30;
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000;

type PlanRow = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
};

type PlanProfile = {
  setup_step: number | null;
  setup_completed: boolean | null;
  hard_deadline: string | null;
  deadline_reason: string | null;
};

type CachedPlanPayload = {
  plan: PlanRow;
  profile: PlanProfile;
  totalTasks: number;
  completedTasks: number;
  nextTask: string;
  cachedAt: number;
};

const addDaysIso = (base: string | Date, days: number): string => {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export default function PlanDashboardPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const planId = Array.isArray(params?.planId) ? params.planId[0] : params?.planId;
  const { user, logout, setNeedsOnboarding, isLoading: authLoading } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [profile, setProfile] = useState<PlanProfile | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [nextTask, setNextTask] = useState('No active task');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingBasics, setIsSavingBasics] = useState(false);
  const [isPlanMenuOpen, setIsPlanMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftArtistName, setDraftArtistName] = useState('');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);
  const planMenuRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = user && planId ? `urganize.planDashboard.${user.id}.${planId}` : '';

  useEffect(() => {
    let cancelled = false;

    const readCachedPlan = (): CachedPlanPayload | null => {
      if (!cacheKey) return null;
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as CachedPlanPayload;
        if (!parsed?.plan || !parsed?.profile || typeof parsed.cachedAt !== 'number') return null;
        if (Date.now() - parsed.cachedAt > PLAN_CACHE_TTL_MS) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const loadPlan = async () => {
      if (authLoading) return;
      if (!planId) {
        setError('Plan not found');
        setLoading(false);
        return;
      }

      if (!user) {
        router.replace('/auth');
        setLoading(false);
        return;
      }

      const cached = readCachedPlan();
      if (cached && !cancelled) {
        setPlan(cached.plan);
        setProfile(cached.profile);
        setTotalTasks(cached.totalTasks);
        setCompletedTasks(cached.completedTasks);
        setNextTask(cached.nextTask || 'No active task');
        setDraftTitle(cached.plan.title || '');
        setDraftArtistName(cached.plan.artist_name || '');
        setDraftDeadline((cached.profile.hard_deadline || '').slice(0, 10));
        setLoading(false);
      }

      setIsRefreshing(true);
      try {
        const entitlement = await getSubscriptionAccess(user.id);
        if (!cancelled) {
          setHasSubscriptionAccess(entitlement.hasAccess);
        }
        if (!entitlement.hasAccess) {
          if (!cancelled && cacheKey) localStorage.removeItem(cacheKey);
          return;
        }

        const { data: release, error: releaseError } = await supabase
          .from('releases')
          .select('id,title,artist_name,created_at,status')
          .eq('id', planId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (releaseError) throw releaseError;
        if (!release) {
          setError('Plan not found');
          if (cacheKey) localStorage.removeItem(cacheKey);
          return;
        }

        const { data: latestProfile, error: profileError } = await supabase
          .from('release_profiles')
          .select('setup_step,setup_completed,hard_deadline,deadline_reason')
          .eq('release_id', release.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (profileError) throw profileError;

        const defaultDeadline = addDaysIso(release.created_at || new Date(), DEFAULT_PLAN_DURATION_DAYS);
        let resolvedProfile: PlanProfile;

        if (!latestProfile) {
          const { error: insertProfileError } = await supabase
            .from('release_profiles')
            .insert({
              release_id: release.id,
              setup_step: 2,
              setup_completed: false,
              hard_deadline: defaultDeadline,
            });
          if (insertProfileError) throw insertProfileError;
          resolvedProfile = {
            setup_step: 2,
            setup_completed: false,
            hard_deadline: defaultDeadline,
            deadline_reason: null,
          };
        } else if (!latestProfile.hard_deadline) {
          const { error: updateProfileError } = await supabase
            .from('release_profiles')
            .update({ hard_deadline: defaultDeadline })
            .eq('release_id', release.id);
          if (updateProfileError) throw updateProfileError;
          resolvedProfile = {
            ...latestProfile,
            hard_deadline: defaultDeadline,
          };
        } else {
          resolvedProfile = latestProfile;
        }

        const [{ count: totalCount, error: totalError }, { count: doneCount, error: doneError }, { data: activeTask, error: taskError }] = await Promise.all([
          supabase.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('release_id', release.id),
          supabase.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('release_id', release.id).eq('status', 'completed'),
          supabase
            .from('ai_tasks')
            .select('title')
            .eq('release_id', release.id)
            .in('status', ['current', 'pending'])
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (totalError) throw totalError;
        if (doneError) throw doneError;
        if (taskError) throw taskError;

        if (!cancelled) {
          setError('');
          setPlan(release);
          setProfile(resolvedProfile);
          setTotalTasks(totalCount || 0);
          setCompletedTasks(doneCount || 0);
          setNextTask(activeTask?.title || 'No active task');
          setDraftTitle(release.title || '');
          setDraftArtistName(release.artist_name || '');
          setDraftDeadline((resolvedProfile.hard_deadline || '').slice(0, 10));

          if (cacheKey) {
            const cachePayload: CachedPlanPayload = {
              plan: release,
              profile: resolvedProfile,
              totalTasks: totalCount || 0,
              completedTasks: doneCount || 0,
              nextTask: activeTask?.title || 'No active task',
              cachedAt: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Could not load plan dashboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    loadPlan();
    return () => {
      cancelled = true;
    };
  }, [authLoading, cacheKey, planId, router, user]);

  const timelineMetrics = useMemo(() => {
    const now = Date.now();
    const createdAt = new Date(plan?.created_at || Date.now());
    const fallbackDeadline = addDaysIso(createdAt, DEFAULT_PLAN_DURATION_DAYS);
    const deadline = new Date(profile?.hard_deadline || fallbackDeadline);

    const createdTs = Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : now;
    const deadlineTsRaw = Number.isFinite(deadline.getTime()) ? deadline.getTime() : now + DEFAULT_PLAN_DURATION_DAYS * DAY_MS;
    const deadlineTs = Math.max(deadlineTsRaw, createdTs + DAY_MS);

    const totalDays = Math.max(1, Math.ceil((deadlineTs - createdTs) / DAY_MS));
    const elapsedDays = Math.max(0, Math.ceil((now - createdTs) / DAY_MS));
    const daysLeft = Math.ceil((deadlineTs - now) / DAY_MS);

    const timeProgress = clamp01(elapsedDays / totalDays);
    const onboardingProgress = clamp01((profile?.setup_step || 0) / ONBOARDING_TOTAL_STEPS);
    const taskProgress = totalTasks > 0 ? clamp01(completedTasks / totalTasks) : 0;
    const workProgress = profile?.setup_completed ? 1 : Math.max(onboardingProgress, taskProgress);

    let status: 'Completed' | 'On Track' | 'At Risk' | 'Overdue' = 'On Track';
    if (profile?.setup_completed) {
      status = 'Completed';
    } else if (daysLeft < 0) {
      status = 'Overdue';
    } else if (daysLeft <= 7 || workProgress + 0.08 < timeProgress) {
      status = 'At Risk';
    }

    const milestones = [
      { label: 'Kickoff', progress: 0 },
      { label: 'Plan Locked', progress: 0.25 },
      { label: 'Execution', progress: 0.5 },
      { label: 'Optimization', progress: 0.75 },
      { label: 'Target Date', progress: 1 },
    ].map((milestone) => {
      const ts = createdTs + Math.round((deadlineTs - createdTs) * milestone.progress);
      return {
        ...milestone,
        date: new Date(ts),
        complete: workProgress >= milestone.progress || now >= ts,
      };
    });

    return {
      status,
      createdAt: new Date(createdTs),
      deadline: new Date(deadlineTs),
      totalDays,
      elapsedDays,
      daysLeft,
      timeProgress,
      workProgress,
      milestones,
    };
  }, [completedTasks, plan?.created_at, profile?.hard_deadline, profile?.setup_completed, profile?.setup_step, totalTasks]);

  const statusBadgeClass =
    timelineMetrics.status === 'Completed'
      ? 'bg-brand-muted text-brand'
      : timelineMetrics.status === 'Overdue'
        ? 'bg-status-error/20 text-status-error'
        : timelineMetrics.status === 'At Risk'
          ? 'bg-status-warning/20 text-status-warning'
          : 'bg-status-info/20 text-status-info';

  const timelineMessage =
    timelineMetrics.status === 'Completed'
      ? 'Plan completed. Keep momentum by launching the next plan today.'
      : timelineMetrics.status === 'Overdue'
        ? 'Timeline is overdue. Resume now to recover the launch window.'
        : timelineMetrics.status === 'At Risk'
          ? 'You are falling behind the timeline. Complete the next action today.'
          : 'You are on track. Keep shipping tasks at this pace.';

  const savePlanBasics = async () => {
    if (!planId) return;
    const title = draftTitle.trim();
    const artist = draftArtistName.trim();
    const deadline = draftDeadline.trim();

    if (!title) {
      setError('Plan title is required.');
      return;
    }
    if (!artist) {
      setError('Artist name is required.');
      return;
    }

    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        setError('Deadline date is invalid.');
        return;
      }
    }

    setIsSavingBasics(true);
    setError('');
    try {
      const { error: releaseUpdateError } = await supabase
        .from('releases')
        .update({ title, artist_name: artist, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .eq('user_id', user?.id || '');
      if (releaseUpdateError) throw releaseUpdateError;

      const { error: profileUpdateError } = await supabase
        .from('release_profiles')
        .update({ hard_deadline: deadline || null, updated_at: new Date().toISOString() })
        .eq('release_id', planId);
      if (profileUpdateError) throw profileUpdateError;

      setPlan((current) => (current ? { ...current, title, artist_name: artist } : current));
      setProfile((current) => (current ? { ...current, hard_deadline: deadline || null } : current));
      setError('');
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save plan details');
    } finally {
      setIsSavingBasics(false);
    }
  };

  const requestDeletePlan = () => {
    setShowDeleteModal(true);
    setDeleteConfirmText('');
    setDeleteError('');
    setIsPlanMenuOpen(false);
  };

  const closeDeleteModal = () => {
    if (isDeletingPlan) return;
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const confirmDeletePlan = async () => {
    if (!planId) return;
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm.');
      return;
    }

    setIsDeletingPlan(true);
    setDeleteError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmationText: deleteConfirmText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not delete plan');
      }

      if (cacheKey) localStorage.removeItem(cacheKey);
      router.push('/dashboard');
    } catch (deletePlanError: any) {
      setDeleteError(deletePlanError?.message || 'Could not delete plan.');
    } finally {
      setIsDeletingPlan(false);
    }
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!planMenuRef.current) return;
      if (!planMenuRef.current.contains(event.target as Node)) {
        setIsPlanMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-6 py-10 lg:px-10 lg:py-12">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-content-secondary hover:text-content-primary">
            Back to Plans
          </Link>
          <div className="relative" ref={planMenuRef}>
            <button
              type="button"
              onClick={() => setIsPlanMenuOpen((open) => !open)}
              className="rounded-md border border-stroke-default bg-bg-surface px-2 py-1 text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              aria-haspopup="menu"
              aria-expanded={isPlanMenuOpen}
              aria-label="Plan actions"
            >
              ...
            </button>
            {isPlanMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 min-w-[170px] rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-lg">
                <button
                  type="button"
                  onClick={requestDeletePlan}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-status-error/10"
                >
                  Delete plan
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsPlanMenuOpen(false);
                    await logout();
                    router.push('/auth');
                  }}
                  className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="mt-16 rounded-2xl border border-stroke-default bg-bg-surface p-6">
            <p className="text-content-secondary">Loading plan dashboard...</p>
          </div>
        ) : hasSubscriptionAccess === false ? (
          <section className="mt-14">
            <SubscriptionPaywall
              title="Subscription required to access this plan"
              description="Billing is inactive. Renew to view and manage this plan."
            />
          </section>
        ) : error ? (
          <div className="mt-16 rounded-2xl border border-status-error/40 bg-status-error/10 p-6">
            <p className="text-status-error">{error}</p>
          </div>
        ) : (
          <>
            <section className="mt-14">
              <h1 className="text-[clamp(2.2rem,4.8vw,3.7rem)] tracking-tight">{plan?.title || 'Plan Dashboard'}</h1>
              <p className="mt-2 text-content-secondary">{plan?.artist_name || 'Unknown Artist'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs font-medium text-content-primary">
                  Created {timelineMetrics.createdAt.toLocaleDateString()}
                </div>
                {isRefreshing && (
                  <div className="inline-flex items-center rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
                    Refreshing...
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-stroke-default bg-bg-surface p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Edit Plan Basics</h2>
                <button
                  type="button"
                  onClick={savePlanBasics}
                  disabled={isSavingBasics}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                >
                  {isSavingBasics ? 'Saving...' : 'Save changes'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-content-secondary">Plan title</span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-content-secondary">Artist name</span>
                  <input
                    value={draftArtistName}
                    onChange={(event) => setDraftArtistName(event.target.value)}
                    className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-content-secondary">Target date</span>
                  <input
                    type="date"
                    value={draftDeadline}
                    onChange={(event) => setDraftDeadline(event.target.value)}
                    className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                  />
                </label>
              </div>
            </section>

            <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Plan Status</p>
                <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass}`}>
                  {timelineMetrics.status}
                </p>
              </article>
              <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Days Left</p>
                <p className="mt-2 text-2xl font-semibold">
                  {timelineMetrics.status === 'Completed'
                    ? 'Done'
                    : timelineMetrics.daysLeft < 0
                      ? `${Math.abs(timelineMetrics.daysLeft)} late`
                      : timelineMetrics.daysLeft}
                </p>
              </article>
              <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Completed Tasks</p>
                <p className="mt-2 text-2xl font-semibold">
                  {completedTasks}/{Math.max(totalTasks, 1)}
                </p>
              </article>
              <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Next Action</p>
                <p className="mt-2 text-sm text-content-secondary">{nextTask}</p>
              </article>
            </section>

            <section className="mt-8 rounded-2xl border border-stroke-default bg-bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Timeline Pace</h2>
                <p className="text-sm text-content-secondary">
                  Target date: {timelineMetrics.deadline.toLocaleDateString()}
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-stroke-default bg-bg-elevated p-4">
                <div className="relative h-4 w-full rounded-full bg-bg-overlay">
                  <div
                    className="absolute left-0 top-0 h-4 rounded-full bg-brand"
                    style={{ width: `${Math.round(timelineMetrics.workProgress * 100)}%` }}
                  />
                  <div
                    className="absolute top-[-6px] h-7 w-[2px] bg-status-warning"
                    style={{ left: `${Math.round(timelineMetrics.timeProgress * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary">
                  <span>Work completed: {Math.round(timelineMetrics.workProgress * 100)}%</span>
                  <span>Time elapsed: {Math.round(timelineMetrics.timeProgress * 100)}%</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-content-secondary">{timelineMessage}</p>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
                {timelineMetrics.milestones.map((milestone) => (
                  <div
                    key={milestone.label}
                    className={`rounded-lg border p-3 text-xs ${
                      milestone.complete
                        ? 'border-brand/40 bg-brand-muted text-content-primary'
                        : 'border-stroke-default bg-bg-elevated text-content-secondary'
                    }`}
                  >
                    <p className="font-medium">{milestone.label}</p>
                    <p className="mt-1">{milestone.date.toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </section>

            {!profile?.setup_completed && (
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setNeedsOnboarding(true);
                    router.push(`/dashboard?startOnboarding=2&planId=${planId}&flow=resume-plan`);
                  }}
                  className="rounded-xl border border-brand/35 bg-brand-muted px-5 py-3 text-sm font-semibold text-content-primary transition hover:bg-brand/20"
                >
                  Resume Onboarding
                </button>
              </div>
            )}
            {profile?.setup_completed && plan?.status !== 'released' && (
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/dashboard/plans/${planId}/next-step`);
                  }}
                  className="rounded-xl border border-brand/35 bg-brand-muted px-5 py-3 text-sm font-semibold text-content-primary transition hover:bg-brand/20"
                >
                  Plan Next Step
                </button>
              </div>
            )}
            {profile?.setup_completed && plan?.status === 'released' && (
              <div className="mt-8 rounded-xl border border-brand/35 bg-brand-muted p-4 text-sm text-content-secondary">
                This plan is completed and archived.
              </div>
            )}
          </>
        )}
      </div>
      {showDeleteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-6">
            <h2 className="text-xl font-semibold text-content-primary">Delete this plan?</h2>
            <p className="mt-2 text-sm text-content-secondary">
              This permanently deletes this plan and all plan assets. This action cannot be undone.
            </p>
            <p className="mt-3 text-sm text-content-secondary">
              Type <span className="font-semibold text-content-primary">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="mt-3 w-full rounded-lg border border-status-error/35 bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-status-error"
              placeholder="DELETE"
            />
            {deleteError && <p className="mt-3 text-sm text-status-error">{deleteError}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeletingPlan}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePlan}
                disabled={isDeletingPlan}
                className="rounded-lg bg-status-error px-4 py-2 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-50"
              >
                {isDeletingPlan ? 'Deleting...' : 'Delete plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
