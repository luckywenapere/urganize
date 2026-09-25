import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import {
  DEFAULT_RELEASE_TASK_GROUPS,
  getInitials,
  type NotificationType,
  type ReleaseTasksResponse,
  type Task,
  type TaskActivityEntry,
  type TaskAttachment,
  type TaskComment,
  type TaskContextLink,
  type TaskDetail,
  type TaskFilters,
  type TaskGroup,
  type TaskNotification,
  type TaskPriority,
  type TaskRequirement,
  type TaskReleaseSummary,
  type TaskSortKey,
  type TaskStatus,
  type ReleasePipelineState,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceMemberRole,
  type WorkspaceMembersResponse,
} from '@/lib/tasks';
import { sendPushToUsers, type PushPayload } from '@/lib/push-server';
import { mapTaskOutcomeRow, type TaskOutcome } from '@/lib/task-outcomes';
import { assignDueTier, type DueTier } from '@/lib/due-tiers';
import { getNotificationPresets } from '@/lib/notification-presets-server';
import type { NotificationPresets } from '@/lib/notification-presets';
import { TEAM_TRIAL_DAYS, isHardPaywallEnabled } from '@/lib/team-billing';
import { logBillingEvent } from '@/lib/billing-events-server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/email/links';
import {
  formatDueDateForEmail,
  noteExcerptForEmail,
  priorityLabelForEmail,
} from '@/lib/email/format';
import { claimPendingWorkspaceInvite } from '@/lib/invite-claims-server';

export const WORKSPACES_TABLE = 'workspaces';
export const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
export const TASK_GROUPS_TABLE = 'task_groups';
export const TASKS_TABLE = 'tasks';
export const TASK_COMMENTS_TABLE = 'task_comments';
export const TASK_ATTACHMENTS_TABLE = 'task_attachments';
export const TASK_ACTIVITY_TABLE = 'task_activity';
export const TASK_OUTCOMES_TABLE = 'task_outcomes';
export const NOTIFICATIONS_TABLE = 'notifications';
export const ORGANIZATIONS_TABLE = 'organizations';
export const ORGANIZATION_MEMBERS_TABLE = 'organization_members';
export const PROFILES_TABLE = 'profiles';
export const RELEASES_TABLE = 'releases';
export const TASK_ATTACHMENTS_BUCKET = 'task-attachments';
const TASK_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const TASKS_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  "do $$ begin",
  "  create type public.workspace_member_role as enum ('owner', 'admin', 'member', 'guest');",
  'exception when duplicate_object then null;',
  'end $$;',
  '',
  "do $$ begin",
  "  create type public.workspace_member_status as enum ('active', 'invited', 'removed');",
  'exception when duplicate_object then null;',
  'end $$;',
  '',
  "do $$ begin",
  "  create type public.task_status as enum ('locked', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');",
  'exception when duplicate_object then null;',
  'end $$;',
  "alter type public.task_status add value if not exists 'locked';",
  '',
  "do $$ begin",
  "  create type public.task_priority as enum ('urgent', 'high', 'medium', 'low', 'none');",
  'exception when duplicate_object then null;',
  'end $$;',
  '',
  "do $$ begin",
  "  create type public.notification_type as enum ('task_assigned', 'task_commented', 'task_due_soon', 'task_overdue', 'task_status_changed');",
  'exception when duplicate_object then null;',
  'end $$;',
  '',
  'create table if not exists public.workspaces (',
  '  id uuid primary key default gen_random_uuid(),',
  '  owner_id uuid not null references auth.users(id) on delete cascade,',
  '  name text not null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create unique index if not exists workspaces_owner_id_unique_idx on public.workspaces(owner_id);',
  '',
  'create table if not exists public.workspace_members (',
  '  id uuid primary key default gen_random_uuid(),',
  '  workspace_id uuid not null references public.workspaces(id) on delete cascade,',
  '  user_id uuid null references auth.users(id) on delete set null,',
  '  email text not null,',
  '  role public.workspace_member_role not null default \'member\',',
  '  status public.workspace_member_status not null default \'invited\',',
  '  invited_at timestamptz not null default now(),',
  '  joined_at timestamptz null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create unique index if not exists workspace_members_workspace_email_unique_idx on public.workspace_members(workspace_id, email);',
  'create unique index if not exists workspace_members_workspace_user_unique_idx on public.workspace_members(workspace_id, user_id) where user_id is not null;',
  '',
  'create table if not exists public.task_groups (',
  '  id uuid primary key default gen_random_uuid(),',
  '  workspace_id uuid not null references public.workspaces(id) on delete cascade,',
  '  release_id uuid null references public.releases(id) on delete cascade,',
  '  name text not null,',
  '  position integer not null default 0,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists task_groups_workspace_release_idx on public.task_groups(workspace_id, release_id, position);',
  '',
  'create table if not exists public.tasks (',
  '  id uuid primary key default gen_random_uuid(),',
  '  workspace_id uuid not null references public.workspaces(id) on delete cascade,',
  '  group_id uuid null references public.task_groups(id) on delete set null,',
  '  release_id uuid null references public.releases(id) on delete set null,',
  '  created_by uuid not null references auth.users(id) on delete cascade,',
  '  assigned_to_user_id uuid null references auth.users(id) on delete set null,',
  '  assigned_to uuid null references public.workspace_members(id) on delete set null,',
  '  title text not null,',
  '  description text null,',
  '  status public.task_status not null default \'todo\',',
  '  priority public.task_priority not null default \'none\',',
  '  due_date timestamptz null,',
  '  completed_at timestamptz null,',
  '  position integer not null default 0,',
  '  requirement jsonb null,',
  "  dependencies uuid[] not null default '{}'::uuid[],",
  "  state text not null default 'idea',",
  '  auto_generated boolean not null default false,',
  "  metadata jsonb not null default '{}'::jsonb,",
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists tasks_workspace_idx on public.tasks(workspace_id, updated_at desc);',
  'create index if not exists tasks_release_group_idx on public.tasks(release_id, group_id, position);',
  'create index if not exists tasks_release_state_idx on public.tasks(release_id, state, status);',
  'create index if not exists tasks_assigned_to_user_idx on public.tasks(assigned_to_user_id, due_date);',
  'create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to, due_date);',
  '',
  'create table if not exists public.task_comments (',
  '  id uuid primary key default gen_random_uuid(),',
  '  task_id uuid not null references public.tasks(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  content text not null,',
  '  created_at timestamptz not null default now(),',
  '  edited_at timestamptz null',
  ');',
  '',
  'create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);',
  '',
  'create table if not exists public.task_attachments (',
  '  id uuid primary key default gen_random_uuid(),',
  '  task_id uuid not null references public.tasks(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  file_url text not null,',
  '  file_name text not null,',
  '  file_size integer not null default 0,',
  '  storage_path text null,',
  '  created_at timestamptz not null default now()',
  ');',
  '',
  'create table if not exists public.task_activity (',
  '  id uuid primary key default gen_random_uuid(),',
  '  task_id uuid not null references public.tasks(id) on delete cascade,',
  '  actor_id uuid null references auth.users(id) on delete set null,',
  '  message text not null,',
  "  metadata jsonb not null default '{}'::jsonb,",
  '  created_at timestamptz not null default now()',
  ');',
  '',
  'create table if not exists public.notifications (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  type public.notification_type not null,',
  '  task_id uuid not null references public.tasks(id) on delete cascade,',
  '  actor_id uuid null references auth.users(id) on delete set null,',
  '  read boolean not null default false,',
  '  created_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.workspaces enable row level security;',
  'alter table public.workspace_members enable row level security;',
  'alter table public.task_groups enable row level security;',
  'alter table public.tasks enable row level security;',
  'alter table public.task_comments enable row level security;',
  'alter table public.task_attachments enable row level security;',
  'alter table public.task_activity enable row level security;',
  'alter table public.notifications enable row level security;',
].join('\n');

type DatabaseUser = User;

export type WorkspaceRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  role: WorkspaceMemberRole;
  status: 'active' | 'invited' | 'removed';
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  owner_id: string;
};

type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
};

export type TaskGroupRow = {
  id: string;
  workspace_id: string;
  release_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  workspace_id: string;
  group_id: string | null;
  release_id: string | null;
  created_by: string;
  assigned_to_user_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  requirement?: unknown;
  dependencies?: string[] | null;
  state?: string | null;
  auto_generated?: boolean | null;
  metadata: unknown;
  group_name: string | null;
  group_color: string | null;
  created_at: string;
  updated_at: string;
};

// Canonical column list for tasks selects. Centralizing this avoids the drift
// pattern where one select adds a column (e.g. assigned_to_user_id) and a
// sibling select silently keeps reading without it.
export const TASKS_SELECT_COLUMNS =
  'id,workspace_id,group_id,release_id,created_by,assigned_to_user_id,assigned_to,title,description,status,priority,due_date,completed_at,position,requirement,dependencies,state,auto_generated,metadata,group_name,group_color,created_at,updated_at';

type TaskCommentRow = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
};

