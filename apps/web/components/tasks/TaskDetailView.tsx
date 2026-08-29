'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { TaskMemberSelect } from '@/components/tasks/TaskMemberSelect';
import { ShareLoginActions } from '@/components/team/ShareLoginActions';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import {
  TaskDependenciesSection,
  type DependencyTaskSummary,
} from '@/components/tasks/TaskDependenciesSection';
import {
  formatFileSize,
  getRelativeDueLabel,
  getTaskStatusLabel,
  getTaskStatusTone,
  isEventMilestone,
  isTypingTarget,
  TASK_STATUS_OPTIONS,
  type TaskDetail,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import { TASK_OUTCOME_LABELS } from '@/lib/task-outcomes';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';

// Feature flag (URG-203): task attachments stay dark until
// NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS is 'true' (URG-182 precedent — same
// pattern as release-level file storage, a separate flag). Off by default;
// existing task_attachments rows and task-attachments bucket objects are
// untouched, this only hides the section and gates the API routes.
const TASK_ATTACHMENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS === 'true';

// Post-completion check-in. Off by default; when off this view simply never
// renders the Outcome section (the read path returns null too).
const TASK_OUTCOMES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TASK_OUTCOMES === 'true';

// 2026-07-23 (founder calls): the Priority selector, the Tag row, and the
// Activity feed were all removed from this view. Priority is gone as a
// feature (no selector anywhere; rows no longer color by it); tags are gone
// from this surface; the per-task activity feed (the task_activity audit
// trail) is no longer rendered. Restore any of them from git history.

// Linear-style property rows (Status / Assignee / Due date):
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
  dueDate?: string | null;
  assignedToUserId?: string | null;
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
 * Task detail body. Since 2026-07-23 this renders inside the pop-up shell
 * (`TaskDetailModal` in TaskUIProvider) — the modal owns the overlay, scrim,
 * entrance animation, and scroll containment; this component owns the fields:
 * Title, Status, Assignee, Due date, Dependencies, Description, Attachments,
 * Comments, Delete. `onBack` closes the modal (the header X + Escape).
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
  onUploadAttachment,
  onDeleteAttachment,
}: TaskDetailViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Invite-a-teammate-by-email, right from the task drawer (founder request,
  // 2026-08-17): a manager who's assigning work and realizes the person isn't
  // on the roster yet shouldn't have to abandon the task and go to Settings.
  // Reuses the same POST /api/workspace/members/invite call and the same
  // Copy/WhatsApp/Email share prompt (ShareLoginActions) TeammatesSection and
  // the Team-logins flow already use, so the result is identical wherever it
  // was started from.
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // The release this activity belongs to, for the header. The fetched detail
  // carries `task.release`; the optimistic store-seeded task may not, so fall
  // back to resolving `releaseId` against the release store.
  const storeReleases = useReleaseStore((state) => state.releases);
  const releaseTitle =
    task?.release?.title ??
    (task?.releaseId ? storeReleases.find((r) => r.id === task.releaseId)?.title : null) ??
    null;

  // Title is a textarea (so long titles WRAP on narrow screens instead of
  // cropping inside a single-line input) that auto-grows to fit its content.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    if (!task) {
      return;
    }

    setTitle(task.title);
    setDescription(task.description || '');
    setSelectedAssignee(task.assignee || null);
    // Keyed on the task's id for the same reason as the invite reset below:
    // the drawer's async detail fetch (and every field save) hands back a new
    // `task` reference for the SAME activity, and re-seeding on that wiped
    // whatever the user was mid-way through typing — a title, or a teammate's
    // name in the assignee search. Only switching activities should reseed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Keyed on the task's id, not the whole `task` object: an unrelated field
  // save (status, due date, ...) gives the parent a new `task` reference for
  // the SAME task, and that must not wipe an invite the user is mid-typing.
  // Only actually switching which task is open should reset this.
  useEffect(() => {
    setInviteEmail('');
    setIsInviting(false);
    setInviteMessage('');
    setInviteError('');
    setInviteUrl(null);
  }, [task?.id]);

  // Escape closes the pop-up. Typing-target guard prevents Escape from
  // closing the modal while the user is mid-edit in a textarea/input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTypingTarget(event.target)) return;
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const handleInviteTeammate = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setInviteError('Enter a valid email.');
      return;
    }

    setIsInviting(true);
    setInviteError('');
    setInviteMessage('');
    setInviteUrl(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // 'team-member' — the same role a manager would pick for someone
        // being assigned work, not one of the artist/viewer roles that need
        // an extra picker this compact a control has no room for.
        body: JSON.stringify({ email, role: 'team-member' }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        inviteUrl?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not invite teammate.');
      }

      setInviteEmail('');
      if (payload.inviteUrl) {
        setInviteUrl(payload.inviteUrl);
        setInviteMessage('Invite link created — share it with your teammate.');
      } else {
        setInviteMessage('Already a member of this workspace.');
      }
    } catch (err) {
      setInviteError(errorMessage(err, 'Could not invite teammate.'));
    } finally {
      setIsInviting(false);
    }
  };

  const due = task ? getRelativeDueLabel(task) : { label: 'No due date', isOverdue: false };

  return (
    <section aria-label="Activity detail" className="min-w-0">
      {/* Pop-up header — at-a-glance status pill / event pill / due label on
          the left, a single X close on the right. The modal shell already
          separates this surface from the page; no back-button framing. */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {task ? (
            <>
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
              {/* The release this activity belongs to — between the status
                  pill and the due label, so the header reads
                  "To do · <release> · Due in 11 days". */}
              {releaseTitle ? (
                <>
                  <span
                    className="min-w-0 max-w-[12rem] truncate text-sm text-content-secondary"
                    title={releaseTitle}
                  >
                    {releaseTitle}
                  </span>
                  <span aria-hidden="true" className="text-content-tertiary">
                    ·
                  </span>
                </>
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
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onBack}
          aria-label="Close activity"
          className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-content-tertiary transition-colors hover:border-stroke-default hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
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
          {/* items-start (not center) + a small top offset on the checkbox:
              a long title wraps to multiple lines on narrow screens, and the
              checkbox should hold the first line, not float mid-block. */}
          <div className="flex items-start gap-3">
            <TaskCompletionCheckbox
              taskId={task.id}
              status={task.status}
              taskTitle={task.title}
              onToggle={() =>
                onSavePatch({ status: task.status === 'done' ? 'todo' : 'done' })
              }
              className="mt-0.5 sm:mt-1"
            />
            {/* A textarea, not an input: single-line inputs CROP long titles
                on mobile. rows=1 + the auto-grow effect above keep it looking
                like a heading while letting the text fold onto more lines.
                Enter commits (blur-saves) instead of inserting a newline —
                titles are one logical line that merely wraps visually. */}
            <textarea
              ref={titleRef}
              rows={1}
              value={title}
              onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                if (title.trim() && title.trim() !== task.title) {
                  void onSavePatch({ title: title.trim() });
                }
              }}
              aria-label="Title"
              placeholder="Activity title"
              className="motion-focus min-w-0 flex-1 resize-none overflow-hidden border-b border-transparent bg-transparent pb-1 font-display text-xl font-semibold leading-snug text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-stroke-strong sm:text-2xl"
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

            {/* The visible row label lives here; the combobox keeps its own
                sr-only "Assignee" label for the input's accessible name. */}
            <div className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Assignee</span>
              <div className="md:max-w-[300px]">
                <TaskMemberSelect
                  density="compact"
                  members={members}
                  selectedMember={selectedAssignee}
                  isLoading={isLoadingMembers}
                  onSelectMember={(member) => {
                    setSelectedAssignee(member);
                    void onSavePatch({ assignedToUserId: member?.userId || null });
                  }}
                />
              </div>
            </div>

            {/* Invite a teammate directly from this task, without leaving
                for Settings. Same result the moment you'd get there: a
                link the teammate opens to choose their own password —
                see the Team logins Working note in CLAUDE.md. */}
            <div className={PROPERTY_ROW_CLASS}>
              <span className={PROPERTY_LABEL_CLASS}>Invite</span>
              <div className="md:max-w-[300px]">
                {inviteUrl ? (
                  <div className="space-y-2 rounded-[14px] border border-stroke-default bg-bg-elevated/60 p-3">
                    <p className="text-xs text-content-secondary">{inviteMessage}</p>
                    <ShareLoginActions
                      url={inviteUrl}
                      releaseTitle={releaseTitle}
                      variant="inline"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setInviteUrl(null);
                        setInviteMessage('');
                      }}
                      className="motion-focus text-[11px] font-medium text-content-tertiary underline-offset-2 hover:text-content-primary hover:underline"
                    >
                      Invite someone else
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleInviteTeammate();
                    }}
                    className="flex items-center gap-2"
                  >
                    <label className="flex-1">
                      <span className="sr-only">Teammate&apos;s email</span>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="teammate@email.com"
                        className={PROPERTY_CONTROL_CLASS.replace('md:max-w-[300px]', '')}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isInviting || !inviteEmail.trim()}
                      className="motion-focus motion-press h-9 shrink-0 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isInviting ? 'Inviting…' : 'Invite'}
                    </button>
                  </form>
                )}
                {inviteError ? (
                  <p role="alert" className="mt-1 text-xs text-status-error">
                    {inviteError}
                  </p>
                ) : !inviteUrl && inviteMessage ? (
                  <p className="mt-1 text-xs text-content-secondary">{inviteMessage}</p>
                ) : null}
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

          {/* How the last completion went, captured by the check-in sheet.
              Read-only and kept even after a reopen: it is the record of
              that completion, not a live property of the task. */}
          {TASK_OUTCOMES_ENABLED && task.outcome ? (
            <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
              <h3 className="text-sm font-semibold text-content-primary">Outcome</h3>
              <p className="mt-2 text-sm font-semibold text-content-primary">
                {TASK_OUTCOME_LABELS[task.outcome.outcome]}
              </p>
              <p className="mt-1 text-sm text-content-secondary">{task.outcome.summary}</p>
              {task.outcome.note ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-content-secondary">{task.outcome.note}</p>
              ) : null}
              {task.outcome.aiFollowupQuestion && task.outcome.aiFollowupAnswer ? (
                <div className="mt-3 border-t border-stroke-subtle pt-3">
                  <p className="text-sm font-medium text-content-primary">{task.outcome.aiFollowupQuestion}</p>
                  <p className="mt-1 text-sm text-content-secondary">{task.outcome.aiFollowupAnswer}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {TASK_ATTACHMENTS_ENABLED ? (
            <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-content-primary">Attachments</h3>
                  <p className="mt-1 text-xs text-content-secondary">Upload files for briefs, decks, or assets.</p>
                </div>
                <label className="inline-flex min-h-10 items-center rounded-[16px] bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover">
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
          ) : null}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Delete this activity? This cannot be undone.')) {
                  void onDeleteTask();
                }
              }}
              className="rounded-[16px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm font-semibold text-status-error"
            >
              Delete activity
            </button>
          </div>
        </div>
      ) : isLoading ? (
        // Mirrors the loaded pop-up's real layout — checkbox+title row, the
        // three property rows (Status / Assignee / Due date), then the
        // description block — so content lands where the skeleton stood
        // instead of reflowing (same convention as the page skeletons).
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 shrink-0 rounded-full skeleton-shimmer" />
            <div className="h-7 w-2/3 skeleton-shimmer" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`task-prop-${index}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3">
                <div className="h-3 w-16 skeleton-shimmer" />
                <div className="h-9 w-full max-w-[300px] skeleton-shimmer" />
              </div>
            ))}
          </div>
          <div className="h-[120px] rounded-[18px] skeleton-shimmer" />
        </div>
      ) : (
        <p className="text-sm text-content-secondary">Select an activity to inspect the full context.</p>
      )}
    </section>
  );
}
