'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
  onAddCustomTask,
}: {
  state: ReleasePipelineState;
  tasks: ExecutionTask[];
  signals: AISignal[];
  onOpenTask: (task: ExecutionTask) => void;
  onCompleteTask: (task: ExecutionTask) => void;
  onAddCustomTask: (title: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const resetForm = () => {
    setDraftTitle('');
    setIsAdding(false);
  };

  const submitDraft = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed) return;
    onAddCustomTask(trimmed);
    resetForm();
  };

  return (
    <section className="space-y-4">
      <div className="rounded-none border border-stroke-default bg-bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="saas-eyebrow">Current State</p>
            <h2 className="mt-2 text-3xl text-content-primary">{getPipelineStateLabel(state)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-content-secondary">{STATE_COPY[state]}</p>
          </div>
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-2 rounded-none border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          )}
        </div>

        {isAdding && (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitDraft();
                if (event.key === 'Escape') resetForm();
              }}
              placeholder={`New task for ${getPipelineStateLabel(state).toLowerCase()}`}
              className="input flex-1 rounded-none border-white/10 bg-bg-elevated/50 focus:border-brand/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitDraft}
                disabled={!draftTitle.trim()}
                className="rounded-none border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-none border border-white/10 px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {signals.length ? (
        <div className="space-y-3">
          {signals.map((signal) => (
            <AISignalCard key={signal.id} signal={signal} />
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
            No execution blocks in this state yet. Add a task to get started.
          </div>
        )}
      </div>
    </section>
  );
}
