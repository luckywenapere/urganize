'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Trash2,
  UserCircle2,
  X,
} from '@/components/icons';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { TaskMemberSelect } from '@/components/tasks/TaskMemberSelect';
import { EditorialPitchPanel } from '@/components/tasks/EditorialPitchPanel';
import { isEditorialPitchTask } from '@/lib/editorial-pitch';
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
  isEventMilestone,
  isTypingTarget,
  TASK_STATUS_OPTIONS,
  type TaskDetail,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import { TASK_OUTCOME_LABELS } from '@/lib/task-outcomes';
import { buildTaskDetailSubtitle } from '@/lib/task-detail-summary';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';
import { ThreadMessageList } from '@/components/threads/ThreadMessageList';
import { ThreadComposer } from '@/components/threads/ThreadComposer';
import type { ThreadMessage } from '@/types/thread';

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

// Bare icon + value rows (2026-09-05, founder call: emulate Google Calendar's
// event pop-up). This replaced a labelled two-column grid whose 6.5rem label
// column read Status / Assignee / Due date. The icon now carries what the label
// used to say, which buys back real width on a phone.
//
// The controls stay inline-editable and keep autosaving — only their CHROME
// went. A read-only view with a pencil that opens an editor was offered and
// rejected: it costs a click on every edit, and the noise was coming from the
// labels and boxes, not from the fields being live.
//
// `group` is load-bearing: each row's chevron, and the date input's own picker
// indicator, are invisible at rest and revealed by group-hover/focus-within, so
// a row reads as plain text until you approach it.
const DETAIL_ROW_CLASS = 'group flex items-center gap-3';
const DETAIL_ICON_CLASS = 'h-4 w-4 shrink-0 text-content-tertiary';
// The control column: capped so the hover box does not span the whole modal.
const DETAIL_FIELD_CLASS = 'min-w-0 flex-1 sm:max-w-[320px]';
// appearance-none is what lets a native <select> read as plain text — without
// it the OS arrow shows at rest and no amount of border removal helps.
//
// The old class hardcoded [color-scheme:dark], which forced a dark native popup
// onto a cream page in light mode. globals.css already sets color-scheme per
// theme, so dropping it is the fix. (AssetUploadControl keeps that hardcode
// deliberately for a boxed dark control; this is not that.)
const PROPERTY_CONTROL_CLASS =
  'motion-focus h-9 w-full appearance-none rounded-lg border border-transparent bg-transparent px-2 text-sm text-content-primary transition-colors hover:border-stroke-default hover:bg-bg-elevated focus:border-brand focus:bg-bg-elevated';

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
  onSendComment: (content: string) => Promise<void>;
  onEditComment: (commentId: string, content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
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
 * Title, Status, Assignee, Due date, Dependencies, Notes, Attachments,
 * Delete. `onBack` closes the modal (the header X + Escape).
 *
 * (Comments were cut from this view on 2026-07-23; this line claimed otherwise
 * until 2026-09-05.)
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
  onSendComment,
  onEditComment,
  onDeleteComment,
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
  // The invite form is collapsed behind a link in the assignee menu's footer,
  // so the resting menu is a clean list of people.
  const [inviteOpen, setInviteOpen] = useState(false);
  // Notes stay collapsed until they have content or the user asks for them.
  const [notesOpen, setNotesOpen] = useState(false);

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
    // Collapse both disclosures too, or the next activity opens with the
    // previous one's invite form expanded and its notes field already open.
    setInviteOpen(false);
    setNotesOpen(false);
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
        setInviteMessage('Invite link created. Share it with your teammate.');
      } else {
        setInviteMessage('Already on this team.');
      }
    } catch (err) {
      setInviteError(errorMessage(err, 'Could not invite teammate.'));
    } finally {
      setIsInviting(false);
    }
  };

  const due = task ? getRelativeDueLabel(task) : { label: 'No due date', isOverdue: false };

  const subtitleSegments = task
    ? buildTaskDetailSubtitle({
        statusLabel: getTaskStatusLabel(task.status),
        isEventMilestone: isEventMilestone(task),
        releaseTitle,
        dueLabel: due.label,
        isOverdue: due.isOverdue,
      })
    : [];

  // Invite a teammate without leaving for Settings. Same result you would get
  // there: a link the teammate opens to choose their own password — see the
  // Team logins Working note in CLAUDE.md.
  //
  // Since 2026-09-05 this renders inside the assignee menu rather than as a
  // permanent row in the body. The moment you want someone who is not on the
  // list is the moment you are looking at the list, and a form that is only
  // occasionally wanted should not hold a line of the pop-up at all times.
  const inviteFooter = (
    <div className="p-2">
      {inviteUrl ? (
        <div className="space-y-2 p-1">
          <p className="text-xs text-content-secondary">{inviteMessage}</p>
          <ShareLoginActions url={inviteUrl} releaseTitle={releaseTitle} variant="inline" />
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
      ) : inviteOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleInviteTeammate();
          }}
          className="flex items-center gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Teammate&apos;s email</span>
            <input
              type="email"
              autoFocus
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@email.com"
              className="motion-focus h-9 w-full rounded-lg border border-stroke-control bg-bg-elevated px-2 text-sm text-content-primary transition-colors focus:border-brand"
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
      ) : (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="motion-focus flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-stroke-default text-content-tertiary">
            +
          </span>
          Invite someone new…
        </button>
      )}
      {inviteError ? (
        <p role="alert" className="mt-1 px-1 text-xs text-status-error">
          {inviteError}
        </p>
      ) : !inviteUrl && inviteMessage ? (
        <p className="mt-1 px-1 text-xs text-content-secondary">{inviteMessage}</p>
      ) : null}
    </div>
  );

  return (
    <section aria-label="Activity detail" className="min-w-0">
      {/* Icon-only action bar (2026-09-05, founder call: emulate Google
          Calendar's event pop-up). Delete moved up here from a full-width red
          button at the bottom — it keeps its confirm, it just stopped being
          the loudest thing on screen. The status / release / due facts that
          used to sit here moved BELOW the title, so the pop-up now leads with
          the name of the thing rather than with its metadata. */}
      <div className="mb-3 flex items-center justify-end gap-1">
        {task ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this activity? This cannot be undone.')) {
                void onDeleteTask();
              }
            }}
            aria-label="Delete activity"
            title="Delete activity"
            className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-content-tertiary transition-colors hover:bg-status-error/10 hover:text-status-error"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onBack}
          aria-label="Close activity"
          title="Close"
          className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-content-tertiary transition-colors hover:border-stroke-default hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error && !task ? (
        <div role="alert" className="rounded-[24px] border border-status-error/30 bg-status-error/10 px-4 py-4 text-sm text-status-error">
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
          {/* Title and subtitle are ONE child of the space-y-6 stack: as
              siblings the stack would put 24px between a heading and its own
              subtitle. */}
          <div>
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

            {/* One quiet line under the title, holding the facts that used to
                sit as pills ABOVE it. pl-9 lines it up with the title text, past
                the completion circle (h-6 + gap-3). */}
            {subtitleSegments.length > 0 ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 pl-9 text-sm text-content-secondary">
                {subtitleSegments.map((segment, index) => (
                  <Fragment key={`${segment.text}-${index}`}>
                    {index > 0 ? (
                      <span aria-hidden="true" className="text-content-quaternary">
                        ·
                      </span>
                    ) : null}
                    <span
                      className={
                        segment.tone === 'overdue' ? 'font-semibold text-status-error' : undefined
                      }
                    >
                      {segment.text}
                    </span>
                  </Fragment>
                ))}
              </p>
            ) : null}
          </div>

          <div className="space-y-0.5">
            <label className={DETAIL_ROW_CLASS}>
              <CircleDot className={DETAIL_ICON_CLASS} aria-hidden="true" />
              <span className="sr-only">Status</span>
              <span className={`relative ${DETAIL_FIELD_CLASS}`}>
                <select
                  value={task.status}
                  onChange={(event) => void onSavePatch({ status: event.target.value as TaskStatus })}
                  className={`${PROPERTY_CONTROL_CLASS} pr-8`}
                >
                  {TASK_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status} className="bg-bg-elevated text-content-primary">
                      {getTaskStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true" />
              </span>
            </label>
            {statusBlockerMessage ? (
              <p
                role="alert"
                className="ml-7 rounded-lg border border-status-warning/35 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
              >
                {statusBlockerMessage}
              </p>
            ) : null}

            {/* The icon is the label now; the picker keeps its own aria-label
                for the trigger's accessible name. Its menu carries the invite
                form in a footer — see inviteFooter above. */}
            <div className={DETAIL_ROW_CLASS}>
              <UserCircle2 className={DETAIL_ICON_CLASS} aria-hidden="true" />
              <div className={DETAIL_FIELD_CLASS}>
                <TaskMemberSelect
                  density="compact"
                  members={members}
                  selectedMember={selectedAssignee}
                  isLoading={isLoadingMembers}
                  onSelectMember={(member) => {
                    setSelectedAssignee(member);
                    void onSavePatch({ assignedToUserId: member?.userId || null });
                  }}
                  footer={inviteFooter}
                />
              </div>
            </div>

            {/* The date input hides its own picker indicator until the row is
                approached, so the value reads as plain text at rest. */}
            <label className={DETAIL_ROW_CLASS}>
              <CalendarDays className={DETAIL_ICON_CLASS} aria-hidden="true" />
              <span className="sr-only">Due date</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(task.dueDate)}
                onChange={(event) => void onSavePatch({ dueDate: event.target.value || null })}
                className={`${PROPERTY_CONTROL_CLASS} ${DETAIL_FIELD_CLASS} [&::-webkit-calendar-picker-indicator]:opacity-0 group-hover:[&::-webkit-calendar-picker-indicator]:opacity-100 group-focus-within:[&::-webkit-calendar-picker-indicator]:opacity-100`}
              />
            </label>
          </div>

          <TaskDependenciesSection
            dependencyIds={task.dependencies}
            prerequisites={prerequisites}
            onOpenPrerequisite={onOpenPrerequisite}
          />

          {/* The Spotify editorial pitch's form fields (2026-10-09). Only on that
              one task, between what it waits on and the free-text notes. */}
          {isEditorialPitchTask(task.templateTaskId) ? (
            <EditorialPitchPanel key={task.id} taskId={task.id} releaseId={task.releaseId ?? null} />
          ) : null}

          {/* Notes stay out of the way until they exist (2026-09-05). This was
              a 120px box that rendered even when empty, which is most of the
              time; Depends-on already hid itself when empty and this now
              matches. autoFocus is keyed on notesOpen so it fires only when the
              user asked for the field, never on an activity that already has
              notes. */}
          {notesOpen || description ? (
            <label className="flex gap-3">
              <AlignLeft className={`${DETAIL_ICON_CLASS} mt-2.5`} aria-hidden="true" />
              <span className="sr-only">Notes</span>
              <textarea
                autoFocus={notesOpen}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => {
                  if ((task.description || '') !== description) {
                    void onSavePatch({ description: description || null });
                  }
                }}
                className="motion-focus min-h-[76px] w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm leading-relaxed text-content-primary transition-colors placeholder:text-content-tertiary hover:border-stroke-default focus:border-brand focus:bg-bg-elevated"
                placeholder="Add notes, context, links, or markdown-style bullets."
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="motion-focus flex w-full items-center gap-3 rounded-lg py-1.5 text-left text-sm text-content-tertiary transition-colors hover:text-content-primary"
            >
              <AlignLeft className={DETAIL_ICON_CLASS} aria-hidden="true" />
              Add notes
            </button>
          )}

          {/* The task's chat thread (Release & Task Chat, Phase 1). Scoped to
              the assignee, the creator, and workspace owners/admins by
              default — narrower than general task visibility, see
              hasTaskThreadAccess in lib/tasks-server.ts. task.canComment is
              the server's own answer to that check, so this never has to
              re-derive it client-side; a viewer without thread access simply
              sees no composer here (comments always arrive empty for them
              too, so the section still renders, just with nothing to post
              into). */}
          <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
            <h3 className="text-sm font-semibold text-content-primary">Chat</h3>
            <div className="mt-3">
              <ThreadMessageList
                messages={task.comments.map(
                  (comment): ThreadMessage => ({
                    id: comment.id,
                    userId: comment.userId,
                    content: comment.content,
                    createdAt: comment.createdAt,
                    editedAt: comment.editedAt,
                    authorName: comment.authorName,
                    authorEmail: comment.authorEmail,
                    authorInitials: comment.authorInitials,
                    isOwnMessage: comment.isOwnComment,
                  })
                )}
                isLoading={false}
                loadError=""
                onRetry={() => {}}
                onEdit={onEditComment}
                onDelete={onDeleteComment}
                emptyTitle="No messages yet."
                emptyBody={
                  task.canComment
                    ? 'Coordinate on this activity right here.'
                    : 'Only the assignee and your team’s managers can post here.'
                }
              />
            </div>
            {task.canComment ? (
              <ThreadComposer onSend={onSendComment} placeholder="Message about this activity…" />
            ) : null}
          </section>

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
                          // blank inside the app webview — hand it to the
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

          {/* Delete moved into the header icon bar on 2026-09-05. */}
        </div>
      ) : isLoading ? (
        // Mirrors the loaded pop-up's real layout — checkbox+title row, the
        // subtitle line, three icon rows, then the notes affordance — so
        // content lands where the skeleton stood instead of reflowing (same
        // convention as the page skeletons).
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 shrink-0 rounded-full skeleton-shimmer" />
            <div className="h-7 w-2/3 skeleton-shimmer" />
          </div>
          <div className="ml-9 h-4 w-1/2 skeleton-shimmer" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`task-prop-${index}`} className="flex items-center gap-3">
                <div className="h-4 w-4 shrink-0 rounded skeleton-shimmer" />
                <div className="h-6 w-full max-w-[220px] skeleton-shimmer" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 shrink-0 rounded skeleton-shimmer" />
            <div className="h-5 w-24 skeleton-shimmer" />
          </div>
        </div>
      ) : (
        <p className="text-sm text-content-secondary">Select an activity to inspect the full context.</p>
      )}
    </section>
  );
}
