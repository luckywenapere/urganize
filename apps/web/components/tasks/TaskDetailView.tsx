'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, X } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { TaskMemberCombobox } from '@/components/tasks/TaskMemberCombobox';
import {
  TaskDependenciesSection,
  type DependencyTaskSummary,
} from '@/components/tasks/TaskDependenciesSection';
import {
  formatFileSize,
  getRelativeDueLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskStatusTone,
  isEventMilestone,
  isTypingTarget,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { DEFAULT_GROUP_COLOR, GROUP_PRESETS } from '@/lib/group-presets';
import { isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';

const WORKSPACE_FLAG_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Linear-style property rows (Status / Priority / Assignee / Due date / Tag):
// a slim tertiary label column + a ghost control that only reveals its bounds
// on hover/focus. Replaces the stacked full-width form boxes that dominated
// the viewport on mobile. Native selects keep the dark-popup treatment
// documented on AssetUploadControl (solid dark tokens + [color-scheme:dark]
// instead of .input's transparent white background).
const PROPERTY_ROW_CLASS = 'grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3';
const PROPERTY_LABEL_CLASS = 'text-xs font-medium text-content-tertiary';
const PROPERTY_CONTROL_CLASS =
  'motion-focus h-9 w-full border border-transparent bg-transparent px-2 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-default hover:bg-bg-elevated focus:border-brand focus:bg-bg-elevated md:max-w-[300px]';

// A task's release is set at creation and fixed thereafter — the inline view is
// the edit surface, and re-homing tasks across releases is intentionally not a
// supported operation. `releaseId` and `groupId` are kept off this whitelist so
// even an accidental wire-format call from this surface gets caught at the type
// boundary. Re-exported so TaskUIProvider's render context can reference the
// same shape without a parallel definition drifting.
export type TaskDetailPatchInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedToUserId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
};

type TaskDetailViewProps = {
  /**
   * True while the augmented task detail (comments, attachments, activity)
   * is being fetched. The body renders as soon as `task` is non-null; this
   * flag drives spinners inside the comments / attachments / activity
   * sections only.
   */
  isLoading: boolean;
  isLoadingMembers?: boolean;
  error: string;
  task: TaskDetail | null;
  members: WorkspaceMember[];
  isUploadingAttachment: boolean;
  prerequisites: DependencyTaskSummary[];
  statusBlockerMessage: string;
  /** Back to the task list. Replaces the drawer's onClose. */
  onBack: () => void;
  onSavePatch: (patch: TaskDetailPatchInput) => Promise<void>;
  onOpenPrerequisite: (taskId: string) => void;
  onDeleteTask: () => Promise<void>;
  // Resolve true only when the mutation actually persisted — the view keeps
  // the typed text (comment draft, edit box) until then, so a failed save
  // never throws user input away.
  onAddComment: (content: string) => Promise<boolean>;
  onUpdateComment: (commentId: string, content: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
};

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60000);
  return localDate.toISOString().slice(0, 16);
}

/**
 * In-place task detail. Renders inside the consumer's main area (workspace
 * center column, release detail page) — no fixed-position shell, no overlay,
 * no backdrop, no body scroll lock. The only container is a semantic
 * <section>; the host layout decides width and surrounding context.
 *
 * Reuses the same field set as the prior TaskDetailDrawer body verbatim —
 * Title, Status, Priority, Assignee, Due date, Tag (workspace flag), Deps,
 * Description, Attachments, Comments, Activity, Delete. Only the container
 * (and the header's close → back affordance) changed.
 */
