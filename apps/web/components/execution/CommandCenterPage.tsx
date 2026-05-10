'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Play, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import type { AISignal, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { calculateOverallReadiness, cleanTaskTitle, formatArtistName, formatReleaseTitle, selectPrimaryRelease } from '@/lib/release-execution';
import { getPriorityBorderClass, type TaskStatus } from '@/lib/tasks';
import { useActivityStore } from '@/stores/useActivityStore';
import { useAIStore } from '@/stores/useAIStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { AISignal as AISignalCard } from '@/components/execution/AISignal';
import { FocusCard } from '@/components/execution/FocusCard';
import { ReadinessBar } from '@/components/execution/ReadinessBar';
import { TaskDetailModal } from '@/components/execution/TaskDetailModal';

function QuickCreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-none border border-white/10 bg-bg-surface p-6 shadow-none">
        <h2 className="font-display text-xl font-bold text-content-primary">INITIATE RELEASE</h2>
        <label className="mt-6 block">
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-content-secondary">RELEASE_NAME</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input rounded-none border-white/10 bg-bg-elevated/50 focus:border-green-400/50"
            placeholder="e.g. MIDNIGHT_DEMO"
          />
        </label>
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-content-secondary hover:bg-white/5">
            CANCEL
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => onCreate(title.trim())}
            className="bg-brand px-6 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-content-inverse disabled:opacity-50"
          >
            CREATE_RELEASE
          </button>
        </div>
      </div>
    </div>
  );
}