type TaskAttachmentRow = {
  id: string;
  task_id: string;
  user_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  storage_path: string | null;
  created_at: string;
};

type TaskActivityRow = {
  id: string;
  task_id: string;
  actor_id: string | null;
  message: string;
  metadata: unknown;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  task_id: string;
  actor_id: string | null;
  read: boolean;
  created_at: string;
};

type ReleaseRow = {
  id: string;
  title: string;
  artist_name: string;
  owner_user_id: string;
};

type WorkspaceAccessContext = {
  memberships: WorkspaceMember[];
  workspaceIds: string[];
  membershipIds: string[];
  primaryWorkspaceId: string | null;
  primaryWorkspace: Workspace | null;
  /** Unique owner ids of EVERY workspace the user belongs to (always
   * includes the user themself). Releases are owned per-user, not
   * per-workspace, so "releases visible to this user" = releases owned by
   * any of these ids — the whole-workspace visibility model (founder
   * decision, 2026-07-23). */
  releaseOwnerIds: string[];
  /** Artist-scoped memberships (founder decision, 2026-07-23): when the
   * caller's membership in an owner's workspace carries artist_scope_id,
   * they only see that owner's releases whose artist_id matches. Keyed by
   * OWNER user id; absent/null = full visibility. Empty pre-migration —
   * the scope column is read tolerantly so nothing breaks before
   * 20260723200000_workspace_members_artist_scope.sql is applied. */
  artistScopeByOwnerId: Record<string, string>;
  /** Same scopes keyed by workspace id — for task/board checks. */
  artistScopeByWorkspaceId: Record<string, string>;
  /** The caller's role in each owner's workspace, keyed by OWNER user id
   * (first-wins on the owner-first membership sort above the primary pick).
   * Missing key = no membership resolved — writers treat that as read-only,
   * the same fail-closed rule as isReadOnlyWorkspaceMember. Consumed by
   * lib/release-access-server.ts's guest gate. */
  memberRoleByOwnerId: Record<string, string>;
};

const TASK_STATUS_SET = new Set<TaskStatus>([
  'locked',
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
]);

const TASK_PRIORITY_SET = new Set<TaskPriority>(['urgent', 'high', 'medium', 'low', 'none']);
const TASK_STATE_SET = new Set<ReleasePipelineState>([
  'idea',
  'planning',
  'asset_prep',
  'distribution',
  'campaign',
  'post_release',
]);

const readString = (value: unknown): string => String(value || '').trim();
const readNullableString = (value: unknown): string | null => {
  const normalized = readString(value);
  return normalized || null;
};
const normalizeEmail = (value: unknown): string => readString(value).toLowerCase();
const normalizeTaskStatus = (value: unknown): TaskStatus => {
  const normalized = readString(value) as TaskStatus;
  return TASK_STATUS_SET.has(normalized) ? normalized : 'todo';
};
const normalizeTaskPriority = (value: unknown): TaskPriority => {
  const normalized = readString(value) as TaskPriority;
  return TASK_PRIORITY_SET.has(normalized) ? normalized : 'none';
};
const normalizeTaskContext = (value: unknown): TaskContextLink => {
  if (!value || typeof value !== 'object') {
    return { folderItemId: null, trackId: null };
  }

  const record = value as Record<string, unknown>;
  return {
    folderItemId: readNullableString(record.folderItemId),
    trackId: readNullableString(record.trackId),
  };
};

// Reads the template classification out of metadata.template.task_type.
// Defaults to 'task' for rows that predate the template flow (or any row whose
// metadata doesn't carry the marker).
export const readTaskType = (metadata: unknown): 'task' | 'event_milestone' => {
  if (metadata && typeof metadata === 'object') {
    const template = (metadata as { template?: unknown }).template;
    if (template && typeof template === 'object') {
      if ((template as { task_type?: unknown }).task_type === 'event_milestone') {
        return 'event_milestone';
      }
    }
  }
  return 'task';
};

// Reads the playbook task id out of metadata.template.task_id.
// Null for a manager-added or planner-added activity, which has no template
// origin to name. Surfaced to the client (unlike the rest of metadata.template)
// so a completion can tell WHICH playbook step was just ticked — see
// lib/cover-art-tasks.ts, which uses it to decide whether to ask for the
// cover art file.
//
// BUG FIXED 2026-09-03: both writers (instantiate.ts,
// release-planning-server.ts) have always stored this under `task_id`, but
// this reader looked for `template_task_id` — a key nothing ever wrote — so
// the field has resolved to null on every activity in the product since it
// was added. Fixed here because the past-release owner heuristic
// (lib/task-owners.ts) depends on reading it correctly; `template_task_id` is
// still accepted defensively in case any row was ever written under that
// name by a since-removed code path. See the Timeline and cover-art sections
// of CLAUDE.md for the consequences this had while it was broken.
export const readTemplateTaskId = (metadata: unknown): string | null => {
  if (metadata && typeof metadata === 'object') {
    const template = (metadata as { template?: unknown }).template;
    if (template && typeof template === 'object') {
      const record = template as { task_id?: unknown; template_task_id?: unknown };
      const id = record.task_id ?? record.template_task_id;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  return null;
};

// Reads the playbook's expected duration out of metadata.template.duration_days.
//
// Null for anything without one: a manager-added or planner-added activity
// (which by design gets only task_type and compressed_runway — see
// buildTaskMetadata in lib/release-planning-server.ts), or a row that predates
// the template flow. Null means "we do not know how long this takes", which the
// timeline renders as a single-day marker rather than inventing a span. A wrong
// bar is worse than an honest dot.
//
// The fourth piece of metadata.template surfaced to the client, alongside
// taskType, templateTaskId and compressedRunway. It exists so the timeline can
// draw a real bar for the ~11% of playbook activities that genuinely run over
// several days, without a schema change: the number has been on every
// template-generated row since instantiation was written.
export const readDurationDays = (metadata: unknown): number | null => {
  if (metadata && typeof metadata === 'object') {
    const template = (metadata as { template?: unknown }).template;
    if (template && typeof template === 'object') {
      const raw = (template as { duration_days?: unknown }).duration_days;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
        return Math.floor(raw);
      }
    }
  }
  return null;
};

// Reads the compressed-runway flag out of metadata.template.compressed_runway.
// Defaults to false for rows that predate this flag — legacy template tasks
// that are past-due fall through to the standard overdue treatment rather
// than being silently retroactively reclassified as catch-up.
export const readCompressedRunway = (metadata: unknown): boolean => {
  if (metadata && typeof metadata === 'object') {
    const template = (metadata as { template?: unknown }).template;
    if (template && typeof template === 'object') {
      return (template as { compressed_runway?: unknown }).compressed_runway === true;
    }
  }
  return false;
};
const normalizeTaskState = (value: unknown): ReleasePipelineState => {
  const normalized = readString(value) as ReleasePipelineState;
  return TASK_STATE_SET.has(normalized) ? normalized : 'idea';
};
const normalizeTaskRequirement = (value: unknown): TaskRequirement | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const type = readString(record.type);
  if (
    type !== 'file_upload' &&
    type !== 'field_completion' &&
    type !== 'approval' &&
    type !== 'external_action'
  ) {
    return null;
  }

  return {
    type,
    spec: readString(record.spec) || 'Complete the required proof.',
    satisfied: record.satisfied === true,
  };
};

const createWorkspaceName = (user: DatabaseUser, organizationName: string | null): string => {
  const normalizedOrgName = readString(organizationName);
  if (normalizedOrgName) {
    return normalizedOrgName;
  }

  const emailHandle = readString(user.email).split('@')[0] || 'Team';
  return `${emailHandle}'s Team`;
};

export function isTaskSchemaMissingError(error: unknown): boolean {
  const code = readString((error as { code?: string } | null)?.code).toUpperCase();
  const message = readString((error as { message?: string } | null)?.message).toLowerCase();

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('workspace_member_role') ||
    message.includes('workspace_member_status') ||
    message.includes('task_status') ||
    message.includes('task_priority') ||
    message.includes('notification_type')
  );
}

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here
// so the many task route import sites stay stable.
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  requireActiveAuthenticatedUserOrInternal,
  requireAuthenticatedAdminOrInternal,
  createAdminClient,
} from '@/app/api/_shared/auth';

export function buildTaskSchemaResponse(message = 'Task management tables are missing.'): NextResponse {
  return NextResponse.json({ error: message, sql: TASKS_SQL }, { status: 501 });
}

export function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapOrganizationRoleToWorkspaceRole(role: string, isOwner: boolean): WorkspaceMemberRole {
  if (isOwner) {
    return 'owner';
  }

  if (role === 'manager') {
    return 'admin';
  }

  if (role === 'viewer') {
    return 'guest';
  }

  return 'member';
}

export async function loadProfilesByIds(
  adminClient: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  const normalizedIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await adminClient
    .from(PROFILES_TABLE)
    .select('id,name,email')
    .in('id', normalizedIds);

  if (error || !Array.isArray(data)) {
    return new Map<string, ProfileRow>();
  }

  return new Map(
    data.map((row) => {
      const profile = row as ProfileRow;
      return [profile.id, profile] as const;
    })
  );
}

