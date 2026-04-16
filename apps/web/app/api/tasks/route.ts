import { NextRequest, NextResponse } from 'next/server';
import { groupTasksIntoSections } from '@/lib/tasks';
import {
  TASKS_TABLE,
  TASK_GROUPS_TABLE,
  buildTaskMetadata,
  buildTaskSchemaResponse,
  createAdminClient,
  createDefaultReleaseTaskGroups,
  ensureWorkspaceAccess,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTaskDetail,
  loadTasks,
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
  type TaskRow,
} from '@/lib/tasks-server';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

type CreateTaskBody = {
  title?: unknown;
  workspaceId?: unknown;
  releaseId?: unknown;
  groupId?: unknown;
  assignedTo?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  description?: unknown;
  folderItemId?: unknown;
  trackId?: unknown;
  source?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();
const readNullableString = (value: unknown): string | null => {
  const normalized = readString(value);
  return normalized || null;
};

const normalizePriority = (value: unknown) => {
  const normalized = readString(value);
  if (normalized === 'urgent' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }

  return 'none';
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.membershipIds.length) {
      return NextResponse.json({ tasks: [], sections: groupTasksIntoSections([]) });
    }

    const releaseId = readNullableString(request.nextUrl.searchParams.get('release'));
    const priority = readString(request.nextUrl.searchParams.get('priority'));
    const status = readString(request.nextUrl.searchParams.get('status'));

    let query = adminClient
      .from(TASKS_TABLE)
      .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,metadata,created_at,updated_at')
      .in('assigned_to', access.membershipIds)
      .in('workspace_id', access.workspaceIds)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('position', { ascending: true });

    if (releaseId) {
      query = query.eq('release_id', releaseId);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const result = await query;
    if (result.error) {
      if (isTaskSchemaMissingError(result.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: result.error.message || 'Could not load tasks.' }, { status: 500 });
    }

    const tasks = await loadTasks(
      adminClient,
      Array.isArray(result.data) ? (result.data as TaskRow[]) : [],
      auth.user.id
    );
    const createdTasksResult = await adminClient
      .from(TASKS_TABLE)
      .select('id', { count: 'exact', head: true })
      .in('workspace_id', access.workspaceIds)
      .eq('created_by', auth.user.id);

    const createdTaskCount =
      createdTasksResult.error || typeof createdTasksResult.count !== 'number'
        ? 0
        : createdTasksResult.count;

    return NextResponse.json({
      tasks,
      sections: groupTasksIntoSections(tasks),
      createdTaskCount,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load tasks.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateTaskBody;
    const title = readString(body.title);
    const releaseId = readNullableString(body.releaseId);
    let groupId = readNullableString(body.groupId);
    const dueDate = readNullableString(body.dueDate);
    const priority = normalizePriority(body.priority);
    const description = readNullableString(body.description);
    const assignedTo = readNullableString(body.assignedTo);
    const source = readString(body.source) || 'quick_create';

    if (!title) {
      return NextResponse.json({ error: 'Task title is required.' }, { status: 400 });
    }

    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = readNullableString(body.workspaceId) || access.primaryWorkspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const workspaceAccess = await ensureWorkspaceAccess(adminClient, workspaceId, auth.user);
    if ('error' in workspaceAccess) {
      return workspaceAccess.error;
    }

    const members = await loadWorkspaceMembers(adminClient, workspaceId, auth.user.id);
    const activeAssignee =
      assignedTo ? members.find((member) => member.id === assignedTo && member.status === 'active') || null : null;

    if (assignedTo && !activeAssignee) {
      return NextResponse.json({ error: 'Only active workspace members can be assigned.' }, { status: 400 });
    }

    if (releaseId && !groupId) {
      await createDefaultReleaseTaskGroups(adminClient, workspaceId, releaseId);

      const defaultGroupResult = await adminClient
        .from(TASK_GROUPS_TABLE)
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('release_id', releaseId)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultGroupResult.error && !isTaskSchemaMissingError(defaultGroupResult.error)) {
        return NextResponse.json(
          { error: defaultGroupResult.error.message || 'Could not prepare task groups.' },
          { status: 500 }
        );
      }

      groupId = readNullableString(defaultGroupResult.data?.id);
    }

    if (groupId) {
      const groupResult = await adminClient
        .from(TASK_GROUPS_TABLE)
        .select('id,workspace_id,release_id')
        .eq('id', groupId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (groupResult.error) {
        return NextResponse.json({ error: groupResult.error.message || 'Could not load task group.' }, { status: 500 });
      }

      if (!groupResult.data) {
        return NextResponse.json({ error: 'Task group not found.' }, { status: 404 });
      }
    }

    const positionResult = await adminClient
      .from(TASKS_TABLE)
      .select('position')
      .eq('workspace_id', workspaceId)
      .eq(groupId ? 'group_id' : 'release_id', groupId || releaseId || null)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (positionResult.error && !isTaskSchemaMissingError(positionResult.error)) {
      return NextResponse.json(
        { error: positionResult.error.message || 'Could not determine task order.' },
        { status: 500 }
      );
    }

    const nextPosition = Number(positionResult.data?.position || 0) + 1;

    const insertResult = await adminClient
      .from(TASKS_TABLE)
      .insert({
        workspace_id: workspaceId,
        group_id: groupId,
        release_id: releaseId,
        created_by: auth.user.id,
        assigned_to: activeAssignee?.id || null,
        title,
        description,
        status: 'todo',
        priority,
        due_date: dueDate,
        position: nextPosition,
        metadata: buildTaskMetadata({
          folderItemId: readNullableString(body.folderItemId),
          trackId: readNullableString(body.trackId),
        }),
        updated_at: new Date().toISOString(),
      })
      .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,metadata,created_at,updated_at')
      .maybeSingle();

    if (insertResult.error || !insertResult.data) {
      if (isTaskSchemaMissingError(insertResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: insertResult.error?.message || 'Could not create task.' },
        { status: 500 }
      );
    }

    const createdTask = insertResult.data as TaskRow;
    const task = await loadTaskDetail(adminClient, createdTask, auth.user.id);

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('task_created', {
        release_id: releaseId,
        has_assignee: Boolean(activeAssignee),
        has_due_date: Boolean(dueDate),
        priority,
        source:
          source === 'inline' || source === 'detail_panel' || source === 'onboarding'
            ? source
            : 'quick_create',
      })
    );

    if (activeAssignee?.userId) {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('task_assigned', {
          task_id: createdTask.id,
          assigned_to_self: activeAssignee.userId === auth.user.id,
        })
      );
    }

    return NextResponse.json({ task });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
