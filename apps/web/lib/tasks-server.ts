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

export const WORKSPACES_TABLE = 'workspaces';
export const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
export const TASK_GROUPS_TABLE = 'task_groups';
export const TASKS_TABLE = 'tasks';
export const TASK_COMMENTS_TABLE = 'task_comments';
export const TASK_ATTACHMENTS_TABLE = 'task_attachments';
export const TASK_ACTIVITY_TABLE = 'task_activity';
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
};

const TASK_STATUS_SET = new Set<TaskStatus>([
  'locked',
  'backlog',
  'todo',
  'in_progress',
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
const readTaskType = (metadata: unknown): 'task' | 'event_milestone' => {
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

// Reads the compressed-runway flag out of metadata.template.compressed_runway.
// Defaults to false for rows that predate this flag — legacy template tasks
// that are past-due fall through to the standard overdue treatment rather
// than being silently retroactively reclassified as catch-up.
const readCompressedRunway = (metadata: unknown): boolean => {
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

  const emailHandle = readString(user.email).split('@')[0] || 'Workspace';
  return `${emailHandle}'s Workspace`;
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

async function loadProfilesByIds(
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

export async function ensureOwnedWorkspace(
  adminClient: SupabaseClient,
  owner: DatabaseUser
): Promise<WorkspaceRow> {
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

    const insertResult = await adminClient
      .from(WORKSPACES_TABLE)
      .insert({
        owner_id: owner.id,
        name: createWorkspaceName(owner, organization?.name || null),
        updated_at: createdAt,
      })
      .select('id,owner_id,name,created_at,updated_at')
      .maybeSingle();

    if (insertResult.error || !insertResult.data) {
      throw insertResult.error || new Error('Could not create workspace.');
    }

    workspace = insertResult.data as WorkspaceRow;
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

export async function activatePendingWorkspaceInvitesForUser(
  adminClient: SupabaseClient,
  user: DatabaseUser
) {
  const email = normalizeEmail(user.email);
  if (!email) {
    return;
  }

  const existingRowsResult = await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,status,joined_at')
    .eq('email', email)
    .neq('status', 'removed');

  if (existingRowsResult.error || !Array.isArray(existingRowsResult.data)) {
    return;
  }

  const pendingRows = existingRowsResult.data.filter((row) => !readString(row.user_id));
  if (!pendingRows.length) {
    return;
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
}

export async function loadWorkspaceAccessContext(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<WorkspaceAccessContext> {
  try {
    await ensureOwnedWorkspace(adminClient, user);
  } catch (error) {
    if (!isTaskSchemaMissingError(error)) {
      throw error;
    }
  }

  await activatePendingWorkspaceInvitesForUser(adminClient, user);

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

  const workspaceResult = workspaceIds.length
    ? await adminClient
        .from(WORKSPACES_TABLE)
        .select('id,owner_id,name,created_at,updated_at')
        .in('id', workspaceIds)
    : { data: [], error: null };

  if (workspaceResult.error) {
    throw workspaceResult.error;
  }

  const profileById = await loadProfilesByIds(
    adminClient,
    membershipRows.map((row) => row.user_id || '').filter(Boolean)
  );

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

  const primaryMembership = memberships[0] || null;
  const primaryWorkspace = primaryMembership
    ? toWorkspace(workspaceById.get(primaryMembership.workspaceId) as WorkspaceRow)
    : null;

  return {
    memberships,
    workspaceIds: memberships.map((member) => member.workspaceId),
    membershipIds: memberships.map((member) => member.id),
    primaryWorkspaceId: primaryMembership?.workspaceId || null,
    primaryWorkspace,
  };
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
  currentUserId: string
): Promise<Task[]> {
  const releaseById = await loadReleaseSummaries(
    adminClient,
    rows.map((row) => row.release_id || '').filter(Boolean)
  );
  const groupById = await loadTaskGroups(
    adminClient,
    rows.map((row) => row.group_id || '').filter(Boolean)
  );

  const workspaceIds = Array.from(new Set(rows.map((row) => row.workspace_id).filter(Boolean)));
  const memberById = new Map<string, WorkspaceMember>();
  const memberByUserId = new Map<string, WorkspaceMember>();

  for (const workspaceId of workspaceIds) {
    const members = await loadWorkspaceMembers(adminClient, workspaceId, currentUserId);
    for (const member of members) {
      memberById.set(member.id, member);
      if (member.userId) {
        memberByUserId.set(member.userId, member);
      }
    }
  }

  const [commentCountByTaskId, attachmentCountByTaskId] = await Promise.all([
    loadTaskCounts(adminClient, TASK_COMMENTS_TABLE, rows.map((row) => row.id)),
    loadTaskCounts(adminClient, TASK_ATTACHMENTS_TABLE, rows.map((row) => row.id)),
  ]);

  return rows.map((row) =>
    toTask(row, releaseById, groupById, memberByUserId, memberById, commentCountByTaskId, attachmentCountByTaskId)
  );
}

export async function ensureWorkspaceAccess(
  adminClient: SupabaseClient,
  workspaceId: string,
  user: DatabaseUser
): Promise<{ access: WorkspaceAccessContext } | { error: NextResponse }> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  if (!access.workspaceIds.includes(workspaceId)) {
    return { error: NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }) };
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
    return { error: NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }) };
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

  return { task: result.data as TaskRow, access };
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
    .select('id,title,artist_name,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (releaseResult.error || !releaseResult.data) {
    throw releaseResult.error || new Error('Release not found.');
  }

  const release = releaseResult.data as ReleaseRow;
  const ownerId = release.owner_user_id || '';
  const ownerWorkspaceMembership =
    access.memberships.find((member) => member.userId === ownerId && member.role === 'owner') ||
    access.memberships.find((member) => member.userId === ownerId);

  if (!ownerWorkspaceMembership?.workspaceId) {
    throw new Error('Release workspace not found.');
  }

  await createDefaultReleaseTaskGroups(adminClient, ownerWorkspaceMembership.workspaceId, releaseId);

  return {
    release: {
      id: release.id,
      title: release.title,
      artistName: release.artist_name,
    },
    workspaceId: ownerWorkspaceMembership.workspaceId,
    members: await loadWorkspaceMembers(adminClient, ownerWorkspaceMembership.workspaceId, user.id),
  };
}

export async function loadReleaseTaskBoard(
  adminClient: SupabaseClient,
  releaseId: string,
  user: DatabaseUser
): Promise<ReleaseTasksResponse> {
  const context = await resolveReleaseTaskWorkspace(adminClient, releaseId, user);

  const groupsResult = await adminClient
    .from(TASK_GROUPS_TABLE)
    .select('id,workspace_id,release_id,name,position,created_at,updated_at')
    .eq('workspace_id', context.workspaceId)
    .eq('release_id', releaseId)
    .order('position', { ascending: true });

  if (groupsResult.error) {
    throw groupsResult.error;
  }

  const taskRowsResult = await adminClient
    .from(TASKS_TABLE)
    .select(TASKS_SELECT_COLUMNS)
    .eq('workspace_id', context.workspaceId)
    .eq('release_id', releaseId)
    .order('position', { ascending: true });

  if (taskRowsResult.error) {
    throw taskRowsResult.error;
  }

  const groups = Array.isArray(groupsResult.data)
    ? (groupsResult.data as TaskGroupRow[]).map((row) => toTaskGroup(row))
    : [];
  const tasks = await loadTasks(
    adminClient,
    Array.isArray(taskRowsResult.data) ? (taskRowsResult.data as TaskRow[]) : [],
    user.id
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

export async function loadTaskDetail(
  adminClient: SupabaseClient,
  taskRow: TaskRow,
  currentUserId: string
): Promise<TaskDetail> {
  const [tasks, comments, attachments, activity] = await Promise.all([
    loadTasks(adminClient, [taskRow], currentUserId),
    loadTaskComments(adminClient, taskRow.id, currentUserId),
    loadTaskAttachments(adminClient, taskRow.id),
    loadTaskActivity(adminClient, taskRow.id),
  ]);

  const task = tasks[0];
  return {
    ...task,
    comments,
    attachments,
    activity,
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

export async function createTaskNotification(
  adminClient: SupabaseClient,
  input: {
    userId: string | null;
    type: NotificationType;
    taskId: string;
    actorId?: string | null;
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

  await adminClient.from(NOTIFICATIONS_TABLE).insert({
    user_id: input.userId,
    type: input.type,
    task_id: input.taskId,
    actor_id: input.actorId || null,
  });
}

export async function createDueDateNotifications(
  adminClient: SupabaseClient,
  user: DatabaseUser,
  access: WorkspaceAccessContext
) {
  if (!access.membershipIds.length) {
    return;
  }

  const result = await adminClient
    .from(TASKS_TABLE)
    .select('id,assigned_to_user_id,due_date,status')
    .eq('assigned_to_user_id', user.id)
    .not('due_date', 'is', null);

  if (result.error || !Array.isArray(result.data)) {
    return;
  }

  const now = Date.now();
  const in24Hours = now + 24 * 60 * 60 * 1000;

  for (const row of result.data) {
    const taskId = readString((row as { id?: string }).id);
    const dueDateRaw = readNullableString((row as { due_date?: string }).due_date);
    const status = normalizeTaskStatus((row as { status?: string }).status);

    if (!taskId || !dueDateRaw || status === 'done' || status === 'cancelled') {
      continue;
    }

    const dueDate = new Date(dueDateRaw).getTime();
    if (!Number.isFinite(dueDate)) {
      continue;
    }

    if (dueDate < now) {
      await createTaskNotification(adminClient, {
        userId: user.id,
        type: 'task_overdue',
        taskId,
      });
      continue;
    }

    if (dueDate <= in24Hours) {
      await createTaskNotification(adminClient, {
        userId: user.id,
        type: 'task_due_soon',
        taskId,
      });
    }
  }
}

export async function listNotifications(
  adminClient: SupabaseClient,
  user: DatabaseUser
): Promise<TaskNotification[]> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  await createDueDateNotifications(adminClient, user, access);

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

function resolveAppBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
  if (appUrl) return appUrl.replace(/\/$/, '');
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
export function buildInviteUrl(token: string): string {
  return `${resolveAppBaseUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
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
