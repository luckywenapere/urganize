'use client';

import { useEffect, useRef } from 'react';
import { ReleaseCombobox } from '@/components/pre-save/ReleaseCombobox';
import { TaskMemberCombobox } from '@/components/tasks/TaskMemberCombobox';
import { type PreSaveReleaseOption } from '@/lib/pre-save';
import { TASK_PRIORITY_OPTIONS, getTaskPriorityLabel, type TaskPriority, type WorkspaceMember } from '@/lib/tasks';

type TaskQuickCreateModalProps = {
  isOpen: boolean;
  title: string;
  releaseQuery: string;
  selectedRelease: PreSaveReleaseOption | null;
  assigneeQuery: string;
  selectedAssignee: WorkspaceMember | null;
  dueDate: string;
  priority: TaskPriority;
  releases: PreSaveReleaseOption[];
  members: WorkspaceMember[];
  isLoadingReleases: boolean;
  isSaving: boolean;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onReleaseQueryChange: (value: string) => void;
  onSelectRelease: (release: PreSaveReleaseOption | null) => void;
  onAssigneeQueryChange: (value: string) => void;
  onSelectAssignee: (member: WorkspaceMember | null) => void;
  onDueDateChange: (value: string) => void;
  onPriorityChange: (value: TaskPriority) => void;
  onSubmit: () => Promise<void>;
};

export function TaskQuickCreateModal({
  isOpen,
  title,
  releaseQuery,
  selectedRelease,
  assigneeQuery,
  selectedAssignee,
  dueDate,
  priority,
  releases,
  members,
  isLoadingReleases,
  isSaving,
  onClose,
  onTitleChange,
  onReleaseQueryChange,
  onSelectRelease,
  onAssigneeQueryChange,
  onSelectAssignee,
  onDueDateChange,
  onPriorityChange,
  onSubmit,
}: TaskQuickCreateModalProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-[32px] border border-stroke-default bg-bg-surface p-5 shadow-[0_28px_80px_-38px_rgba(0,0,0,0.68)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Quick Create</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-content-primary">Create task</h2>
            <p className="mt-2 text-sm text-content-secondary">
              Title is enough to create a task. Everything else is optional.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            Close
          </button>
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-content-primary">Title</span>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !selectedRelease &&
                  !selectedAssignee &&
                  !dueDate &&
                  priority === 'none'
                ) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="input h-12 rounded-[18px]"
              placeholder="Pitch sheet draft due"
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <ReleaseCombobox
              releases={releases}
              selectedRelease={selectedRelease}
              query={releaseQuery}
              isLoading={isLoadingReleases}
              isCreating={false}
              allowCreate={false}
              onQueryChange={onReleaseQueryChange}
              onSelectRelease={onSelectRelease}
              onCreateRelease={async () => null}
            />

            <TaskMemberCombobox
              members={members}
              selectedMember={selectedAssignee}
              query={assigneeQuery}
              onQueryChange={onAssigneeQueryChange}
              onSelectMember={onSelectAssignee}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-content-primary">Due date</span>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(event) => onDueDateChange(event.target.value)}
                className="input h-12 rounded-[18px]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-content-primary">Priority</span>
              <select
                value={priority}
                onChange={(event) => onPriorityChange(event.target.value as TaskPriority)}
                className="input h-12 rounded-[18px]"
              >
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {getTaskPriorityLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-[18px] border border-stroke-default bg-bg-elevated px-4 py-3 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