export function TaskDetailView({
  isLoading,
  isLoadingMembers = false,
  error,
  task,
  members,
  isUploadingAttachment,
  prerequisites,
  statusBlockerMessage,
  onBack,
  onSavePatch,
  onOpenPrerequisite,
  onDeleteTask,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onUploadAttachment,
  onDeleteAttachment,
}: TaskDetailViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [customTagDraft, setCustomTagDraft] = useState('');

  useEffect(() => {
    if (!task) {
      return;
    }

    setTitle(task.title);
    setDescription(task.description || '');
    setSelectedAssignee(task.assignee || null);
    setAssigneeQuery(task.assignee?.name || '');
  }, [task]);

  // Escape returns to the list. Unlike the drawer, we do NOT lock body scroll
  // — the inline view sits in the document flow and the page should scroll
  // normally. Typing-target guard prevents Escape from popping out of the
  // detail while the user is in the middle of editing a textarea/input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTypingTarget(event.target)) return;
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const due = task ? getRelativeDueLabel(task) : { label: 'No due date', isOverdue: false };

  return (
    <section aria-label="Task detail" className="min-w-0">
      {/* Header — single horizontal row with back affordance + at-a-glance
          status pill / event pill / due label. Sits flush against the top of
          the host container; no shadow, no border-bottom — the body itself
          carries the visual weight. */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to tasks"
          className="motion-focus motion-press inline-flex items-center gap-2 border border-stroke-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to tasks
        </button>

        {task ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge
              label={getTaskStatusLabel(task.status)}
              tone={getTaskStatusTone(task.status)}
              size="sm"
            />
            {isEventMilestone(task) ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-status-info/40 bg-status-info/10 px-2 py-0.5 text-[11px] font-semibold text-status-info">
                <CalendarDays className="h-3 w-3" />
                Event
              </span>
            ) : null}
            <span
              className={
                due.isOverdue
                  ? 'text-sm font-semibold text-status-error'
                  : 'text-sm text-content-secondary'
              }
            >
              {due.label}
            </span>
          </div>
        ) : null}
      </div>

      {error && !task ? (
        <div className="rounded-[24px] border border-status-error/30 bg-status-error/10 px-4 py-4 text-sm text-status-error">
          {error}
        </div>
      ) : task ? (
        <div className="space-y-6">
          {/* Mutation failures (comment save/edit/delete, attachment
              upload/delete, patch refetch) land in the same `error` channel —
              without this in-body banner they were invisible whenever a task
              was open, which is every time those buttons exist. */}
          {error ? (
            <div
              role="alert"
              className="rounded-[18px] border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error"
            >
              {error}
            </div>
          ) : null}
          {/* Title — the page heading, not a boxed form field. Borderless
              until focus; blur saves, same as before. The completion
              checkbox sits to its left, mirroring the row layout
              ([checkbox] [title]) from TaskRow. */}
          <div className="flex items-center gap-3">
            <TaskCompletionCheckbox
              taskId={task.id}
              status={task.status}
              taskTitle={task.title}
              onToggle={() =>
                onSavePatch({ status: task.status === 'done' ? 'todo' : 'done' })
              }
            />
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title.trim() && title.trim() !== task.title) {
                  void onSavePatch({ title: title.trim() });
                }
              }}
              aria-label="Title"
              placeholder="Task title"
              className="motion-focus min-w-0 flex-1 border-b border-transparent bg-transparent pb-1 font-display text-xl font-semibold leading-snug text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-stroke-strong sm:text-2xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Status</span>
              <select
                value={task.status}
                onChange={(event) => void onSavePatch({ status: event.target.value as TaskStatus })}
                className={PROPERTY_CONTROL_CLASS}
              >
                {TASK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status} className="bg-bg-elevated text-content-primary">
                    {getTaskStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            {statusBlockerMessage ? (
              <div className={PROPERTY_ROW_CLASS}>
                <span aria-hidden="true" />
                <p
                  role="alert"
                  className="rounded-[14px] border border-status-warning/35 bg-status-warning/10 px-3 py-2 text-xs text-status-warning md:max-w-[300px]"
                >
                  {statusBlockerMessage}
                </p>
              </div>
            ) : null}

            <label className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Priority</span>
              <select
                value={task.priority}
                onChange={(event) => void onSavePatch({ priority: event.target.value as TaskPriority })}
                className={PROPERTY_CONTROL_CLASS}
              >
                {TASK_PRIORITY_OPTIONS.map((priorityOption) => (
                  <option
                    key={priorityOption}
                    value={priorityOption}
                    className="bg-bg-elevated text-content-primary"
                  >
                    {getTaskPriorityLabel(priorityOption)}
                  </option>
                ))}
              </select>
            </label>

            {/* The visible row label lives here; the combobox keeps its own
                sr-only "Assignee" label for the input's accessible name. */}
            <div className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Assignee</span>
              <div className="md:max-w-[300px]">
                <TaskMemberCombobox
                  density="compact"
                  members={members}
                  selectedMember={selectedAssignee}
                  query={assigneeQuery}
                  onQueryChange={setAssigneeQuery}
                  isLoading={isLoadingMembers}
                  onSelectMember={(member) => {
                    setSelectedAssignee(member);
                    setAssigneeQuery(member?.name || '');
                    void onSavePatch({ assignedToUserId: member?.userId || null });
                  }}
                />
              </div>
            </div>

            <label className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Due date</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(task.dueDate)}
                onChange={(event) => void onSavePatch({ dueDate: event.target.value || null })}
                className={PROPERTY_CONTROL_CLASS}
              />
            </label>

            {WORKSPACE_FLAG_ENABLED ? (
              <div className={`${PROPERTY_ROW_CLASS} items-start`}>
                <span className={`${PROPERTY_LABEL_CLASS} pt-2`}>Tag</span>
                <div className="flex flex-wrap items-center gap-1.5 py-1">
                  {GROUP_PRESETS.map((preset) => {
                    const isActive =
                      (task.groupName || '').toLowerCase() === preset.name.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() =>
                          void onSavePatch({
                            groupName: preset.name,
                            groupColor: preset.color,
                          })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          isActive
                            ? 'border-brand bg-brand/10 text-content-primary'
                            : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                        }`}
                        aria-pressed={isActive}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: preset.color }}
                          aria-hidden="true"
                        />
                        {preset.name}
                      </button>
                    );
                  })}
                  {task.groupName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTagDraft('');
                        void onSavePatch({ groupName: null, groupColor: null });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-[11px] font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                      aria-label="Remove tag"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                  <input
                    type="text"
                    value={customTagDraft}
                    onChange={(event) => setCustomTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const trimmed = customTagDraft.trim();
                        if (!trimmed) return;
                        void onSavePatch({
                          groupName: trimmed,
                          groupColor: DEFAULT_GROUP_COLOR,
                        });
                        setCustomTagDraft('');
                      }
                    }}
                    placeholder="Custom tag"
                    className="motion-focus h-7 w-32 border border-transparent bg-transparent px-2 text-xs text-content-primary transition-colors placeholder:text-content-tertiary hover:border-stroke-default hover:bg-bg-elevated focus:border-brand focus:bg-bg-elevated"
                  />
                  {customTagDraft.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customTagDraft.trim();
                        if (!trimmed) return;
                        void onSavePatch({
                          groupName: trimmed,
                          groupColor: DEFAULT_GROUP_COLOR,
                        });
                        setCustomTagDraft('');
                      }}
                      className="inline-flex h-7 items-center rounded-full border border-stroke-default bg-bg-elevated px-2.5 text-[11px] font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Apply
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <TaskDependenciesSection
            dependencyIds={task.dependencies}
            prerequisites={prerequisites}
            onOpenPrerequisite={onOpenPrerequisite}
          />

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-content-primary">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => {
                if ((task.description || '') !== description) {
                  void onSavePatch({ description: description || null });
                }
              }}
              className="input min-h-[120px] rounded-[18px] py-3"
              placeholder="Add notes, context, links, or markdown-style bullets."
            />
          </label>

          <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">Attachments</h3>
                <p className="mt-1 text-xs text-content-secondary">Upload files for briefs, decks, or assets.</p>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-[16px] bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover">
                <input
                  type="file"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void onUploadAttachment(file);
                    }
                    event.currentTarget.value = '';
                  }}
                />
                {isUploadingAttachment ? 'Uploading...' : 'Attach file'}
              </label>
            </div>

            <div className="mt-4 space-y-2">
              {task.attachments.length === 0 ? (
                isLoading ? (
                  <SkeletonBlock className="h-10 w-full rounded-[18px]" />
                ) : (
                  <p className="text-sm text-content-secondary">No files yet.</p>
                )
              ) : (
                task.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-stroke-subtle bg-bg-surface px-3 py-3"
                  >
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 text-left"
                      onClick={(event) => {
                        // A remote-file target="_blank" anchor commonly opens
                        // blank inside the Capacitor webview — hand it to the
                        // system browser instead when running natively.
                        if (isNativePlatform()) {
                          event.preventDefault();
                          void openExternalUrl(attachment.fileUrl);
                        }
                      }}
                    >
                      <p className="truncate text-sm font-semibold text-content-primary">{attachment.fileName}</p>
                      <p className="mt-1 text-xs text-content-secondary">
                        {formatFileSize(attachment.fileSize)}
                      </p>
                    </a>
                    <button
                      type="button"
                      onClick={() => void onDeleteAttachment(attachment.id)}
                      className="rounded-full border border-stroke-default px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
            <h3 className="text-sm font-semibold text-content-primary">Comments</h3>
            <div className="mt-4 space-y-3">
              {isLoading && task.comments.length === 0 ? (
                <SkeletonBlock className="h-12 w-full rounded-[18px]" />
              ) : null}
              {task.comments.map((comment) => (
                <div key={comment.id} className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-content-primary">{comment.authorName}</p>
                      <p className="mt-1 text-xs text-content-secondary">
                        {new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {comment.isOwnComment ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditingCommentContent(comment.content);
                          }}
                          className="text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:text-content-primary"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteComment(comment.id)}
                          className="text-xs font-semibold uppercase tracking-[0.12em] text-status-error"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {editingCommentId === comment.id ? (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={editingCommentContent}
                        onChange={(event) => setEditingCommentContent(event.target.value)}
                        className="input min-h-[96px] rounded-[16px] py-3"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void onUpdateComment(comment.id, editingCommentContent).then(
                              (saved) => {
                                // Stay in edit mode with the text intact when
                                // the save failed — the drawer error banner
                                // says why.
                                if (saved) {
                                  setEditingCommentId('');
                                  setEditingCommentContent('');
                                }
                              }
                            );
                          }}
                          className="rounded-[14px] bg-brand px-3 py-2 text-xs font-semibold text-content-inverse"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId('');
                            setEditingCommentContent('');
                          }}
                          className="rounded-[14px] border border-stroke-default px-3 py-2 text-xs font-semibold text-content-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-content-secondary">
                      {comment.content}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                className="input min-h-[96px] rounded-[18px] py-3"
                placeholder="Add context for the team."
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!commentDraft.trim()) {
                      return;
                    }

                    // Clear the draft only after the save lands — clearing
                    // eagerly meant a failed request discarded what the user
                    // typed with no way back.
                    void onAddComment(commentDraft).then((saved) => {
                      if (saved) {
                        setCommentDraft('');
                      }
                    });
                  }}
                  className="rounded-[16px] bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Add comment
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
            <h3 className="text-sm font-semibold text-content-primary">Activity</h3>
            <div className="mt-4 space-y-3">
              {task.activity.length === 0 ? (
                isLoading ? (
                  <SkeletonBlock className="h-10 w-full rounded-[18px]" />
                ) : (
                  <p className="text-sm text-content-secondary">No activity yet.</p>
                )
              ) : (
                task.activity.map((entry) => (
                  <div key={entry.id} className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-3 py-3">
                    <p className="text-sm text-content-primary">
                      <span className="font-semibold">{entry.actorName}</span> {entry.message}
                    </p>
                    <p className="mt-1 text-xs text-content-secondary">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Delete this task? This cannot be undone.')) {
                  void onDeleteTask();
                }
              }}
              className="rounded-[16px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm font-semibold text-status-error"
            >
              Delete task
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <div className="h-10 rounded-[18px] skeleton-shimmer" />
          <div className="h-24 rounded-[18px] skeleton-shimmer" />
          <div className="h-24 rounded-[18px] skeleton-shimmer" />
        </div>
      ) : (
        <p className="text-sm text-content-secondary">Select a task to inspect the full context.</p>
      )}
    </section>
  );
}
