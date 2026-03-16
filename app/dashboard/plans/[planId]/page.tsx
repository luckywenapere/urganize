'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import {
  getChecklistProgress,
  groupChecklistByStage,
  TIMELINE_STAGE_LABELS,
  type TimelineStage,
} from '@/lib/release-checklist';

type ReleaseRow = {
  id: string;
  title: string;
  artist_name: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  release_date: string | null;
  type: string | null;
  created_at: string;
};

type ReleaseTaskRow = {
  id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  status: 'current' | 'pending' | 'completed';
  order_index: number | null;
};

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  timelineStage: TimelineStage;
  recommendedTiming: string;
  completed: boolean;
};

const stageByIndex = (index: number): TimelineStage => {
  if (index <= 4) return '12_weeks_before';
  if (index <= 7) return '8_weeks_before';
  if (index <= 10) return '6_weeks_before';
  if (index <= 13) return '4_weeks_before';
  if (index <= 15) return '2_weeks_before';
  if (index <= 18) return 'release_week';
  if (index <= 21) return 'release_day';
  return 'post_release';
};

const extractRecommendedTiming = (value: string | null | undefined, stage: TimelineStage): string => {
  const message = String(value || '').trim();
  if (message.toLowerCase().startsWith('recommended timing:')) {
    return message.slice('recommended timing:'.length).trim() || TIMELINE_STAGE_LABELS[stage];
  }
  return message || TIMELINE_STAGE_LABELS[stage];
};

export default function ReleaseChecklistPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const planId = Array.isArray(params?.planId) ? params.planId[0] : params?.planId;
  const { user, isLoading: authLoading } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);
  const [release, setRelease] = useState<ReleaseRow | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  const completedTasks = useMemo(() => checklist.filter((item) => item.completed).length, [checklist]);
  const progress = useMemo(() => getChecklistProgress(checklist.length, completedTasks), [checklist.length, completedTasks]);
  const remainingTasks = Math.max(checklist.length - completedTasks, 0);
  const groupedChecklist = useMemo(() => groupChecklistByStage(checklist), [checklist]);

  const loadRelease = useCallback(async () => {
    if (!user?.id || !planId) return;
    if (!hasLoadedOnce && !release && checklist.length === 0) {
      setIsLoading(true);
    }
    setError('');

    try {
      const entitlement = await getSubscriptionAccess(user.id);
      setHasSubscriptionAccess(entitlement.hasAccess);
      if (!entitlement.hasAccess) return;

      const [{ data: releaseData, error: releaseError }, { data: taskData, error: taskError }] = await Promise.all([
        supabase
          .from('releases')
          .select('id,title,artist_name,status,release_date,type,created_at')
          .eq('id', planId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('ai_tasks')
          .select('id,title,description,why_it_matters,status,order_index')
          .eq('release_id', planId)
          .order('order_index', { ascending: true }),
      ]);

      if (releaseError) throw releaseError;
      if (taskError) throw taskError;
      if (!releaseData) throw new Error('Release not found.');

      const taskRows = (taskData || []) as ReleaseTaskRow[];
      setRelease(releaseData as ReleaseRow);
      setChecklist(
        taskRows.map((task, index) => {
          const orderIndex = task.order_index ?? index;
          const timelineStage = stageByIndex(orderIndex);
          return {
            id: task.id,
            title: task.title,
            description: String(task.description || '').trim(),
            timelineStage,
            recommendedTiming: extractRecommendedTiming(task.why_it_matters, timelineStage),
            completed: task.status === 'completed',
          };
        })
      );
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load release checklist.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [checklist.length, hasLoadedOnce, planId, release, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    if (!planId) {
      setError('Release not found.');
      setIsLoading(false);
      return;
    }
    void loadRelease();
  }, [authLoading, loadRelease, planId, router, user]);

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!user?.id || !planId || isSaving) return;
    setIsSaving(taskId);
    setError('');

    try {
      const nextStatus = completed ? 'pending' : 'completed';
      const { error: updateError } = await supabase
        .from('ai_tasks')
        .update({
          status: nextStatus,
          completed_at: completed ? null : new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('release_id', planId);

      if (updateError) throw updateError;

      setChecklist((current) =>
        current.map((item) => (item.id === taskId ? { ...item, completed: !completed } : item))
      );
    } catch (toggleError: any) {
      setError(toggleError?.message || 'Could not update task status.');
    } finally {
      setIsSaving(null);
    }
  };

  if (isLoading || authLoading) {
    return (
      <LoadingScreen
        variant="detail"
        eyebrow="Release Checklist"
        title="Loading your release plan"
        description="Arranging the timeline, progress, and task sequence for this release."
      />
    );
  }

  if (hasSubscriptionAccess === false) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[760px] px-6 py-12">
          <SubscriptionPaywall title="Unlock your release checklist" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[980px] px-6 py-10 sm:px-8">
        <div className="border-b border-stroke-default pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-content-secondary">
              <span className="font-medium text-content-primary">Dashboard</span>
              <span className="mx-2 text-content-tertiary">|</span>
              <span>Releases</span>
            </div>
            <Link
              href="/dashboard"
              className="text-sm text-content-secondary transition hover:text-content-primary"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <section className="border-b border-stroke-default py-8">
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] tracking-tight text-content-primary">
            {release?.title || 'Release Checklist'}
          </h1>
          <div className="mt-3 space-y-1 text-sm text-content-secondary">
            <p>
              <span className="font-medium text-content-primary">Artist:</span>{' '}
              {release?.artist_name || 'Unknown artist'}
            </p>
            {release?.release_date ? (
              <p>
                <span className="font-medium text-content-primary">Release Date:</span>{' '}
                {new Date(release.release_date).toLocaleDateString()}
              </p>
            ) : null}
            {release?.type ? (
              <p>
                <span className="font-medium text-content-primary">Release Type:</span>{' '}
                {release.type}
              </p>
            ) : null}
          </div>
        </section>

        {error && (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        )}

        <section className="border-b border-stroke-default py-8">
          <div>
            <p className="text-sm font-medium text-content-primary">Release Readiness</p>
            <p className="mt-2 text-[clamp(1.6rem,3vw,2.3rem)] font-semibold tracking-tight text-content-primary">
              {progress}% Ready to Drop
            </p>
            <div className="mt-4 h-5 overflow-hidden rounded-full border border-stroke-default bg-bg-overlay">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-content-secondary">
              <span className="font-medium text-content-primary">{progress}%</span>
              {' '}
              • {completedTasks} completed • {remainingTasks} remaining
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="space-y-10">
            {groupedChecklist.map((group) => (
              <section key={group.stage} className="border-b border-stroke-default pb-8 last:border-b-0 last:pb-0">
                <div className="mb-5">
                  <p className="text-lg font-semibold uppercase tracking-[0.12em] text-content-primary">
                    {group.label}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.items.map((task) => (
                    <label
                      key={task.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-[20px] border px-4 py-4 transition ${
                        task.completed
                          ? 'border-brand/30 bg-brand-muted/45'
                          : 'border-stroke-default bg-bg-surface hover:bg-bg-hover/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => void toggleTask(task.id, task.completed)}
                        disabled={isSaving === task.id}
                        className="mt-1 h-4 w-4 rounded border-stroke-default"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-base font-semibold ${task.completed ? 'text-content-primary line-through' : 'text-content-primary'}`}>
                          {task.title}
                        </p>
                        <p className="mt-1.5 text-sm text-content-secondary">{task.description}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                          {task.recommendedTiming}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