function Nudge({ message, onDismiss }: { message: string, onDismiss: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 3000);
    const t2 = setTimeout(onDismiss, 3300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-0 left-0 right-0 h-10 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-center font-mono text-xs text-white/40 z-[300] transition-opacity duration-300 ${visible ? 'opacity-100 animate-in fade-in duration-150' : 'opacity-0'}`}>
      {message}
    </div>
  );
}

function getRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

export function CommandCenterPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, todaysDirective, isInitialLoading, isRefreshing, error, loadCommandCenter, createRelease } = useReleaseStore();
  const { tasks, selectedTaskId, selectTask, completeTask, updateTaskStatus, updateRequirement, createTask, error: taskError } = useTaskStore();
  const { activity } = useActivityStore();
  const { signals, runCheck } = useAIStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nudge, setNudge] = useState<{ message: string; id: number } | null>(null);
  const [filter, setFilter] = useState<'active' | 'overdue' | 'blocked' | 'completed'>('active');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter().then(async (data) => {
      if (!data) return;
      void runCheck(data);

      const incomplete = data.tasks.filter((t) => t.status !== TASK_DONE_STATUS && t.status !== 'cancelled');
      if (incomplete.length < 3) {
        const primary = selectPrimaryRelease(data.releases, data.tasks);
        if (primary) {
          try {
            const { data: authData } = await supabase.auth.getSession();
            const token = authData.session?.access_token;
            if (!token) return;

            const response = await fetch('/api/ai/generate-task', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ mode: 'next-step', releaseId: primary.id }),
            });

            if (response.ok) {
              const generated = await response.json();
              const exists = data.tasks.some(
                (t) =>
                  t.releaseId === primary.id &&
                  t.title.toLowerCase().trim() === generated.title.toLowerCase().trim()
              );

              if (!exists) {
                await createTask({
                  title: generated.title,
                  releaseId: primary.id,
                  state: primary.state,
                  autoGenerated: true,
                });
              }
            }
          } catch {
            // Fail silently
          }
        }
      }
    });
  }, [authLoading, loadCommandCenter, router, runCheck, user?.id, createTask]);

  const primaryRelease = useMemo(() => selectPrimaryRelease(releases, tasks), [releases, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter((t) => t.assignedToUserId === user.id);
  }, [tasks, user]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    return myTasks
      .filter((t) => {
        if (filter === 'overdue') return t.status !== TASK_DONE_STATUS && t.status !== 'cancelled' && t.dueDate && new Date(t.dueDate) < now;
        if (filter === 'active') return t.status === 'todo' || t.status === 'in_progress';
        if (filter === 'blocked') return t.status === 'blocked';
        if (filter === 'completed') return t.status === TASK_DONE_STATUS;
        return true;
      })
      .sort((left, right) => {
        if (left.status === 'in_progress' && right.status !== 'in_progress') return -1;
        if (left.status !== 'in_progress' && right.status === 'in_progress') return 1;
        
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return leftDue - rightDue;
      });
  }, [myTasks, filter]);

  const handleUpdateStatus = async (taskId: string, status: TaskStatus) => {
    await updateTaskStatus(taskId, status);
  };

  const handleSignalAction = async (signal: AISignal) => {
    const release = releases.find((candidate) => candidate.id === signal.releaseId);
    if (!release) return;
    const task = await createTask({
      title: signal.title.includes('Campaign') ? 'Build release campaign checklist' : `Resolve: ${signal.title}`,
      releaseId: release.id,
      state: signal.state || release.state,
      autoGenerated: true,
      requirement: {
        type: 'approval',
        spec: 'Review the generated plan and approve the next action.',
        satisfied: false,
      },
    });
    if (task) selectTask(task.id);
  };

  const handleCreateRelease = async (title: string) => {
    const release = await createRelease(title, 'idea');
    setShowCreateModal(false);
    if (release) router.push(`/dashboard/releases/${release.id}`);
  };

  if (isInitialLoading || authLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <header className="sticky top-0 z-50 h-12 border-b border-white/5 bg-bg-base/80 backdrop-blur-md" />
        <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
          <div className="mb-6 h-24 w-80 bg-white/5 shimmer rounded-none" />
          <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
            <div className="space-y-6">
              <div className="h-[300px] bg-white/5 shimmer rounded-none" />
              <div className="h-[450px] bg-white/5 shimmer rounded-none" />
            </div>
            <div className="space-y-6">
              <div className="h-[350px] bg-white/5 shimmer rounded-none" />
              <div className="h-[250px] bg-white/5 shimmer rounded-none" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-white/5 bg-bg-base/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          {/* Left zone recedes */}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
            {user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'STUDIO'}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">

        {error || taskError ? (
          <p className="mb-6 border border-status-error/35 bg-status-error/5 px-4 py-3 font-mono text-xs text-status-error uppercase tracking-widest">
            ERROR_LOG: {error || taskError}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
          {isRefreshing && (
            <div className="fixed left-0 right-0 top-0 z-[200] h-[2px] overflow-hidden bg-white/5 opacity-40">
              <div className="animate-refresh-bar absolute top-0 h-full bg-brand" />
            </div>
          )}
          <div className="space-y-6">
            <div className="animate-enter opacity-0 [animation-delay:0ms]">
              <FocusCard
                release={primaryRelease}
                tasks={tasks}
                todaysDirective={todaysDirective}
                onContinue={(release) => router.push(`/dashboard/releases/${release.id}`)}
                onSelectTask={selectTask}
              />
            </div>

            <section className="panel-shell animate-enter rounded-sm border-t border-white/5 p-6 shadow-none opacity-0 [animation-delay:50ms]">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-sans text-sm font-medium text-white/40">My Tasks</h2>
                <div className="flex flex-wrap gap-2">
                  {(['active', 'overdue', 'blocked', 'completed'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 transition-colors ${filter === f ? 'bg-brand text-content-inverse' : 'text-white/30 hover:text-white/60'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              
              {filteredTasks.length ? (
                <div className="space-y-3">
                  {filteredTasks.map((task, index) => {
                    const isOverdue = task.status !== TASK_DONE_STATUS && task.dueDate && new Date(task.dueDate) < new Date();
                    const priorityClass = 
                      task.priority === 'urgent' || task.priority === 'high' ? 'border-l-status-error' :
                      task.priority === 'medium' ? 'border-l-status-warning' : 'border-l-white/20';
                    
                    return (
                      <div key={task.id} className={`animate-enter group relative rounded-none border border-white/5 border-l-2 bg-bg-elevated/40 p-5 shadow-none transition-all duration-200 hover:bg-bg-elevated/60 opacity-0 ${priorityClass}`} style={{ animationDelay: `${index * 40 + 100}ms` }}>
                        <div className="absolute right-5 top-5 flex items-center gap-2">
                           {task.dueDate && (
                             <>
                               <span className={`font-mono text-[10px] ${isOverdue ? 'text-status-error' : 'text-content-tertiary'}`}>
                                 {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}
                               </span>
                               <div className={`h-1 w-1 rounded-none ${isOverdue ? 'bg-status-error' : 'bg-content-tertiary'} opacity-30`} />
                             </>
                           )}
                           <span className={`font-mono text-[10px] uppercase tracking-widest ${
                             task.status === 'in_progress' ? 'text-brand' : 
                             task.status === 'blocked' ? 'text-status-error' : 
                             task.status === 'done' ? 'text-green-400' : 'text-white/30'
                           }`}>
                             {task.status.replace('_', ' ')}
                           </span>
                        </div>
                        <div className="pr-20" onClick={() => selectTask(task.id)} role="button">
                          <p className="font-display text-base font-semibold tracking-tight text-content-primary group-hover:text-brand transition-colors">
                            {cleanTaskTitle(task.title)}
                          </p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-content-tertiary">
                            {task.release?.title || 'GLOBAL'}
                          </p>
                        </div>
                        
                        <div className="mt-4 flex flex-wrap gap-2 justify-end">
                          {task.status !== 'in_progress' && task.status !== TASK_DONE_STATUS && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                              className="flex items-center gap-1.5 border border-brand/40 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-brand hover:bg-brand/10 transition-all duration-150"
                            >
                              <Play className="h-3 w-3" />
                              Start
                            </button>
                          )}
                          {task.status !== 'blocked' && task.status !== TASK_DONE_STATUS && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(task.id, 'blocked')}
                              className="flex items-center gap-1.5 border border-status-error/40 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-status-error hover:bg-status-error/10 transition-all duration-150"
                            >
                              <AlertCircle className="h-3 w-3" />
                              Block
                            </button>
                          )}
                          {task.status !== TASK_DONE_STATUS && (
                            <button
                              type="button"
                              onClick={() => completeTask(task.id)}
                              className="flex items-center gap-1.5 border border-green-400/40 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-green-400 hover:bg-green-400/10 transition-all duration-150"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center border border-white/5 bg-bg-elevated/40 p-12 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-content-tertiary">
                    {filter === 'active' ? 'ALL_TASKS_RESOLVED: SYSTEM_NOMINAL' : `NO_${filter.toUpperCase()}_TASKS_FOUND`}
                  </p>
                  {filter === 'active' && (
                    <button onClick={() => setFilter('completed')} className="mt-4 font-mono text-[10px] text-brand hover:underline uppercase tracking-widest">
                      VIEW_COMPLETED_HISTORY
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="panel-shell animate-enter rounded-sm border-t border-white/5 p-6 shadow-none opacity-0 [animation-delay:150ms]">
              <h2 className="mb-6 font-sans text-sm font-medium text-white/40">Signals</h2>
              <div className="space-y-3">
                {signals.length ? (
                  <>
                    {signals.slice(0, 2).map((signal) => (
                      <AISignalCard key={signal.id} signal={signal} onAction={handleSignalAction} />
                    ))}
                    {signals.length > 2 && (
                      <button type="button" className="w-full border-t border-white/5 pt-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-brand hover:text-brand-hover">
                        VIEW ALL SIGNALS ({signals.length})
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center border border-white/5 bg-bg-elevated/40 p-8">
                    <p className="font-sans text-xs text-content-tertiary">
                      Nothing urgent. You&apos;ll hear from us when something needs attention.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="panel-shell animate-enter rounded-sm border-t border-white/5 p-6 shadow-none opacity-0 [animation-delay:200ms]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-sans text-sm font-medium text-white/40">Readiness</h2>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="flex h-8 w-8 items-center justify-center border border-white/10 bg-bg-elevated text-brand transition-all hover:bg-white/5 active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
              </div>
              {releases.length ? (
                <div className="space-y-4">
                  {releases.map((release) => {
                    const readiness = calculateOverallReadiness(tasks.filter((task) => task.releaseId === release.id));
                    return (
                      <button
                        key={release.id}
                        type="button"
                        onClick={() => router.push(`/dashboard/releases/${release.id}`)}
                        className="block w-full border border-white/5 bg-bg-elevated/40 p-5 text-left transition-colors hover:bg-bg-elevated/70"
                      >
                        <div className="mb-4">
                          <p className="font-mono text-3xl font-bold tracking-tighter text-content-primary">{readiness}%</p>
                          <div className="mt-1 flex flex-col gap-0.5">
                            <span className="truncate font-semibold text-content-primary">
                              {release.title}
                            </span>
                            <span className="truncate font-mono text-[10px] text-content-tertiary">
                              {formatArtistName(release.artistName)}
                            </span>
                          </div>
                        </div>
                        <ReadinessBar value={readiness} showTicks={true} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="w-full border border-dashed border-white/10 bg-white/5 p-5 text-left font-mono text-[10px] uppercase tracking-widest text-content-tertiary"
                >
                  SYSTEM_IDLE: INITIATE_NEW_OPERATION
                </button>
              )}
            </section>

            <section className="panel-shell animate-enter rounded-sm border-t border-white/5 p-6 shadow-none opacity-0 [animation-delay:250ms]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-sans text-sm font-medium text-white/40">Activity</h2>
                  {activity.length > 0 && (new Date().getTime() - new Date(activity[0].createdAt).getTime() < 24 * 60 * 60 * 1000) && (
                    <div className="h-1 w-1 animate-pulse rounded-none bg-green-400" />
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {activity.length ? (
                  activity.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="border border-white/5 bg-bg-elevated/30 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-white/50">{entry.actorName}</span>
                        <span className="font-sans text-xs text-white/20">{getRelativeTime(entry.createdAt)}</span>
                      </div>
                      <p className="text-xs text-white/30">{entry.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-3 border border-white/5 bg-bg-elevated/30 p-6">
                    <div className="h-1 w-1 rounded-none bg-white/20" />
                    <p className="font-sans text-xs text-white/30">
                      Quiet for now.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <TaskDetailModal
        task={selectedTask}
        allTasks={tasks}
        onClose={() => selectTask(null)}
        onSatisfyRequirement={(task) => {
          void updateRequirement(task.id, task.requirement ? { ...task.requirement, satisfied: true } : null);
        }}
        onComplete={(task) => {
          void completeTask(task.id).then((updated) => {
            if (updated) {
              void runCheck({ releases, tasks: useTaskStore.getState().tasks, releaseId: updated.releaseId });
              const remaining = useTaskStore.getState().tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
              if (remaining.length > 0) {
                setNudge({ message: 'Good. Keep the momentum going.', id: Date.now() });
              } else {
                setNudge({ message: "That's today sorted. Come back tomorrow to keep this moving.", id: Date.now() });
              }
            }
          });
        }}
      />

      {showCreateModal ? <QuickCreateModal onClose={() => setShowCreateModal(false)} onCreate={handleCreateRelease} /> : null}
      
      {nudge && <Nudge key={nudge.id} message={nudge.message} onDismiss={() => setNudge(null)} />}
    </main>
  );
}
