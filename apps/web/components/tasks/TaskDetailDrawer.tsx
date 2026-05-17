'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReleaseCombobox } from '@/components/pre-save/ReleaseCombobox';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskMemberCombobox } from '@/components/tasks/TaskMemberCombobox';
import {
  formatFileSize,
  getRelativeDueLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskStatusTone,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type TaskDetail,
  type TaskGroup,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import { type PreSaveReleaseOption } from '@/lib/pre-save';

type TaskPatchInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedTo?: string | null;
  releaseId?: string | null;
  groupId?: string | null;
};

type TaskDetailDrawerProps = {
  isOpen: boolean;
  isLoading: boolean;
  error: string;
  task: TaskDetail | null;
  members: WorkspaceMember[];
  releases: PreSaveReleaseOption[];
  groups: TaskGroup[];
  isUploadingAttachment: boolean;
  onClose: () => void;
  onSavePatch: (patch: TaskPatchInput) => Promise<void>;
  onDeleteTask: () => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onUpdateComment: (commentId: string, content: string) => Promise<void>;
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

export function TaskDetailDrawer({
  isOpen,
  isLoading,
  error,
  task,
  members,
  releases,
  groups,
  isUploadingAttachment,
  onClose,
  onSavePatch,
  onDeleteTask,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onUploadAttachment,
  onDeleteAttachment,
}: TaskDetailDrawerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [releaseQuery, setReleaseQuery] = useState('');
  const [selectedRelease, setSelectedRelease] = useState<PreSaveReleaseOption | null>(null);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingCommentContent, setEditingCommentContent] = useState('');

  useEffect(() => {
    if (!task) {
      return;
    }

    setTitle(task.title);
    setDescription(task.description || '');
    const release = task.release
      ? releases.find((item) => item.id === task.release?.id) || {
          id: task.release.id,
          title: task.release.title,
          artistName: task.release.artistName,
          releaseDate: null,
          coverArtUrl: null,
          createdAt: '',
          updatedAt: '',
        }
      : null;
    setSelectedRelease(release);
    setReleaseQuery(release?.title || '');
    setSelectedAssignee(task.assignee || null);
    setAssigneeQuery(task.assignee?.name || '');
  }, [releases, task]);

  const releaseGroups = useMemo(
    () => groups.filter((group) => group.releaseId === (selectedRelease?.id || task?.releaseId || null)),
    [groups, selectedRelease?.id, task?.releaseId]
  );

  const due = task ? getRelativeDueLabel(task) : { label: 'No due date', isOverdue: false };

  return (
    <div
      className={`pointer-events-none fixed inset-y-0 right-0 z-[165] flex w-full justify-end transition ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="pointer-events-auto flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-stroke-default bg-bg-surface shadow-[-24px_0_64px_-34px_rgba(0,0,0,0.72)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stroke-subtle px-5 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Task detail</p>
            {task ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={getTaskStatusLabel(task.status)} tone={getTaskStatusTone(task.status)} size="sm" />
                <span className={due.isOverdue ? 'text-sm font-semibold text-status-error' : 'text-sm text-content-secondary'}>
                  {due.label}
                </span>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 rounded-[18px] bg-white/6" />
              <div className="h-24 rounded-[18px] bg-white/6" />
              <div className="h-24 rounded-[18px] bg-white/6" />
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-status-error/30 bg-status-error/10 px-4 py-4 text-sm text-status-error">
              {error}
            </div>
          ) : task ? (
            <div className="space-y-6">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-content-primary">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => {
                    if (title.trim() && title.trim() !== task.title) {
                      void onSavePatch({ title: title.trim() });
                    }
                  }}
                  className="input h-12 rounded-[18px] text-base font-semibold"
                />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Status</span>
                  <select
                    value={task.status}
                    onChange={(event) => void onSavePatch({ status: event.target.value as TaskStatus })}
                    className="input h-12 rounded-[18px]"
                  >
                    {TASK_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getTaskStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Priority</span>
                  <select
                    value={task.priority}
                    onChange={(event) => void onSavePatch({ priority: event.target.value as TaskPriority })}
                    className="input h-12 rounded-[18px]"
                  >
                    {TASK_PRIORITY_OPTIONS.map((priorityOption) => (
                      <option key={priorityOption} value={priorityOption}>
                        {getTaskPriorityLabel(priorityOption)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <TaskMemberCombobox
                  members={members}
                  selectedMember={selectedAssignee}
                  query={assigneeQuery}
                  onQueryChange={setAssigneeQuery}
                  onSelectMember={(member) => {
                    setSelectedAssignee(member);
                    setAssigneeQuery(member?.name || '');
                    void onSavePatch({ assignedTo: member?.id || null });
                  }}
                />

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Due date</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(task.dueDate)}
                    onChange={(event) => void onSavePatch({ dueDate: event.target.value || null })}
                    className="input h-12 rounded-[18px]"
                  />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <ReleaseCombobox
                  releases={releases}
                  selectedRelease={selectedRelease}
                  query={releaseQuery}
                  isLoading={false}
                  isCreating={false}
                  allowCreate={false}
                  onQueryChange={setReleaseQuery}
                  onSelectRelease={(release) => {
                    setSelectedRelease(release);
                    setReleaseQuery(release?.title || '');
                    void onSavePatch({
                      releaseId: release?.id || null,
                      groupId: null,
                    });
                  }}
                  onCreateRelease={async () => null}
                />

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Group</span>
                  <select
                    value={task.groupId || ''}
                    onChange={(event) => void onSavePatch({ groupId: event.target.value || null })}
                    className="input h-12 rounded-[18px]"
                    disabled={!selectedRelease && !task.releaseId}
                  >
                    <option value="">No group</option>
                    {releaseGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
                    <p className="text-sm text-content-secondary">No files yet.</p>
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
                                void onUpdateComment(comment.id, editingCommentContent);
                                setEditingCommentId('');
                                setEditingCommentContent('');
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

                        void onAddComment(commentDraft);
                        setCommentDraft('');
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
                    <p className="text-sm text-content-secondary">No activity yet.</p>
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
          ) : (
            <p className="text-sm text-content-secondary">Select a task to inspect the full context.</p>
          )}
        </div>
      </div>
    </div>
  );
}
