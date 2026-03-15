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
    setIsLoading(true);
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
    }
  }, [planId, user?.id]);

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
      <div className="mx-auto max-w-[1080px] px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-xs uppercase tracking-[0.16em] text-content-tertiary hover:text-content-primary">
              Back to Dashboard
            </Link>
            <h1 className="mt-3 text-[clamp(2.3rem,5vw,4rem)] tracking-tight text-content-primary">
              {release?.title || 'Release Checklist'}
            </h1>
            <p className="mt-2 text-sm text-content-secondary">
              {release?.artist_name || 'Unknown artist'}
              {release?.release_date ? ` • Release date ${new Date(release.release_date).toLocaleDateString()}` : ''}
              {release?.type ? ` • ${release.type.toUpperCase()}` : ''}
            </p>
          </div>
          <div className="rounded-[24px] border border-stroke-default bg-bg-surface/95 px-5 py-4 text-right shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Progress</p>
            <p className="mt-1 text-3xl font-semibold text-content-primary">{progress}%</p>
            <p className="mt-1 text-sm text-content-secondary">
              {completedTasks} completed • {remainingTasks} remaining
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        )}

        <section className="mt-8 rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Checklist Overview</p>
              <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Every major release step in order</h2>
            </div>
            <div className="min-w-[220px]">
              <div className="h-2 rounded-full bg-bg-overlay">
                <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-8">
            {groupedChecklist.map((group) => (
              <section key={group.stage}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">{group.label}</p>
                    <p className="mt-1 text-sm text-content-secondary">{group.items.length} tasks in this stage</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {group.items.map((task) => (
                    <label
                      key={task.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-3xl border px-5 py-4 transition ${
                        task.completed
                          ? 'border-brand/35 bg-brand-muted/70'
                          : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default hover:bg-bg-hover'
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className={`text-base font-semibold ${task.completed ? 'text-content-primary line-through' : 'text-content-primary'}`}>
                              {task.title}
                            </p>
                            <p className="mt-2 text-sm text-content-secondary">{task.description}</p>
                          </div>
                          <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs text-content-secondary">
                            {task.recommendedTiming}
                          </span>
                        </div>
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
