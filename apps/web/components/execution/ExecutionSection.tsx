'use client';

import type { AISignal, ExecutionTask, ReleasePipelineState } from '@/lib/execution-types';
import { getPipelineStateLabel } from '@/lib/release-execution';
import { AISignal as AISignalCard } from '@/components/execution/AISignal';
import { TaskBlock } from '@/components/execution/TaskBlock';

const STATE_COPY: Record<ReleasePipelineState, string> = {
  idea: 'Define the release, owner, audience, and reason this campaign exists.',
  planning: 'Lock the rollout strategy, dates, and operating plan.',
  asset_prep: 'Upload artwork, audio, credits, and required creative assets.',
  distribution: 'Check metadata, distribution readiness, and delivery blockers.',
  campaign: 'Coordinate pre-save, content, pitching, and rollout momentum.',
  post_release: 'Review performance, follow-ups, learnings, and next release actions.',
};

export function ExecutionSection({
  state,
  tasks,
  signals,
  onOpenTask,
  onCompleteTask,
  onGenerateTask,
}: {
  state: ReleasePipelineState;
  tasks: ExecutionTask[];
  signals: AISignal[];
  onOpenTask: (task: ExecutionTask) => void;
  onCompleteTask: (task: ExecutionTask) => void;
  onGenerateTask: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-none border border-stroke-default bg-bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="saas-eyebrow">Current State</p>
            <h2 className="mt-2 text-3xl text-content-primary">{getPipelineStateLabel(state)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-content-secondary">{STATE_COPY[state]}</p>
          </div>
          <button
            type="button"
            onClick={onGenerateTask}
            className="rounded-none border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Generate Plan
          </button>
        </div>
      </div>

      {signals.length ? (
        <div className="space-y-3">
          {signals.map((signal) => (
            <AISignalCard key={signal.id} signal={signal} onAction={onGenerateTask} />
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskBlock key={task.id} task={task} allTasks={tasks} onOpen={onOpenTask} onComplete={onCompleteTask} />
          ))
        ) : (
          <div className="rounded-none border border-stroke-subtle bg-bg-elevated p-5 text-sm text-content-secondary">
            No execution blocks in this state yet. Generate a plan or add a task from the workspace.
          </div>
        )}
      </div>
    </section>
  );
}
