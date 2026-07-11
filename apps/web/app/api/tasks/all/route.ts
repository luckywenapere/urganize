import { NextRequest, NextResponse } from 'next/server';
import { sortTasks, type AllTasksResponse } from '@/lib/tasks';
import {
  buildTaskSchemaResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  normalizeTaskFilters,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const taskService = new TaskService(adminClient);

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;

    if (!workspaceId) {
      const empty: AllTasksResponse = { grouped: [] };
      return NextResponse.json(empty);
    }

    const filters = normalizeTaskFilters(request.nextUrl.searchParams);
    const tasks = sortTasks(
      await taskService.getWorkspaceTasks(workspaceId, auth.user.id, filters),
      filters.sort || 'due_date'
    );

    const groupedMap = new Map<string, AllTasksResponse['grouped'][number]>();
    for (const task of tasks) {
      const groupKey = task.release?.id || 'no-release';
      const existing = groupedMap.get(groupKey);
      if (existing) {
        existing.tasks.push(task);
        continue;
      }

      groupedMap.set(groupKey, {
        release: task.release || null,
        tasks: [task],
      });
    }

    const grouped = Array.from(groupedMap.values()).sort((left, right) => {
      if (!left.release && right.release) return 1;
      if (left.release && !right.release) return -1;
      return (left.release?.title || '').localeCompare(right.release?.title || '');
    });

    return NextResponse.json({
      grouped,
      filters,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load tasks.' },
      { status: 500 }
    );
  }
}
