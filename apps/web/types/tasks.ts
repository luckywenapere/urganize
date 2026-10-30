import { ReleasePipelineState } from './releases';
import { WorkspaceMember } from './auth';

export type TaskViewMode = 'kanban' | 'list';
export type TaskSortKey = 'due_date' | 'priority' | 'assignee' | 'status' | 'created_at';
/**
 * Activity groups in the workspace panel. Two families in one union:
 *
 *  - STATUS groups (in_progress, blocked, in_review, backlog, locked, done,
 *    cancelled) — one per TaskStatus except 'todo'.
 *  - TIME groups (overdue, catch_up, today, week, upcoming, no_due_date) —
 *    where a 'todo' activity lands, by due date.
 *
 * Status wins (founder call, 2026-08-15): an activity carries exactly one
 * group, and anything that isn't 'todo' is grouped by what state it's in
 * rather than when it's due. 'done' already worked this way; the other six
 * statuses joined it. See getTaskSectionKey.
 */
export type TaskSectionKey =
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'overdue'
  | 'catch_up'
  | 'today'
  | 'week'
  | 'upcoming'
  | 'no_due_date'
  | 'backlog'
  | 'locked'
  | 'done'
  | 'cancelled';
export type TaskCreateSource = 'quick_create' | 'inline' | 'detail_panel' | 'onboarding' | 'note';
export type TaskRequirementType = 'file_upload' | 'field_completion' | 'approval' | 'external_action';

export interface TaskNotification {
  id: string;
  userId: string;
  type: string; // or NotificationType if I want to be specific
  taskId: string;
  actorId: string | null;
  read: boolean;
  createdAt: string;
  taskTitle: string;
  actorName: string;
  taskStatus: TaskStatus;
  /** Release the task belongs to (null for workspace-level tasks). Used by the
   * notifications bell to switch the workspace's URL scope before opening the
   * task drawer, so the user lands in the right release context. */
  taskReleaseId: string | null;
  /** Release title and day, set for the Spotify pitch reminders so the bell can
   *  say which release and count down from today. Absent for other types. */
  taskReleaseTitle?: string | null;
  taskReleaseDate?: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  authorEmail: string | null;
  authorInitials: string;
  isOwnComment: boolean;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  userId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export interface TaskActivityEntry {
  id: string;
  taskId: string;
  actorId: string | null;
  actorName: string;
  message: string;
  createdAt: string;
}

export interface TaskGroup {
  id: string;
  workspaceId: string;
  releaseId: string | null;
  name: string;
  position: number;
  taskCount: number;
  createdAt: string;
}

export interface TaskContextLink {
  folderItemId: string | null;
  trackId: string | null;
}

export const TASK_STATUS_OPTIONS = [
  'locked',
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number];

/**
 * The one rule for "this task is closed" (#883). Done and cancelled are the
 * only closed statuses; every other status (blocked and in review included)
 * is still owed. Once a task is closed anywhere, nothing lists it as open or
 * late, and nothing in the app reopens it on its own: only a person does.
 */
export const CLOSED_TASK_STATUSES = ['done', 'cancelled'] as const satisfies readonly TaskStatus[];

export function isTaskClosed(status: unknown): boolean {
  const value = String(status ?? '').trim().toLowerCase();
  return (CLOSED_TASK_STATUSES as readonly string[]).includes(value);
}

export const TASK_PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low', 'none'] as const;

export type TaskPriority = (typeof TASK_PRIORITY_OPTIONS)[number];

export interface TaskRequirement {
  type: 'file_upload' | 'field_completion' | 'approval' | 'external_action';
  spec: string;
  satisfied: boolean;
}

/**
 * The three phases a rollout's work is grouped under (URG-292): everything
 * before the release week, the release week itself, and everything after.
 * Stored per task at `metadata.phase`; a task with nothing stored takes its
 * phase from its date relative to release day. See lib/rollout-phases.ts.
 *
 * Pre-production (URG-280, 2026-10-16) comes first: making the song and the
 * video (sessions, mix, master, artwork, shoot, final MP4). It is only ever a
 * stored phase, never derived from a date, and it only shows when it has work.
 */
export const ROLLOUT_PHASE_OPTIONS = ['pre_production', 'pre_release', 'release', 'post_release'] as const;

export type RolloutPhase = (typeof ROLLOUT_PHASE_OPTIONS)[number];

export interface TaskReleaseSummary {
  id: string;
  title: string;
  artistName: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  groupId: string | null;
  releaseId: string | null;
  createdBy: string;
  assignedToUserId: string | null;
  assignedTo: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
  requirement: TaskRequirement | null;
  dependencies: string[];
  state: ReleasePipelineState;
  autoGenerated: boolean;
  /** Template classification: a work item ('task') or a dated point on the
   * timeline ('event_milestone'). Sourced from metadata.template.task_type;
   * defaults to 'task' for rows that predate the template flow. */
  taskType: 'task' | 'event_milestone';
  /** The playbook step this task came from (e.g. 'w5_cover_art_final_approved'),
   * from metadata.template.task_id. Null for a manager-added or planner-added
   * activity, which has no template origin.
   *
   * The one other piece of metadata.template surfaced to the client, alongside
   * taskType and compressedRunway: completing a task needs to know WHICH
   * playbook step it was, so the right follow-up can be offered (see
   * lib/cover-art-tasks.ts). */
  templateTaskId: string | null;
  /** How many days the playbook expects this activity to run, from
   * metadata.template.duration_days. Null for anything the playbooks did not
   * generate — a manager-added or planner-added activity — and for rows that
   * predate the template flow.
   *
   * Read with `dueDate` as the START of the run, not the deadline: the
   * playbooks put multi-day work at the offset where it BEGINS ("Begin curator
   * outreach", offset -42, "ongoing across the week"). See lib/release-timeline.ts.
   *
   * Almost always 1 — across all three playbooks only ~11% of activities run
   * longer, and every one of those is exactly 7 days. */
  durationDays: number | null;
  /** True when this task was generated by a template against a release whose
   * date was sooner than the template's lead time, so the computed due_date
   * landed in the past at the moment of release creation. These are
   * "Catch up / Start here" tasks — a compressed timeline, not slippage.
   * Sourced from metadata.template.compressed_runway; defaults to false for
   * rows that predate this flag (legacy template tasks fall through to the
   * normal overdue treatment when past-due). */
  compressedRunway: boolean;
  /** Planner v2 (2026-10-26): an undated plan task's timing relative to
   *  release ("Now", "4 weeks before", "Release week", "After release").
   *  Null or absent once the task has a due date. */
  relativeWhen?: string | null;
  /** Lightweight single-tag label stored directly on the task row (no
   * tag table). Picker offers presets in GROUP_PRESETS or a custom name.
   * Distinct from `groupId` / `group` which point at the legacy task_groups
   * table used by the release-detail board layout. */
  groupName: string | null;
  /** Hex color paired with groupName. Presets pin a fixed color; customs get
   * DEFAULT_GROUP_COLOR. Null whenever groupName is null. */
  groupColor: string | null;
  /** Whether this task is on the rollout's short main list (URG-258), from
   * metadata.planner.key. true: UrgAns marked it key when the plan was built,
   * or a person pinned it. false: generated and tucked behind "Show all"
   * unless the top-up rule in lib/plan-focus.ts brings it forward. null or
   * absent: a plan from before the flag existed, which lib/plan-focus.ts
   * shortens by its own rule. Optional so every existing literal compiles. */
  planKey?: boolean | null;
  /** In a smaller plan (URG-318): its core or a suggestion someone added, from
   *  metadata.planner.core / .suggested. Absent/false on older plans. */
  planCore?: boolean;
  /** The rollout phase set on this task (URG-292), from metadata.phase.
   * Templates and approved plans write it; a person can change it in the task
   * detail. null or absent: nothing stored, so the phase follows the task's
   * date relative to release day (lib/rollout-phases.ts resolveTaskPhase).
   * Optional so every existing literal compiles. */
  phase?: RolloutPhase | null;
  createdAt: string;
  updatedAt: string;

