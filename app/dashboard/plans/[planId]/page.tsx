'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_TOTAL_STEPS = 13;
const DEFAULT_PLAN_DURATION_DAYS = 30;

type PlanRow = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
};

type PlanProfile = {
  setup_step: number | null;
  setup_completed: boolean | null;
  hard_deadline: string | null;
  deadline_reason: string | null;
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
  const { user, logout, setNeedsOnboarding } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [profile, setProfile] = useState<PlanProfile | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [nextTask, setNextTask] = useState('No active task');

  useEffect(() => {
    const loadPlan = async () => {
      if (!planId) {
        setError('Plan not found');
        setLoading(false);
        return;
      }

      if (!user) {
        router.push('/auth');
        setLoading(false);
        return;
      }

      try {
        const { data: release, error: releaseError } = await supabase
          .from('releases')
          .select('id,title,artist_name,created_at')
          .eq('id', planId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (releaseError) throw releaseError;
        if (!release) {
          setError('Plan not found');
          setLoading(false);
          return;
        }
        setPlan(release);

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
        setProfile(resolvedProfile);

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

        setTotalTasks(totalCount || 0);
        setCompletedTasks(doneCount || 0);
        if (activeTask?.title) setNextTask(activeTask.title);
      } catch (loadError: any) {
        setError(loadError?.message || 'Could not load plan dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadPlan();
  }, [planId, router, user]);

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
      ? 'bg-emerald-500/20 text-emerald-200'
      : timelineMetrics.status === 'Overdue'
        ? 'bg-red-500/20 text-red-200'
        : timelineMetrics.status === 'At Risk'
          ? 'bg-amber-500/20 text-amber-100'
          : 'bg-sky-500/20 text-sky-100';

  const timelineMessage =
    timelineMetrics.status === 'Completed'
      ? 'Plan completed. Keep momentum by launching the next plan today.'
      : timelineMetrics.status === 'Overdue'
        ? 'Timeline is overdue. Resume now to recover the launch window.'
        : timelineMetrics.status === 'At Risk'
          ? 'You are falling behind the timeline. Complete the next action today.'
          : 'You are on track. Keep shipping tasks at this pace.';

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-6 py-10 lg:px-10 lg:py-12">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
            Back to Plans
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push('/auth');
            }}
            className="text-sm text-white/70 hover:text-white"
          >
            Logout
          </button>
        </div>

        {loading ? (
          <div className="mt-16 rounded-2xl border border-white/10 bg-[#02090d] p-6">
            <p className="text-white/75">Loading plan dashboard...</p>
          </div>
        ) : error ? (
          <div className="mt-16 rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
            <p className="text-red-200">{error}</p>
          </div>
        ) : (
          <>
            <section className="mt-14">
              <h1 className="text-[clamp(2.2rem,4.8vw,3.7rem)] tracking-tight">{plan?.title || 'Plan Dashboard'}</h1>
              <p className="mt-2 text-white/70">{plan?.artist_name || 'Unknown Artist'}</p>
              <div className="mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/20">
                Created {timelineMetrics.createdAt.toLocaleDateString()}
              </div>
            </section>

            <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              <article className="rounded-xl border border-white/10 bg-[#02090d] p-4">
                <p className="text-xs uppercase tracking-wide text-white/55">Plan Status</p>
                <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass}`}>
                  {timelineMetrics.status}
                </p>
              </article>
              <article className="rounded-xl border border-white/10 bg-[#02090d] p-4">
                <p className="text-xs uppercase tracking-wide text-white/55">Days Left</p>
                <p className="mt-2 text-2xl font-semibold">
                  {timelineMetrics.status === 'Completed'
                    ? 'Done'
                    : timelineMetrics.daysLeft < 0
                      ? `${Math.abs(timelineMetrics.daysLeft)} late`
                      : timelineMetrics.daysLeft}
                </p>
              </article>
              <article className="rounded-xl border border-white/10 bg-[#02090d] p-4">
                <p className="text-xs uppercase tracking-wide text-white/55">Completed Tasks</p>
                <p className="mt-2 text-2xl font-semibold">
                  {completedTasks}/{Math.max(totalTasks, 1)}
                </p>
              </article>
              <article className="rounded-xl border border-white/10 bg-[#02090d] p-4">
                <p className="text-xs uppercase tracking-wide text-white/55">Next Action</p>
                <p className="mt-2 text-sm text-white/85">{nextTask}</p>
              </article>
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-[#02090d] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Timeline Pace</h2>
                <p className="text-sm text-white/65">
                  Target date: {timelineMetrics.deadline.toLocaleDateString()}
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="relative h-4 w-full rounded-full bg-white/10">
                  <div
                    className="absolute left-0 top-0 h-4 rounded-full bg-white"
                    style={{ width: `${Math.round(timelineMetrics.workProgress * 100)}%` }}
                  />
                  <div
                    className="absolute top-[-6px] h-7 w-[2px] bg-amber-300"
                    style={{ left: `${Math.round(timelineMetrics.timeProgress * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/65">
                  <span>Work completed: {Math.round(timelineMetrics.workProgress * 100)}%</span>
                  <span>Time elapsed: {Math.round(timelineMetrics.timeProgress * 100)}%</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-white/80">{timelineMessage}</p>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
                {timelineMetrics.milestones.map((milestone) => (
                  <div
                    key={milestone.label}
                    className={`rounded-lg border p-3 text-xs ${
                      milestone.complete ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/70'
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
                    router.push(`/dashboard?startOnboarding=2&planId=${planId}`);
                  }}
                  className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  Lock In This Plan
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