function toWorkspaceMember(
  row: WorkspaceMemberRow,
  workspaceId: string,
  profileByUserId: Map<string, ProfileRow>,
  currentUserId: string
): WorkspaceMember {
  const profile = row.user_id ? profileByUserId.get(row.user_id) || null : null;
  const name = readString(profile?.name) || readString(row.email) || 'Invited member';

  return {
    id: row.id,
    workspaceId,
    userId: row.user_id,
    email: normalizeEmail(profile?.email || row.email),
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    name,
    avatarUrl: null,
    initials: getInitials(name),
    isCurrentUser: row.user_id === currentUserId,
  };
}

async function syncOrganizationMembersIntoWorkspace(
  adminClient: SupabaseClient,
  workspace: WorkspaceRow,
  owner: DatabaseUser
) {
  const organizationResult = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id,name,owner_id')
    .eq('owner_id', owner.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (organizationResult.error && !isTaskSchemaMissingError(organizationResult.error)) {
    return;
  }

  const organization = (organizationResult.data as OrganizationRow | null) || null;
  if (!organization?.id) {
    return;
  }

  const membersResult = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('id,organization_id,user_id,role')
    .eq('organization_id', organization.id);

  if (membersResult.error && !isTaskSchemaMissingError(membersResult.error)) {
    return;
  }

  const organizationMembers = Array.isArray(membersResult.data)
    ? (membersResult.data as OrganizationMemberRow[])
    : [];
  const profilesById = await loadProfilesByIds(
    adminClient,
    organizationMembers.map((member) => member.user_id)
  );

  const inviteRows = organizationMembers
    .map((member) => {
      const profile = profilesById.get(member.user_id);
      const email = normalizeEmail(profile?.email);
      if (!email) {
        return null;
      }

      return {
        workspace_id: workspace.id,
        user_id: member.user_id,
        email,
        role: mapOrganizationRoleToWorkspaceRole(member.role, member.user_id === owner.id),
        status: 'active',
        joined_at: new Date().toISOString(),
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (!inviteRows.length) {
    return;
  }

  await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .upsert(inviteRows, { onConflict: 'workspace_id,email' });
}

/** Thrown when a curator-ONLY account reaches a team-provisioning path. */
export class CuratorAccountError extends Error {
  constructor() {
    super('Playlist owner accounts cannot create rollouts.');
    this.name = 'CuratorAccountError';
  }
}

export async function ensureOwnedWorkspace(
  adminClient: SupabaseClient,
  owner: DatabaseUser
): Promise<WorkspaceRow> {
  // A curator-ONLY account must never get a team of their own by accident.
  // loadWorkspaceAccessContext bails before it reaches here, but this function is
  // also called directly by the release-creation and workspace-logo routes, so
  // the guard belongs at the provisioning step itself rather than at each caller.
  //
  // role='curator' is the "team side never switched on" marker, not "is a
  // playlist owner" — a playlist owner who ALSO wants releases clears it through
  // POST /api/curator/activate-team, and from then on provisions a workspace here
  // like anybody else. Asking for the team product is what earns a workspace; a
  // stray API call is not.
  if ((await loadAccountRole(adminClient, owner.id)) === 'curator') {
    throw new CuratorAccountError();
  }

  const workspaceResult = await adminClient
    .from(WORKSPACES_TABLE)
    .select('id,owner_id,name,created_at,updated_at')
    .eq('owner_id', owner.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspaceResult.error) {
    throw workspaceResult.error;
  }

  let workspace = (workspaceResult.data as WorkspaceRow | null) || null;

  if (!workspace?.id) {
    const organizationResult = await adminClient
      .from(ORGANIZATIONS_TABLE)
      .select('id,name,owner_id')
      .eq('owner_id', owner.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const organization = (organizationResult.data as OrganizationRow | null) || null;
    const createdAt = new Date().toISOString();

    // Team trial stamp (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). Stamped HERE and
    // nowhere else: this insert is the single moment a team comes into
    // existence, so it cannot be double-stamped, and the 23505 loser below
    // re-reads the winner's already-stamped row.
    //
    // GATED ON THE FLAG, and that is a deploy-safety requirement rather than a
    // preference. These two columns only exist once
    // 20260821120000_team_trial_hard_paywall.sql has been applied, and that is
    // a manual step that happens AFTER this code deploys. Writing them
    // unconditionally would mean every new account's provisioning INSERT
    // referenced columns the live database did not yet have: tolerated on the
    // loadWorkspaceAccessContext path (isTaskSchemaMissingError swallows 42703
    // and PGRST204) but silently leaving the account with no team, and outright
    // failing for the routes that call this directly. Flag off, this insert is
    // byte-for-byte what it was before the feature existed.
    //
    // Teams that predate the flag are covered by that migration's backfill
    // (WHERE trial_ends_at IS NULL), which is idempotent — so re-running it at
    // flip time catches anything created between apply and flip. An unstamped
    // team fails OPEN in resolveTeamAccess regardless, so the worst case is a
    // team that keeps working, never one that is wrongly walled.
    const trialStamp = isHardPaywallEnabled()
      ? {
          trial_started_at: createdAt,
          trial_ends_at: new Date(
            Date.now() + TEAM_TRIAL_DAYS * 24 * 60 * 60 * 1000
          ).toISOString(),
        }
      : {};

    const insertResult = await adminClient
      .from(WORKSPACES_TABLE)
      .insert({
        owner_id: owner.id,
        name: createWorkspaceName(owner, organization?.name || null),
        updated_at: createdAt,
        ...trialStamp,
      })
      .select('id,owner_id,name,created_at,updated_at')
      .maybeSingle();

    if (insertResult.data) {
      workspace = insertResult.data as WorkspaceRow;
      // Fire-and-forget: the ledger entry for "this team's clock started".
      // Only on the successful-insert branch, so a raced request does not
      // double-log, and never on the steady-state select hit above. Gated with
      // the stamp above, for the same reason: billing_events is created by the
      // same unapplied migration, and logBillingEvent swallows its own errors
      // but there is no sense making a doomed round trip on every signup.
      if ('trial_ends_at' in trialStamp) {
        const stampedEnd = (trialStamp as { trial_ends_at: string }).trial_ends_at;
        void logBillingEvent(adminClient, {
          workspaceId: workspace.id,
          ownerUserId: owner.id,
          actorUserId: owner.id,
          type: 'trial_started',
          metadata: {
            trialEndsAt: stampedEnd,
            trialDays: TEAM_TRIAL_DAYS,
            source: 'workspace_provisioned',
          },
        });
      }
    } else if ((insertResult.error as { code?: string } | null)?.code === '23505') {
      // Another request for this same user won the race to create the
      // one-per-owner workspace (workspaces has a unique index on owner_id).
      // This is the COMMON path, not an edge case: the select above and this
      // insert are not atomic, and a brand-new account's first page load fires
      // several workspace-aware requests at once (command-center, workspace
      // identity, notifications), so whichever ones lose used to throw a raw
      // PostgREST error object — which, not being an Error instance, surfaced
      // to the user as a bare "Internal Server Error" on the very first screen
      // of a new account. Re-read the winner's row instead. Same
      // 23505-falls-back-to-the-winner shape the EPK generate route uses.
      const racedResult = await adminClient
        .from(WORKSPACES_TABLE)
        .select('id,owner_id,name,created_at,updated_at')
        .eq('owner_id', owner.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (racedResult.error || !racedResult.data) {
        throw racedResult.error || new Error('Could not create your team.');
      }
      workspace = racedResult.data as WorkspaceRow;
    } else {
      throw insertResult.error || new Error('Could not create your team.');
    }
  }

  await adminClient.from(WORKSPACE_MEMBERS_TABLE).upsert(
    {
      workspace_id: workspace.id,
      user_id: owner.id,
      email: normalizeEmail(owner.email),
      role: 'owner',
      status: 'active',
      invited_at: workspace.created_at,
      joined_at: workspace.created_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,email' }
  );

  await syncOrganizationMembersIntoWorkspace(adminClient, workspace, owner);
  return workspace;
}

/** Claims any email-invited membership rows for this user. Returns whether it
 * actually activated anything — callers that resolved access concurrently use
 * that to decide if they need to re-resolve (see loadWorkspaceAccessContext). */
export async function activatePendingWorkspaceInvitesForUser(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<boolean> {
  const email = normalizeEmail(user.email);
  if (!email) {
    return false;
  }

  const existingRowsResult = await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,status,joined_at')
    .eq('email', email)
    .neq('status', 'removed');

  if (existingRowsResult.error || !Array.isArray(existingRowsResult.data)) {
    return false;
  }

  const pendingRows = existingRowsResult.data.filter((row) => !readString(row.user_id));
  if (!pendingRows.length) {
    return false;
  }

  await Promise.all(
    pendingRows.map((row) =>
      adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .update({
          user_id: user.id,
          status: 'active',
          joined_at: row.joined_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    )
  );

  return true;
}

// Pure-read half of access resolution: membership rows, their workspaces,
// and member profiles. No writes, no provisioning. Also reports whether the
// user holds an owner-role membership in a workspace they actually OWN
// (workspaces.owner_id) — the role alone is not enough, since a member can
// be granted role='owner' in someone else's workspace via the members API.
async function resolveWorkspaceAccessContext(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<{ context: WorkspaceAccessContext; hasProvisionedOwnWorkspace: boolean }> {
  const membershipResult = await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,role,status,invited_at,joined_at,created_at,updated_at')
    .eq('user_id', user.id)
    .neq('status', 'removed');

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const membershipRows = Array.isArray(membershipResult.data)
    ? (membershipResult.data as WorkspaceMemberRow[])
    : [];
  const workspaceIds = Array.from(new Set(membershipRows.map((row) => row.workspace_id).filter(Boolean)));

  // Independent lookups — run together instead of serially.
  const [workspaceResult, profileById] = await Promise.all([
    workspaceIds.length
      ? adminClient
          .from(WORKSPACES_TABLE)
          .select('id,owner_id,name,created_at,updated_at')
          .in('id', workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    loadProfilesByIds(
      adminClient,
      membershipRows.map((row) => row.user_id || '').filter(Boolean)
    ),
  ]);

  if (workspaceResult.error) {
    throw workspaceResult.error;
  }

  const workspaceById = new Map<string, WorkspaceRow>();
  for (const row of workspaceResult.data || []) {
    const workspace = row as WorkspaceRow;
    workspaceById.set(workspace.id, workspace);
  }

  const memberships = membershipRows
    .map((row) => {
      const workspace = workspaceById.get(row.workspace_id);
      if (!workspace) {
        return null;
      }

      return toWorkspaceMember(row, workspace.id, profileById, user.id);
    })
    .filter((member): member is WorkspaceMember => Boolean(member))
    .sort((left, right) => {
      if (left.role === 'owner' && right.role !== 'owner') {
        return -1;
      }
      if (right.role === 'owner' && left.role !== 'owner') {
        return 1;
      }
      return left.invitedAt.localeCompare(right.invitedAt);
    });

  // Primary-workspace pick. Default: the owner-first sort above (a manager's
  // own workspace is their team). EXCEPTION (founder decision, 2026-07-23):
  // an invitee also gets an auto-provisioned personal workspace, and with
  // owner-first that empty shell won as their primary — so their Teammates
  // list and assignee picker showed only themself, never the team that
  // invited them. When the user owns ZERO releases and belongs to someone
  // else's workspace, the earliest-joined team workspace is their primary.
  let primaryMembership = memberships[0] || null;
  const joinedMemberships = memberships.filter((member) => {
    const workspace = workspaceById.get(member.workspaceId);
    return workspace && workspace.owner_id !== user.id;
  });
  if (
    primaryMembership &&
    joinedMemberships.length > 0 &&
    workspaceById.get(primaryMembership.workspaceId)?.owner_id === user.id
  ) {
    const ownReleases = await adminClient
      .from(RELEASES_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', user.id);
    if (!ownReleases.error && (ownReleases.count ?? 0) === 0) {
      primaryMembership = joinedMemberships[0];
    }
  }
  const primaryWorkspace = primaryMembership
    ? toWorkspace(workspaceById.get(primaryMembership.workspaceId) as WorkspaceRow)
    : null;

  // Whole-workspace release visibility: the owners of every workspace this
  // user belongs to, plus the user themself.
  const releaseOwnerIds = Array.from(
    new Set([
      user.id,
      ...memberships
        .map((member) => workspaceById.get(member.workspaceId)?.owner_id || '')
        .filter(Boolean),
    ])
  );

  // The caller's role per workspace OWNER — zero extra queries, derived from
  // the rows already loaded. First-wins over the owner-first membership sort,
  // matching resolveReleaseTaskWorkspace's .find precedent for the
  // multiple-workspaces-same-owner edge.
  const memberRoleByOwnerId: Record<string, string> = {};
  for (const member of memberships) {
    const ownerId = workspaceById.get(member.workspaceId)?.owner_id || '';
    if (ownerId && !(ownerId in memberRoleByOwnerId)) {
      memberRoleByOwnerId[ownerId] = member.role;
    }
  }

  // Artist scopes — read in a SEPARATE, tolerant query so the app keeps
  // working before the artist_scope_id migration is applied (the main
  // membership select must never reference a column that may not exist).
  const artistScopeByOwnerId: Record<string, string> = {};
  const artistScopeByWorkspaceId: Record<string, string> = {};
  if (membershipRows.length) {
    try {
      const scopeResult = await adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .select('id,workspace_id,artist_scope_id')
        .in('id', membershipRows.map((row) => row.id));
      if (!scopeResult.error && Array.isArray(scopeResult.data)) {
        for (const row of scopeResult.data as Array<{
          id: string;
          workspace_id: string;
          artist_scope_id: string | null;
        }>) {
          const scope = String(row.artist_scope_id || '');
          if (!scope) continue;
          const workspace = workspaceById.get(row.workspace_id);
          // Never scope the user against their OWN workspace.
          if (!workspace || workspace.owner_id === user.id) continue;
          artistScopeByWorkspaceId[row.workspace_id] = scope;
          if (workspace.owner_id) artistScopeByOwnerId[workspace.owner_id] = scope;
        }
      }
    } catch {
      // Pre-migration environments: treat every membership as unscoped.
    }
  }

  // "Provisioned" means BOTH halves of what ensureOwnedWorkspace guarantees
  // exist: a workspace this user owns (workspaces.owner_id) AND their
  // owner-role membership row in it. Checking the role alone is not enough —
  // the members API can grant role='owner' in a workspace the user does not
  // own, and that must not suppress provisioning of their own.
  const hasProvisionedOwnWorkspace = membershipRows.some((row) => {
    if (row.role !== 'owner') {
      return false;
    }
    const workspace = workspaceById.get(row.workspace_id);
    return workspace?.owner_id === user.id;
  });

  return {
    context: {
      memberships,
      workspaceIds: memberships.map((member) => member.workspaceId),
      membershipIds: memberships.map((member) => member.id),
      primaryWorkspaceId: primaryMembership?.workspaceId || null,
      primaryWorkspace,
      releaseOwnerIds,
      artistScopeByOwnerId,
      artistScopeByWorkspaceId,
      memberRoleByOwnerId,
    },
    hasProvisionedOwnWorkspace,
  };
}

/**
 * A context that grants nothing. Returned for a curator account (the
 * playlist-pitching user type): a curator belongs to no team and owns no
 * release, so every workspace-aware read resolves to an empty set rather than
 * to their own auto-provisioned team.
 *
 * releaseOwnerIds is deliberately EMPTY, not [user.id]: callers pass it
 * straight into `.in('owner_user_id', ...)`, and an empty list is the
 * fail-closed answer.
 */
const EMPTY_WORKSPACE_ACCESS_CONTEXT: WorkspaceAccessContext = {
  memberships: [],
  workspaceIds: [],
  membershipIds: [],
  primaryWorkspaceId: null,
  primaryWorkspace: null,
  releaseOwnerIds: [],
  artistScopeByOwnerId: {},
  artistScopeByWorkspaceId: {},
  memberRoleByOwnerId: {},
};

/** Reads profiles.role. Never throws: an unreadable profile is treated as a
 * normal account, which is the pre-existing behavior. */
async function loadAccountRole(
  adminClient: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return '';
    return String(data?.role || '');
  } catch {
    return '';
  }
}

export async function loadWorkspaceAccessContext(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<WorkspaceAccessContext> {
  // This runs on every task/dashboard read, so it must be read-only on the
  // steady state. It used to run ensureOwnedWorkspace unconditionally — an
  // owner-membership UPSERT (a real write, stamping updated_at) plus a
  // 4-query organization-member sync on every GET. Now:
  //   1. Invite activation runs ALONGSIDE the resolve, not before it. On the
  //      steady state (no pending email-invites) it's one indexed read whose
  //      latency now hides behind the resolve instead of adding to it; when
  //      it does activate rows, we re-resolve so an invited user still sees
  //      their workspace on this same request rather than the next one.
  //      The deferred TOKEN claim (claimPendingWorkspaceInvite) rides the
  //      same Promise.all under the same contract: recover the membership,
  //      then re-resolve on this same request.
  //   2. Resolve the context with reads only.
  //   3. Provision-on-miss: only a user whose OWN workspace + owner
  //      membership isn't intact (first-ever load, or a corrupted/missing
  //      owner row — the cases the old unconditional upsert was silently
  //      self-healing) pays the write path, then the context is re-resolved.
  //   0. A curator-ONLY account (role='curator', i.e. the team side was never
  //      switched on) gets an empty context and, crucially, never reaches the
  //      provision-on-miss step below. Without this bail, its first
  //      workspace-aware request would silently hand it a team it never asked
  //      for. A DUAL account — a playlist owner who did ask, via POST
  //      /api/curator/activate-team — carries a team role here and provisions
  //      normally. The role read rides in the same Promise.all so its latency
  //      hides behind the resolve on the steady state.
  const [activatedInvites, claimedPendingInvite, initialResolved, accountRole] =
    await Promise.all([
      activatePendingWorkspaceInvitesForUser(adminClient, user),
      // Deferred invite claim (lib/invite-claims-server.ts): finishes a join
      // whose accept POST never completed — the account-created-but-never-
      // joined dead end a real invited teammate hit. Zero queries on the
      // steady state (no pending_invite_token in user_metadata), so it rides
      // this hot path for free, exactly like the email-invite activation
      // beside it.
      claimPendingWorkspaceInvite(adminClient, user),
      resolveWorkspaceAccessContext(adminClient, user),
      loadAccountRole(adminClient, user.id),
    ]);

  if (accountRole === 'curator') {
    return EMPTY_WORKSPACE_ACCESS_CONTEXT;
  }

  let resolved =
    activatedInvites || claimedPendingInvite
      ? await resolveWorkspaceAccessContext(adminClient, user)
      : initialResolved;

  if (!resolved.hasProvisionedOwnWorkspace) {
    try {
      await ensureOwnedWorkspace(adminClient, user);
    } catch (error) {
      if (!isTaskSchemaMissingError(error)) {
        throw error;
      }
    }
    resolved = await resolveWorkspaceAccessContext(adminClient, user);
  }

  return resolved.context;
}

export async function loadWorkspaceMembers(
  adminClient: SupabaseClient,
  workspaceId: string,
  currentUserId: string
): Promise<WorkspaceMember[]> {
  const result = await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,role,status,invited_at,joined_at,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed')
    .order('invited_at', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? (result.data as WorkspaceMemberRow[]) : [];
  const profileById = await loadProfilesByIds(
    adminClient,
    rows.map((row) => row.user_id || '').filter(Boolean)
  );

  return rows.map((row) => toWorkspaceMember(row, workspaceId, profileById, currentUserId));
}

function toTaskGroup(row: TaskGroupRow, taskCount = 0): TaskGroup {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    releaseId: row.release_id,
    name: row.name,
    position: row.position,
    taskCount,
    createdAt: row.created_at,
  };
}

async function loadReleaseSummaries(
  adminClient: SupabaseClient,
  releaseIds: string[]
): Promise<Map<string, TaskReleaseSummary>> {
  const normalizedIds = Array.from(new Set(releaseIds.filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map<string, TaskReleaseSummary>();
  }

  const result = await adminClient
    .from(RELEASES_TABLE)
    .select('id,title,artist_name,owner_user_id')
    .in('id', normalizedIds);

  if (result.error) {
    // Surface the failure instead of swallowing it. A silent empty map here
    // means every task's `release` relation comes back null, which is exactly
    // how a stale `user_id` column reference in this select hid for two days.
    console.error('loadReleaseSummaries query failed:', result.error);
    return new Map<string, TaskReleaseSummary>();
  }

  if (!Array.isArray(result.data)) {
    return new Map<string, TaskReleaseSummary>();
  }

  return new Map(
    result.data.map((row) => {
      const release = row as ReleaseRow;
      return [
        release.id,
        {
          id: release.id,
          title: release.title,
          artistName: release.artist_name,
        },
      ] as const;
    })
  );
}

async function loadTaskGroups(
  adminClient: SupabaseClient,
  groupIds: string[]
): Promise<Map<string, TaskGroup>> {
  const normalizedIds = Array.from(new Set(groupIds.filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map<string, TaskGroup>();
  }

  const result = await adminClient
    .from(TASK_GROUPS_TABLE)
    .select('id,workspace_id,release_id,name,position,created_at,updated_at')
    .in('id', normalizedIds);

  if (result.error || !Array.isArray(result.data)) {
    return new Map<string, TaskGroup>();
  }

  return new Map(
    result.data.map((row) => {
      const group = row as TaskGroupRow;
      return [group.id, toTaskGroup(group)] as const;
    })
  );
}

async function loadTaskCounts(
  adminClient: SupabaseClient,
  table: typeof TASK_COMMENTS_TABLE | typeof TASK_ATTACHMENTS_TABLE,
  taskIds: string[]
): Promise<Map<string, number>> {
  const normalizedIds = Array.from(new Set(taskIds.filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map<string, number>();
  }

  const result = await adminClient.from(table).select('task_id').in('task_id', normalizedIds);
  if (result.error || !Array.isArray(result.data)) {
    return new Map<string, number>();
  }

  const counts = new Map<string, number>();
  for (const row of result.data) {
    const taskId = readString((row as { task_id?: string }).task_id);
    if (!taskId) {
      continue;
    }

    counts.set(taskId, (counts.get(taskId) || 0) + 1);
  }

  return counts;
}

function toTask(
  row: TaskRow,
  releaseById: Map<string, TaskReleaseSummary>,
  groupById: Map<string, TaskGroup>,
  memberByUserId: Map<string, WorkspaceMember>,
  memberById: Map<string, WorkspaceMember>,
  commentCountByTaskId: Map<string, number>,
  attachmentCountByTaskId: Map<string, number>
): Task {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    groupId: row.group_id,
    releaseId: row.release_id,
    createdBy: row.created_by,
    assignedToUserId: row.assigned_to_user_id,
    assignedTo: row.assigned_to,
    title: row.title,
    description: row.description,
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
    dueDate: row.due_date,
    completedAt: row.completed_at,
    position: Number.isFinite(row.position) ? row.position : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    release: row.release_id ? releaseById.get(row.release_id) || null : null,
    group: row.group_id ? groupById.get(row.group_id) || null : null,
    assignee: row.assigned_to_user_id ? memberByUserId.get(row.assigned_to_user_id) || null : (row.assigned_to ? memberById.get(row.assigned_to) || null : null),
    context: normalizeTaskContext(row.metadata),
    requirement: normalizeTaskRequirement(row.requirement),
    dependencies: Array.isArray(row.dependencies) ? row.dependencies.map(String).filter(Boolean) : [],
    state: normalizeTaskState(row.state),
    autoGenerated: row.auto_generated === true,
    taskType: readTaskType(row.metadata),
    templateTaskId: readTemplateTaskId(row.metadata),
    durationDays: readDurationDays(row.metadata),
    compressedRunway: readCompressedRunway(row.metadata),
    groupName: readNullableString(row.group_name),
    groupColor: readNullableString(row.group_color),
    commentCount: commentCountByTaskId.get(row.id) || 0,
    attachmentCount: attachmentCountByTaskId.get(row.id) || 0,
  };
}

export async function loadTasks(
  adminClient: SupabaseClient,
  rows: TaskRow[],
  currentUserId: string,
  preloaded?: {
    // Callers that already resolved a workspace's members (e.g. the release
    // task board, which loads them for its response anyway) pass them here
    // so the same workspace_members + profiles queries don't run twice in
    // one request. Workspaces not in the map are still fetched.
    membersByWorkspaceId?: Map<string, WorkspaceMember[]>;
  }
): Promise<Task[]> {
  const workspaceIds = Array.from(new Set(rows.map((row) => row.workspace_id).filter(Boolean)));

  // Everything here is independent — releases, groups, members, and both
  // count lookups used to run as up to 5+ serial awaits per call.
  const [releaseById, groupById, memberLists, commentCountByTaskId, attachmentCountByTaskId] =
    await Promise.all([
      loadReleaseSummaries(
        adminClient,
        rows.map((row) => row.release_id || '').filter(Boolean)
      ),
      loadTaskGroups(
        adminClient,
        rows.map((row) => row.group_id || '').filter(Boolean)
      ),
      Promise.all(
        workspaceIds.map(
          (workspaceId) =>
            preloaded?.membersByWorkspaceId?.get(workspaceId) ??
            loadWorkspaceMembers(adminClient, workspaceId, currentUserId)
        )
      ),
      loadTaskCounts(adminClient, TASK_COMMENTS_TABLE, rows.map((row) => row.id)),
      loadTaskCounts(adminClient, TASK_ATTACHMENTS_TABLE, rows.map((row) => row.id)),
    ]);

  const memberById = new Map<string, WorkspaceMember>();
  const memberByUserId = new Map<string, WorkspaceMember>();
  for (const members of memberLists) {
    for (const member of members) {
      memberById.set(member.id, member);
      if (member.userId) {
        memberByUserId.set(member.userId, member);
      }
    }
  }

  return rows.map((row) =>
    toTask(row, releaseById, groupById, memberByUserId, memberById, commentCountByTaskId, attachmentCountByTaskId)
  );
}

export async function ensureWorkspaceAccess(
  adminClient: SupabaseClient,
  workspaceId: string,
  user: DatabaseUser,
  // Pass a context the request already resolved to skip re-running the whole
  // access lookup (tasks POST used to resolve it twice per request).
  resolvedAccess?: WorkspaceAccessContext
): Promise<{ access: WorkspaceAccessContext } | { error: NextResponse }> {
  const access = resolvedAccess ?? (await loadWorkspaceAccessContext(adminClient, user));
  if (!access.workspaceIds.includes(workspaceId)) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };
  }

  return { access };
}

export async function ensureTaskAccess(
  adminClient: SupabaseClient,
  taskId: string,
  user: DatabaseUser
): Promise<{ task: TaskRow; access: WorkspaceAccessContext } | { error: NextResponse }> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  if (!access.workspaceIds.length) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };
  }

  const result = await adminClient
    .from(TASKS_TABLE)
    .select(TASKS_SELECT_COLUMNS)
    .eq('id', taskId)
    .in('workspace_id', access.workspaceIds)
    .maybeSingle();

  if (result.error) {
    if (isTaskSchemaMissingError(result.error)) {
      return { error: buildTaskSchemaResponse() };
    }

    return { error: NextResponse.json({ error: result.error.message || 'Could not load task.' }, { status: 500 }) };
  }

  if (!result.data) {
    return { error: NextResponse.json({ error: 'Task not found.' }, { status: 404 }) };
  }

  const task = result.data as TaskRow;

  // Artist-scoped members only touch activities on THEIR artist's releases.
  const artistScope = access.artistScopeByWorkspaceId[String(task.workspace_id || '')];
  if (artistScope && task.release_id) {
    const releaseResult = await adminClient
      .from(RELEASES_TABLE)
      .select('id,artist_id')
      .eq('id', task.release_id)
      .maybeSingle();
    const releaseArtistId = String(
      (releaseResult.data as { artist_id?: unknown } | null)?.artist_id || ''
    );
    if (releaseArtistId !== artistScope) {
      return { error: NextResponse.json({ error: 'Task not found.' }, { status: 404 }) };
    }
  }

  return { task, access };
}

export async function createDefaultReleaseTaskGroups(
  adminClient: SupabaseClient,
  workspaceId: string,
  releaseId: string
): Promise<TaskGroupRow[]> {
  const existingResult = await adminClient
    .from(TASK_GROUPS_TABLE)
    .select('id,workspace_id,release_id,name,position,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('release_id', releaseId)
    .order('position', { ascending: true });

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingNames = new Set(
    (existingResult.data || []).map((row) => readString((row as { name?: string }).name))
  );

  const groupsToCreate = DEFAULT_RELEASE_TASK_GROUPS.filter((name) => !existingNames.has(name)).map(
    (name, index) => ({
      workspace_id: workspaceId,
      release_id: releaseId,
      name,
      position: index,
      updated_at: new Date().toISOString(),
    })
  );

  if (groupsToCreate.length) {
    const insertResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .insert(groupsToCreate)
      .select('id,workspace_id,release_id,name,position,created_at,updated_at');
    if (insertResult.error) {
      throw insertResult.error;
    }

    return [...(existingResult.data || []), ...(insertResult.data || [])] as TaskGroupRow[];
  }

  return (existingResult.data || []) as TaskGroupRow[];
}

export async function resolveReleaseTaskWorkspace(
  adminClient: SupabaseClient,
  releaseId: string,
  user: DatabaseUser
): Promise<{
  release: TaskReleaseSummary;
  workspaceId: string;
  members: WorkspaceMember[];
}> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  const releaseResult = await adminClient
    .from(RELEASES_TABLE)
    .select('id,title,artist_name,artist_id,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (releaseResult.error || !releaseResult.data) {
    throw releaseResult.error || new Error('Rollout not found.');
  }

  const release = releaseResult.data as ReleaseRow;
  const ownerId = release.owner_user_id || '';

  // Resolve the workspace that OWNS this release, then require the caller
  // to be a member of it. The previous implementation matched the caller's
  // own membership rows against the release owner's user id — every row's
  // userId is the CALLER's, so it only ever matched when the caller WAS the
  // owner, and every non-owner teammate got "Could not find the team for this release."
  // (found in the 2026-07-23 collaboration audit).
  const ownerWorkspacesResult = await adminClient
    .from(WORKSPACES_TABLE)
    .select('id,owner_id')
    .eq('owner_id', ownerId);

  if (ownerWorkspacesResult.error) {
    throw ownerWorkspacesResult.error;
  }

  const releaseWorkspaceId = (ownerWorkspacesResult.data || [])
    .map((row) => String((row as { id?: unknown }).id || ''))
    .find((id) => id && access.workspaceIds.includes(id));

  if (!releaseWorkspaceId) {
    throw new Error('Could not find the team for this release.');
  }

  // Artist-scoped members only reach boards for THEIR artist's releases.
  const artistScope = access.artistScopeByWorkspaceId[releaseWorkspaceId];
  if (
    artistScope &&
    String((releaseResult.data as { artist_id?: unknown }).artist_id || '') !== artistScope
  ) {
    throw new Error('Could not find the team for this release.');
  }

  await createDefaultReleaseTaskGroups(adminClient, releaseWorkspaceId, releaseId);

  return {
    release: {
      id: release.id,
      title: release.title,
      artistName: release.artist_name,
    },
    workspaceId: releaseWorkspaceId,
    members: await loadWorkspaceMembers(adminClient, releaseWorkspaceId, user.id),
  };
}

export async function loadReleaseTaskBoard(
  adminClient: SupabaseClient,
  releaseId: string,
  user: DatabaseUser
): Promise<ReleaseTasksResponse> {
  const context = await resolveReleaseTaskWorkspace(adminClient, releaseId, user);

  const [groupsResult, taskRowsResult] = await Promise.all([
    adminClient
      .from(TASK_GROUPS_TABLE)
      .select('id,workspace_id,release_id,name,position,created_at,updated_at')
      .eq('workspace_id', context.workspaceId)
      .eq('release_id', releaseId)
      .order('position', { ascending: true }),
    adminClient
      .from(TASKS_TABLE)
      .select(TASKS_SELECT_COLUMNS)
      .eq('workspace_id', context.workspaceId)
      .eq('release_id', releaseId)
      .order('position', { ascending: true }),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }

  if (taskRowsResult.error) {
    throw taskRowsResult.error;
  }

  const groups = Array.isArray(groupsResult.data)
    ? (groupsResult.data as TaskGroupRow[]).map((row) => toTaskGroup(row))
    : [];
  // The board response already carries context.members — hand them to
  // loadTasks so this request doesn't resolve the same workspace's members
  // (and their profiles) a second time.
  const tasks = await loadTasks(
    adminClient,
    Array.isArray(taskRowsResult.data) ? (taskRowsResult.data as TaskRow[]) : [],
    user.id,
    { membersByWorkspaceId: new Map([[context.workspaceId, context.members]]) }
  );

  return {
    release: context.release,
    groups,
    tasks,
    members: context.members,
  };
}

export async function loadTaskComments(
  adminClient: SupabaseClient,
  taskId: string,
  currentUserId: string
): Promise<TaskComment[]> {
  const result = await adminClient
    .from(TASK_COMMENTS_TABLE)
    .select('id,task_id,user_id,content,created_at,edited_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? (result.data as TaskCommentRow[]) : [];
  const profilesById = await loadProfilesByIds(
    adminClient,
    rows.map((row) => row.user_id)
  );

  return rows.map((row) => {
    const profile = profilesById.get(row.user_id) || null;
    const authorName = readString(profile?.name) || readString(profile?.email) || 'Team member';
    const authorEmail = normalizeEmail(profile?.email);

    return {
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      authorName,
      authorEmail,
      authorInitials: getInitials(authorName),
      isOwnComment: row.user_id === currentUserId,
    };
  });
}

export async function loadTaskAttachments(
  adminClient: SupabaseClient,
  taskId: string
): Promise<TaskAttachment[]> {
  const result = await adminClient
    .from(TASK_ATTACHMENTS_TABLE)
    .select('id,task_id,user_id,file_url,file_name,file_size,storage_path,created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? (result.data as TaskAttachmentRow[]) : [];
  const attachments = await Promise.all(
    rows.map(async (row) => {
      let fileUrl = row.file_url;

      if (row.storage_path) {
        const signedUrlResult = await adminClient.storage
          .from(TASK_ATTACHMENTS_BUCKET)
          .createSignedUrl(row.storage_path, TASK_ATTACHMENT_SIGNED_URL_TTL_SECONDS);

        if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
          fileUrl = signedUrlResult.data.signedUrl;
        }
      }

      return {
        id: row.id,
        taskId: row.task_id,
        userId: row.user_id,
        fileUrl,
        fileName: row.file_name,
        fileSize: row.file_size,
        createdAt: row.created_at,
      };
    })
  );

  return attachments;
}

export async function loadTaskActivity(
  adminClient: SupabaseClient,
  taskId: string
): Promise<TaskActivityEntry[]> {
  const result = await adminClient
    .from(TASK_ACTIVITY_TABLE)
    .select('id,task_id,actor_id,message,metadata,created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? (result.data as TaskActivityRow[]) : [];
  const profilesById = await loadProfilesByIds(
    adminClient,
    rows.map((row) => row.actor_id || '').filter(Boolean)
  );

  return rows.map((row) => {
    const profile = row.actor_id ? profilesById.get(row.actor_id) || null : null;
    return {
      id: row.id,
      taskId: row.task_id,
      actorId: row.actor_id,
      actorName: readString(profile?.name) || readString(profile?.email) || 'System',
      message: row.message,
      createdAt: row.created_at,
    };
  });
}

/**
 * The task's outcome ("Done. How did it go?"), or null when the feature is
 * off, the task has never been completed through the sheet, or the read
 * fails. Read errors degrade to null on purpose: an outcome is decoration on
 * the task detail view, and an unmigrated environment must not take the whole
 * task read down with it.
 */
export async function loadTaskOutcome(
  adminClient: SupabaseClient,
  taskId: string
): Promise<TaskOutcome | null> {
  if (process.env.NEXT_PUBLIC_FEATURE_TASK_OUTCOMES !== 'true') return null;

  const result = await adminClient
    .from(TASK_OUTCOMES_TABLE)
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();

  if (result.error) return null;
  return mapTaskOutcomeRow(result.data as Record<string, unknown> | null);
}

export async function loadTaskDetail(
  adminClient: SupabaseClient,
  taskRow: TaskRow,
  currentUserId: string
): Promise<TaskDetail> {
  const [tasks, comments, attachments, activity, outcome] = await Promise.all([
    loadTasks(adminClient, [taskRow], currentUserId),
    loadTaskComments(adminClient, taskRow.id, currentUserId),
    loadTaskAttachments(adminClient, taskRow.id),
    loadTaskActivity(adminClient, taskRow.id),
    loadTaskOutcome(adminClient, taskRow.id),
  ]);

  const task = tasks[0];
  return {
    ...task,
    comments,
    attachments,
    activity,
    outcome,
  };
}

export async function logTaskActivity(
  adminClient: SupabaseClient,
  input: {
    taskId: string;
    actorId: string | null;
    message: string;
    metadata?: Record<string, unknown>;
  }
) {
  await adminClient.from(TASK_ACTIVITY_TABLE).insert({
    task_id: input.taskId,
    actor_id: input.actorId,
    message: input.message,
    metadata: input.metadata || {},
  });
}

// Web Push copy per notification type. Bodies get the task title injected;
// the click deep-links to the workspace scoped to the task's release (same
// destination NotificationsBell navigates to). Tagged per task+type so a
// re-fired notification replaces the stale one instead of stacking.
//
// `copyOverrides` (mobile push notifications, 2026-08-10) lets the deadline
// sweep pass in admin-edited preset copy for the three due-date tiers
// without this function knowing anything about app_settings — see
// createDueDateNotificationsForAllUsers, which loads presets once per run.
function buildTaskPushPayload(
  type: NotificationType,
  taskTitle: string,
  taskId: string,
  releaseId: string | null,
  copyOverrides?: Partial<Record<NotificationType, { title: string; body: string }>>
): PushPayload {
  const quoted = taskTitle ? `“${taskTitle}”` : 'An activity';
  const copy: Partial<Record<NotificationType, { title: string; body: string }>> = {
    task_assigned: { title: 'New activity for you', body: `${quoted} was assigned to you.` },
    task_status_changed: { title: 'Activity update', body: `${quoted} changed status.` },
    task_due_soon: { title: 'Due soon', body: `${quoted} is due within 24 hours.` },
    task_due_3d: { title: 'Due in 3 days', body: `${quoted} is due in 3 days.` },
    task_due_7d: { title: 'Due in 7 days', body: `${quoted} is due in 7 days.` },
    task_overdue: { title: 'Overdue', body: `${quoted} is overdue.` },
    task_commented: { title: 'New comment', body: `New comment on ${quoted}.` },
    ...copyOverrides,
  };
  const entry = copy[type] || { title: 'Urganize', body: `${quoted} was updated.` };
  // Admin-edited preset copy (copyOverrides) carries the literal placeholder
  // `{taskTitle}` — see lib/notification-presets.ts — since the preset is
  // authored without knowing which task it'll fire for. The built-in
  // defaults above never contain the placeholder (they interpolate `quoted`
  // directly), so this replace is a no-op for them.
  return {
    title: entry.title.replace('{taskTitle}', quoted),
    body: entry.body.replace('{taskTitle}', quoted),
    url: releaseId ? `/dashboard?release=${releaseId}` : '/dashboard',
    tag: `task-${taskId}-${type}`,
  };
}

export async function createTaskNotification(
  adminClient: SupabaseClient,
  input: {
    userId: string | null;
    type: NotificationType;
    taskId: string;
    actorId?: string | null;
    copyOverrides?: Partial<Record<NotificationType, { title: string; body: string }>>;
  }
) {
  if (!input.userId) {
    return;
  }

  const existingResult = await adminClient
    .from(NOTIFICATIONS_TABLE)
    .select('id')
    .eq('user_id', input.userId)
    .eq('task_id', input.taskId)
    .eq('type', input.type)
    .eq('read', false)
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    return;
  }

  if (existingResult.data?.id) {
    return;
  }

  const insertResult = await adminClient.from(NOTIFICATIONS_TABLE).insert({
    user_id: input.userId,
    type: input.type,
    task_id: input.taskId,
    actor_id: input.actorId || null,
  });

  if (insertResult.error) {
    return;
  }

  // Web Push delivery — mirrors the in-app row 1:1 (same dedup guard above,
  // so a duplicate never pushes twice). No-op when VAPID keys aren't
  // configured or the user has no registered devices; a push failure never
  // fails the notification itself.
  try {
    const taskResult = await adminClient
      .from(TASKS_TABLE)
      .select('title,release_id')
      .eq('id', input.taskId)
      .maybeSingle();
    const taskTitle = String(taskResult.data?.title || '').trim();
    const releaseId = taskResult.data?.release_id ? String(taskResult.data.release_id) : null;
    await sendPushToUsers(
      adminClient,
      [input.userId],
      buildTaskPushPayload(input.type, taskTitle, input.taskId, releaseId, input.copyOverrides)
    );
  } catch (error) {
    console.error('[push] task notification push failed', error);
  }

  // Email delivery — ASSIGNMENT ONLY (founder request, 2026-08-29): the push
  // is a ping that only reaches devices with notifications enabled, and the
  // bell is desktop-only, so an assignment could land silently for a teammate
  // who has neither. Assignment is also the one event low-frequency and
  // high-consequence enough to earn an inbox row; the due-date sweeps and
  // status/comment events deliberately stay push+bell only. Rides the same
  // dedup guard above (an early return means no email either), and like the
  // push it must never fail the notification: sendEmail never throws and
  // silently no-ops when RESEND_API_KEY/EMAIL_FROM are unset.
  if (input.type === 'task_assigned') {
    try {
      await sendTaskAssignedEmail(adminClient, {
        assigneeUserId: input.userId,
        actorUserId: input.actorId || null,
        taskId: input.taskId,
      });
    } catch (error) {
      console.error('[email] task assignment email failed', error);
    }
  }
}

async function sendTaskAssignedEmail(
  adminClient: SupabaseClient,
  input: { assigneeUserId: string; actorUserId: string | null; taskId: string }
): Promise<void> {
  const [assigneeResult, actorResult, taskResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select('email,name')
      .eq('id', input.assigneeUserId)
      .maybeSingle(),
    input.actorUserId
      ? adminClient.from('profiles').select('email,name').eq('id', input.actorUserId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    adminClient
      .from(TASKS_TABLE)
      .select('title,description,due_date,priority,release_id')
      .eq('id', input.taskId)
      .maybeSingle(),
  ]);

  const assigneeEmail = String(assigneeResult.data?.email || '').trim();
  if (!assigneeEmail || !isEmailConfigured()) return;

  const assignerLabel =
    String(actorResult.data?.name || '').trim() ||
    String(actorResult.data?.email || '').trim() ||
    'Your teammate';

  const task = taskResult.data as
    | { title?: string; description?: string; due_date?: string; priority?: string; release_id?: string }
    | null;
  const releaseId = String(task?.release_id || '').trim();

  let releaseTitle = '';
  if (releaseId) {
    const releaseResult = await adminClient
      .from(RELEASES_TABLE)
      .select('title')
      .eq('id', releaseId)
      .maybeSingle();
    releaseTitle = String(releaseResult.data?.title || '').trim();
  }

  await sendEmail(adminClient, {
    templateId: 'task_assigned',
    to: assigneeEmail,
    props: {
      recipientName: String(assigneeResult.data?.name || ''),
      assignerLabel,
      taskTitle: String(task?.title || ''),
      releaseTitle,
      dueDateLabel: formatDueDateForEmail(task?.due_date),
      priorityLabel: priorityLabelForEmail(task?.priority),
      note: noteExcerptForEmail(task?.description),
      taskUrl: releaseId ? `${APP_URL}/dashboard?release=${releaseId}` : `${APP_URL}/dashboard`,
    },
    trigger: 'task_assigned',
    recipientUserId: input.assigneeUserId,
    actorUserId: input.actorUserId,
    // The inbox row itself reads as coming from the person who assigned it.
    fromLabel: `${assignerLabel} via Urganize`,
  });
}

// Runs across every user's tasks in one pass — called from the
// /api/cron/due-date-notifications route (see apps/web/vercel.json for the
// schedule), not from the request path. Previously this ran per-user inside
// listNotifications on every single GET /api/notifications call, which
// meant every bell fetch/dropdown-open re-scanned that user's tasks. A
// scheduled sweep across all tasks once an hour does the same job without
// paying that cost on every read.
export async function createDueDateNotificationsForAllUsers(adminClient: SupabaseClient) {
  const result = await adminClient
    .from(TASKS_TABLE)
    .select('id,assigned_to_user_id,due_date,status')
    .not('due_date', 'is', null)
    .not('assigned_to_user_id', 'is', null);

  if (result.error || !Array.isArray(result.data)) {
    return;
  }

  // Loaded once per sweep, not once per task — see
  // lib/notification-presets-server.ts. Deadline reminders can be turned
  // off globally via the deadlineReminders.enabled preset; the three NEW
  // tiers (7d/3d/1d — mobile push notifications, 2026-08-10) share that one
  // switch rather than three, since they're one feature to a user. This must
  // NOT also gate task_overdue below: that notification predates this
  // feature (it isn't part of what the "Deadline reminders" toggle in
  // /admin/notifications advertises) and an earlier version of this
  // function returned before the loop at all, silently killing overdue
  // notifications the moment an admin turned the new tiers off.
  const presets = await getNotificationPresets(adminClient);
  const deadlineRemindersEnabled = presets.deadlineReminders.enabled;
  const copyOverrides = buildDeadlineTierCopyOverrides(presets);

  const now = Date.now();

  for (const row of result.data) {
    const taskId = readString((row as { id?: string }).id);
    const assigneeUserId = readNullableString(
      (row as { assigned_to_user_id?: string }).assigned_to_user_id
    );
    const dueDateRaw = readNullableString((row as { due_date?: string }).due_date);
    const status = normalizeTaskStatus((row as { status?: string }).status);

    if (!taskId || !assigneeUserId || !dueDateRaw || status === 'done' || status === 'cancelled') {
      continue;
    }

    const dueDate = new Date(dueDateRaw).getTime();
    const tier: DueTier = assignDueTier(dueDate, now);
    if (!tier) {
      continue;
    }
    if (tier !== 'task_overdue' && !deadlineRemindersEnabled) {
      continue;
    }

    await createTaskNotification(adminClient, {
      userId: assigneeUserId,
      type: tier,
      taskId,
      copyOverrides: tier === 'task_overdue' ? undefined : copyOverrides,
    });
  }
}

function buildDeadlineTierCopyOverrides(
  presets: NotificationPresets
): Partial<Record<NotificationType, { title: string; body: string }>> {
  const { copy } = presets.deadlineReminders;
  return {
    task_due_soon: copy.task_due_soon,
    task_due_3d: copy.task_due_3d,
    task_due_7d: copy.task_due_7d,
  };
}

export async function listNotifications(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<TaskNotification[]> {
  // Due-date notifications are created by a scheduled sweep now (see
  // createDueDateNotificationsForAllUsers + /api/cron/due-date-notifications),
  // not on every read of this list.
  const result = await adminClient
    .from(NOTIFICATIONS_TABLE)
    .select('id,user_id,type,task_id,actor_id,read,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? (result.data as NotificationRow[]) : [];
  const taskIds = rows.map((row) => row.task_id);
  const actorIds = rows.map((row) => row.actor_id || '').filter(Boolean);

  const [taskResult, profileById] = await Promise.all([
    taskIds.length
      ? adminClient.from(TASKS_TABLE).select('id,title,status,release_id').in('id', taskIds)
      : { data: [], error: null as { message?: string } | null },
    loadProfilesByIds(adminClient, actorIds),
  ]);

  const taskById = new Map<
    string,
    { title: string; status: TaskStatus; releaseId: string | null }
  >();
  for (const row of taskResult.data || []) {
    const task = row as {
      id?: string;
      title?: string;
      status?: string;
      release_id?: string | null;
    };
    const id = readString(task.id);
    if (!id) {
      continue;
    }

    taskById.set(id, {
      title: readString(task.title) || 'Task',
      status: normalizeTaskStatus(task.status),
      // release_id is the navigation hint for the bell — when a notification
      // is clicked, the bell needs to know which release scope to switch the
      // workspace into before opening the task drawer. Tasks not tied to a
      // release surface as null and skip the scope switch.
      releaseId: readString(task.release_id) || null,
    });
  }

  return rows.map((row) => {
    const actor = row.actor_id ? profileById.get(row.actor_id) || null : null;
    const task =
      taskById.get(row.task_id) || { title: 'Task', status: 'todo' as TaskStatus, releaseId: null };

    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      taskId: row.task_id,
      actorId: row.actor_id,
      read: row.read,
      createdAt: row.created_at,
      taskTitle: task.title,
      actorName: readString(actor?.name) || readString(actor?.email) || 'System',
      taskStatus: task.status,
      taskReleaseId: task.releaseId,
    };
  });
}

/** Exported since 2026-08-21 so the billing alerts can build an activate link
 * without a third copy of this resolution (the Vercel SSO trap below is the
 * reason there should only ever be one). */
export function resolveAppBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
  if (appUrl) return appUrl.replace(/\/$/, '');
  // Production fallback is the CANONICAL domain, never the *.vercel.app
  // deployment host: Vercel Deployment Protection walls that host behind a
  // Vercel SSO login, so invite links minted from it were unopenable for
  // anyone without a Vercel account (found 2026-07-23 when a real invite
  // hit the SSO wall). NEXT_PUBLIC_APP_URL, when set, still wins above.
  if (process.env.VERCEL_ENV === 'production') return 'https://app.urganize.app';
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${vercelHost}`;
  return 'http://localhost:3000';
}

/**
 * Token-based invite URL. The token identifies the exact workspace_members
 * row, so acceptance works even if the invitee signs up with a different
 * email than they were invited at — closes the email-mismatch gap that
 * pure email-matching cannot see past.
 *
 * Old invites that pre-date the token system still work via the email-link
 * trigger (20260605010000_invite_linkage_trigger.sql) — those URLs point
 * at /auth?email=... and rely on the auth.users INSERT trigger to link
 * the new user to the matching pending row.
 */
/**
 * Guest role = read-only (founder decision, 2026-07-23): guests can see the
 * whole workspace but cannot create, edit, complete, or delete activities.
 * Owners, admins, and members can all act. Callers pass the workspace the
 * mutation targets; an unknown membership is treated as read-only.
 */
export function isReadOnlyWorkspaceMember(
  access: WorkspaceAccessContext,
  workspaceId: string
): boolean {
  const membership = access.memberships.find((member) => member.workspaceId === workspaceId);
  if (!membership) return true;
  return membership.role === 'guest';
}

export function buildReadOnlyResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Your role on this team is view-only.' },
    { status: 403 }
  );
}

export function buildInviteUrl(token: string): string {
  return `${resolveAppBaseUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
}

/** Short presentable form for join-code links: /join/<code> (founder
 * request, 2026-07-23 — Linear-style). The route redirects into the same
 * /invite/accept flow. */
export function buildJoinUrl(code: string): string {
  return `${resolveAppBaseUrl()}/join/${encodeURIComponent(code)}`;
}

/** Curator invite links: /curator/join/<code>. Kept here so every invite URL
 * in the product resolves its base the same way, including the canonical-domain
 * fallback that stops a link pointing at an SSO-walled deployment host. */
export function buildCuratorJoinUrl(code: string): string {
  return `${resolveAppBaseUrl()}/curator/join/${encodeURIComponent(code)}`;
}

export function buildWorkspaceMembersResponse(
  workspace: Workspace,
  members: WorkspaceMember[]
): WorkspaceMembersResponse {
  return {
    workspace,
    members,
  };
}

export function normalizeTaskFilters(searchParams: URLSearchParams): TaskFilters {
  const releaseId = readNullableString(searchParams.get('release'));
  const priority = readString(searchParams.get('priority'));
  const status = readString(searchParams.get('status'));
  const sort = readString(searchParams.get('sort'));

  return {
    releaseId,
    priority: TASK_PRIORITY_SET.has(priority as TaskPriority) ? (priority as TaskPriority) : '',
    status: TASK_STATUS_SET.has(status as TaskStatus) ? (status as TaskStatus) : '',
    sort:
      sort === 'priority' ||
      sort === 'assignee' ||
      sort === 'status' ||
      sort === 'created_at' ||
      sort === 'due_date'
        ? (sort as TaskSortKey)
        : undefined,
  };
}

export function buildTaskMetadata(input: TaskContextLink): Record<string, unknown> {
  return {
    folderItemId: input.folderItemId || null,
    trackId: input.trackId || null,
  };
}

export function buildStoragePathForTaskAttachment(
  userId: string,
  taskId: string,
  fileName: string
): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() || 'bin' : 'bin';
  return `${userId}/${taskId}/${Date.now()}-${randomUUID()}.${extension}`;
}