  // Relations (optional)
  release?: TaskReleaseSummary | null;
  group?: TaskGroup | null;
  assignee?: WorkspaceMember | null;
  context?: TaskContextLink;
  commentCount?: number;
  attachmentCount?: number;

  /** True for a task created offline that hasn't reached the server yet
   * (lib/offline/queue.ts). Its id is a local placeholder, not a real row
   * id — nothing should PATCH or complete it until the queue replays it
   * and this flag (along with the id) is replaced by the server's real
   * row. Undefined/absent for every ordinary task. */
  pendingSync?: boolean;
}

export const TASK_OUTCOME_RATINGS = ['went_well', 'went_okay', 'not_to_plan'] as const;

export type TaskOutcomeRating = (typeof TASK_OUTCOME_RATINGS)[number];

/** One row per task: how the last completion went, per the person who
 * completed it. Re-completing a task replaces its outcome. */
export interface TaskOutcome {
  id: string;
  taskId: string;
  releaseId: string;
  outcome: TaskOutcomeRating;
  note: string | null;
  /** Always present: AI-written when a note exists, template-built otherwise,
   * so recap consumers never need to re-summarize. */
  summary: string;
  aiFollowupQuestion: string | null;
  aiFollowupAnswer: string | null;
  createdBy: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
  /** Whether the CURRENT viewer may post/edit/delete in this task's thread
   * (see hasTaskThreadAccess in lib/tasks-server.ts) — narrower than general
   * task visibility. `comments` is already empty when this is false, so the
   * UI never has to duplicate the access rule to decide whether to render a
   * composer: it just reads this flag. */
  canComment: boolean;
  attachments: TaskAttachment[];
  activity: TaskActivityEntry[];
  outcome: TaskOutcome | null;
}
