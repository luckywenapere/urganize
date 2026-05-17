'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AISignal, ExecutionTask, ReleasePipelineState } from '@/lib/execution-types';
import { getPipelineStateLabel } from '@/lib/release-execution';
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_OPTIONS,
  type TaskPriority,
  type WorkspaceMember,
} from '@/lib/tasks';
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

type AddTaskInput = {
  title: string;
  assignedTo?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
};

export function ExecutionSection({
  state,
  tasks,
  signals,
  members,
  onOpenTask,
  onCompleteTask,
  onAddCustomTask,
}: {
  state: ReleasePipelineState;
  tasks: ExecutionTask[];
  signals: AISignal[];
  members: WorkspaceMember[];
  onOpenTask: (task: ExecutionTask) => void;
  onCompleteTask: (task: ExecutionTask) => void;
  onAddCustomTask: (input: AddTaskInput) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');
  const [draftPriority, setDraftPriority] = useState<TaskPriority>('none');

  const activeMembers = members.filter((member) => member.status === 'active' && member.userId);

  const resetForm = () => {
    setDraftTitle('');
    setDraftAssignee('');
    setDraftDueDate('');
    setDraftPriority('none');
    setIsAdding(false);
  };

  const submitDraft = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed) return;
    onAddCustomTask({
      title: trimmed,
      assignedTo: draftAssignee || null,
      dueDate: draftDueDate ? new Date(draftDueDate).toISOString() : null,
      priority: draftPriority,
    });
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
          <div className="mt-5 space-y-3">
            <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitDraft();
                if (event.key === 'Escape') resetForm();
              }}
              placeholder={`New task for ${getPipelineStateLabel(state).toLowerCase()}`}
              className="input w-full rounded-none border-white/10 bg-bg-elevated/50 focus:border-brand/50"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Assignee
                </span>
                <select
                  value={draftAssignee}
                  onChange={(event) => setDraftAssignee(event.target.value)}
                  className="input w-full rounded-none border-white/10 bg-bg-elevated/50 focus:border-brand/50"
                >
                  <option value="">Unassigned</option>
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.userId || ''}>
                      {member.name || member.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Due date
                </span>
                <input
                  type="datetime-local"
                  value={draftDueDate}
                  onChange={(event) => setDraftDueDate(event.target.value)}
                  className="input w-full rounded-none border-white/10 bg-bg-elevated/50 focus:border-brand/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Priority
                </span>
                <select
                  value={draftPriority}
                  onChange={(event) => setDraftPriority(event.target.value as TaskPriority)}
                  className="input w-full rounded-none border-white/10 bg-bg-elevated/50 focus:border-brand/50"
                >
                  {TASK_PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {getTaskPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
