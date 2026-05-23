'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PanelRight, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createActor } from 'xstate';
import { useAuthStore } from '@/lib/auth-store';
import {
  RELEASE_PIPELINE_STATES,
  TASK_DONE_STATUS,
  type ExecutionTask,
  type ReleasePipelineState,
} from '@/lib/execution-types';
import {
  calculateReadinessForState,
  formatArtistName,
  getNextPipelineState,
  getPipelineStateLabel,
} from '@/lib/release-execution';
import { supabase } from '@/lib/supabase/client';
import type { TaskPriority, WorkspaceMember } from '@/lib/tasks';
import { releaseMachine } from '@/machines/releaseMachine';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { ExecutionSection } from '@/components/execution/ExecutionSection';
import { ReadinessBar } from '@/components/execution/ReadinessBar';
import { StateStepper } from '@/components/execution/StateStepper';
import { TaskDetailModal } from '@/components/execution/TaskDetailModal';

export function ReleaseWorkspacePage({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter, updateReleaseState } = useReleaseStore();
  const { tasks, selectedTaskId, selectTask, completeTask, updateRequirement, createTask, error: taskError } = useTaskStore();
  const [selectedState, setSelectedState] = useState<ReleasePipelineState>('idea');
  const [stateError, setStateError] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter().then((data) => {
      const release = data?.releases.find((candidate) => candidate.id === releaseId);
      if (release) setSelectedState(release.state);
    });
  }, [authLoading, loadCommandCenter, releaseId, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    const loadMembers = async () => {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) return;
      const response = await fetch('/api/workspace/members', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as { members?: WorkspaceMember[] };
      if (response.ok && Array.isArray(payload.members)) {
        setMembers(payload.members);
      }
    };
    void loadMembers();
  }, [authLoading, user]);

  const release = releases.find((candidate) => candidate.id === releaseId) || null;
  const releaseTasks = useMemo(() => tasks.filter((task) => task.releaseId === releaseId), [releaseId, tasks]);
  const stateTasks = useMemo(
    () => releaseTasks.filter((task) => task.state === selectedState),
    [releaseTasks, selectedState]
  );
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const readinessByState = useMemo(
    () =>
      RELEASE_PIPELINE_STATES.reduce(
        (acc, state) => {
          acc[state] = calculateReadinessForState(releaseTasks, state);
          return acc;
        },
        {} as Record<ReleasePipelineState, number>
      ),
    [releaseTasks]
  );
  const overallReadiness = release
    ? Math.round(RELEASE_PIPELINE_STATES.reduce((sum, state) => sum + readinessByState[state], 0) / RELEASE_PIPELINE_STATES.length)
    : 0;
  const advanceState = async () => {
    if (!release) return;
    setStateError('');

    const actor = createActor(
      releaseMachine.provide({
        guards: {
          stateReady: () => readinessByState[release.state] >= 100,
        },
      }),
      {
        input: {
          readinessByState,
        },
      }
    );
    actor.start();
    actor.send({ type: 'ADVANCE' });
    actor.stop();

    const expectedNextState = getNextPipelineState(release.state);
    if (!expectedNextState || readinessByState[release.state] < 100) {
      setStateError(`${getPipelineStateLabel(release.state)} must reach 100% readiness before advancing.`);
      return;
    }

    await updateReleaseState(release.id, expectedNextState);
    setSelectedState(expectedNextState);
  };

  const addCustomTask = async (input: {
    title: string;
    assignedTo?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
  }) => {
    if (!release) return;
    const created = await createTask({
      title: input.title,
      releaseId: release.id,
      state: selectedState,
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
      priority: input.priority,
    });
    if (created) {
      selectTask(created.id);
    }
  };

  if (isInitialLoading || authLoading) {
    return <main className="min-h-screen bg-bg-base p-6 text-content-primary">Loading release workspace...</main>;
  }

  if (!release) {
    return (
      <main className="min-h-screen bg-bg-base p-6 text-content-primary">
        <div className="panel-shell mx-auto max-w-xl p-6">
          <h1 className="text-2xl">Release not found</h1>
          <Link href="/command-center" className="mt-4 inline-flex rounded-none bg-brand px-4 py-2 text-sm font-semibold text-content-inverse">
            Back to Command Center
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1500px] px-4 pb-28 pt-4 sm:px-6 lg:px-8">
        <header className="panel-shell mb-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/command-center" className="text-sm text-content-secondary hover:text-content-primary">
                Command Center
              </Link>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3.8rem)] text-content-primary">{release.title}</h1>
              <p className="mt-1 text-sm text-content-secondary">{formatArtistName(release.artistName)}</p>
            </div>
            <div className="min-w-[260px] rounded-sm border border-stroke-subtle bg-bg-elevated p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-sm border border-brand/25 bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                  {getPipelineStateLabel(release.state)}
                </span>
                <span className="text-sm text-content-secondary">{overallReadiness}% overall</span>
              </div>
              <ReadinessBar value={readinessByState[release.state]} />
            </div>
          </div>

          <div className="mt-5 hidden grid-cols-6 gap-2 md:grid">
            {RELEASE_PIPELINE_STATES.map((state) => (
              <div key={state} className="rounded-sm border border-stroke-subtle bg-bg-elevated p-3">
                <p className="truncate text-xs font-semibold text-content-primary">{getPipelineStateLabel(state)}</p>
                <ReadinessBar value={readinessByState[state]} />
              </div>
            ))}
          </div>
        </header>

        {error || taskError || stateError ? (
          <p className="mb-4 rounded-sm border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error || taskError || stateError}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="hidden lg:block">
            <StateStepper currentState={release.state} selectedState={selectedState} onSelect={setSelectedState} />
          </aside>

          <ExecutionSection
            state={selectedState}
            tasks={stateTasks}
            signals={[]}
            onOpenTask={(task) => selectTask(task.id)}
            onCompleteTask={(task) => {
              void completeTask(task.id);
            }}
            members={members}
            onAddCustomTask={(input) => void addCustomTask(input)}
          />

          <aside className={`${contextOpen ? 'fixed inset-x-0 bottom-0 z-[130] max-h-[75vh] overflow-y-auto rounded-none border-t border-stroke-default bg-bg-surface p-5 lg:static lg:block lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0' : 'hidden lg:block'}`}>
            <div className="space-y-4">
              <section className="rounded-sm border border-stroke-default bg-bg-surface p-4">
                <h2 className="font-semibold text-content-primary">Context</h2>
                <p className="mt-3 text-sm text-content-secondary">Deadline: {release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'Not set'}</p>
                <p className="mt-2 text-sm text-content-secondary">Open blocks: {releaseTasks.filter((task) => task.status !== TASK_DONE_STATUS).length}</p>
                <button
                  type="button"
                  onClick={() => void advanceState()}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-none bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  <Rocket className="h-4 w-4" />
                  Advance Stage
                </button>
              </section>

            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-stroke-default bg-bg-surface/95 p-2 backdrop-blur md:hidden">
        <StateStepper currentState={release.state} selectedState={selectedState} onSelect={setSelectedState} mobile />
      </div>

      <button
        type="button"
        onClick={() => setContextOpen((value) => !value)}
        className="fixed bottom-20 right-4 z-[100] inline-flex h-12 w-12 items-center justify-center rounded-sm bg-brand text-content-inverse shadow-lg lg:hidden"
      >
        <PanelRight className="h-5 w-5" />
      </button>

      <TaskDetailModal
        task={selectedTask as ExecutionTask | null}
        allTasks={releaseTasks}
        onClose={() => selectTask(null)}
        onSatisfyRequirement={(task) => {
          void updateRequirement(task.id, task.requirement ? { ...task.requirement, satisfied: true } : null);
        }}
        onComplete={(task) => {
          void completeTask(task.id);
        }}
      />
    </main>
  );
}
