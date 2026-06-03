'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ReleaseCombobox } from '@/components/shared/ReleaseCombobox';
import { TaskMemberCombobox } from '@/components/tasks/TaskMemberCombobox';
import { type ReleaseOption } from '@/lib/release-helpers';
import { type WorkspaceMember } from '@/lib/tasks';
import { DEFAULT_GROUP_COLOR, GROUP_PRESETS } from '@/lib/group-presets';

type TaskQuickCreateModalProps = {
  isOpen: boolean;
  title: string;
  releaseQuery: string;
  selectedRelease: ReleaseOption | null;
  assigneeQuery: string;
  selectedAssignee: WorkspaceMember | null;
  dueDate: string;
  /** Single-tag label (or null when no tag is set). Mirrors the drawer's
   * Tag control: 5 preset chips + a custom free-text input. */
  groupName: string | null;
  groupColor: string | null;
  releases: ReleaseOption[];
  members: WorkspaceMember[];
  isLoadingReleases: boolean;
  isSaving: boolean;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onReleaseQueryChange: (value: string) => void;
  onSelectRelease: (release: ReleaseOption | null) => void;
  onAssigneeQueryChange: (value: string) => void;
  onSelectAssignee: (member: WorkspaceMember | null) => void;
  onDueDateChange: (value: string) => void;
  onTagChange: (name: string | null, color: string | null) => void;
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
  groupName,
  groupColor,
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
  onTagChange,
  onSubmit,
}: TaskQuickCreateModalProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [customTagDraft, setCustomTagDraft] = useState('');

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

  const canSubmit = Boolean(title.trim() && selectedRelease);

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
            <span className="mb-2 block text-sm font-semibold text-content-primary">
              Title<span className="text-status-error"> *</span>
            </span>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="input h-12 rounded-[18px]"
              placeholder="Pitch sheet draft due"
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="block">
              <span className="mb-2 block text-sm font-semibold text-content-primary">
                Release<span className="text-status-error"> *</span>
              </span>
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
            </div>

            <TaskMemberCombobox
              members={members}
              selectedMember={selectedAssignee}
              query={assigneeQuery}
              onQueryChange={onAssigneeQueryChange}
              onSelectMember={onSelectAssignee}
            />
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-content-primary">Due date</span>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(event) => onDueDateChange(event.target.value)}
              className="input h-12 rounded-[18px]"
            />
          </label>

          <div className="block">
            <span className="mb-2 block text-sm font-semibold text-content-primary">Tag</span>
            <div className="flex flex-wrap items-center gap-2">
              {GROUP_PRESETS.map((preset) => {
                const isActive =
                  (groupName || '').toLowerCase() === preset.name.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onTagChange(preset.name, preset.color)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'border-brand bg-brand/10 text-content-primary'
                        : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                    }`}
                    aria-pressed={isActive}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: preset.color }}
                      aria-hidden="true"
                    />
                    {preset.name}
                  </button>
                );
              })}
              {groupName ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomTagDraft('');
                    onTagChange(null, null);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-stroke-default bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  aria-label="Remove tag"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  Remove
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={customTagDraft}
                onChange={(event) => setCustomTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const trimmed = customTagDraft.trim();
                    if (!trimmed) return;
                    onTagChange(trimmed, DEFAULT_GROUP_COLOR);
                    setCustomTagDraft('');
                  }
                }}
                placeholder="Custom tag — press Enter"
                className="input h-10 flex-1 rounded-[14px] text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = customTagDraft.trim();
                  if (!trimmed) return;
                  onTagChange(trimmed, DEFAULT_GROUP_COLOR);
                  setCustomTagDraft('');
                }}
                disabled={!customTagDraft.trim()}
                className="inline-flex h-10 items-center rounded-[14px] border border-stroke-default bg-bg-elevated px-3 text-xs font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            {groupName ? (
              <p className="mt-2 text-xs text-content-tertiary">
                Current tag:{' '}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-2 py-0.5 text-[11px] font-medium text-content-secondary">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: groupColor || DEFAULT_GROUP_COLOR }}
                    aria-hidden="true"
                  />
                  {groupName}
                </span>
              </p>
            ) : null}
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
              disabled={isSaving || !canSubmit}
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
