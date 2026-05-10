'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@urganize/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { KanbanTaskCard } from '@/components/tasks/KanbanTaskCard';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import {
  buildKanbanColumns,
  moveTaskAcrossColumns,
  RELEASE_OPERATION_STAGES,
  type KanbanTaskPatch,
} from '@/lib/release-kanban';
import { getTaskStatusLabel, type ReleaseTasksResponse, type Task } from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type ReleaseOperationsBoardProps = {
  board: ReleaseTasksResponse;
  onBoardChange: (board: ReleaseTasksResponse) => void;
  onError: (message: string) => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function getColumnMeta(stage: string) {
  switch (stage) {
    case 'PREP':
      return { helper: 'Metadata, assets, collaborators', accent: 'bg-phase-preproduction' };
    case 'DISTRIBUTION':
      return { helper: 'DSP setup, links, delivery', accent: 'bg-phase-distribution' };
    case 'CONTENT':
      return { helper: 'Creative, short-form, copy', accent: 'bg-status-info' };
    case 'MARKETING':
      return { helper: 'Campaign, pitching, partners', accent: 'bg-phase-promotion' };
    case 'RELEASE DAY':
      return { helper: 'Launch-day checks', accent: 'bg-brand' };
    default:
      return { helper: 'Reporting and next moves', accent: 'bg-content-secondary' };
  }
}

export function ReleaseOperationsBoard({ board, onBoardChange, onError }: ReleaseOperationsBoardProps) {
  const { openTask, openQuickCreate } = useTaskUI();
  const [draggedTaskId, setDraggedTaskId] = useState('');
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const columns = useMemo(() => buildKanbanColumns(board.tasks, board.groups), [board.groups, board.tasks]);
  const missingStages = RELEASE_OPERATION_STAGES.filter(
    (stage) => !board.groups.some((group) => group.name.toUpperCase() === stage)
  );

  const patchTask = async (taskId: string, patch: KanbanTaskPatch) => {
    const previousTasks = board.tasks;
    const nextTasks = board.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: patch.status || task.status,
            assignedTo: patch.assignedTo === undefined ? task.assignedTo : patch.assignedTo,
            dueDate: patch.dueDate === undefined ? task.dueDate : patch.dueDate,
          }
        : task
    );

    onBoardChange({ ...board, tasks: nextTasks });
    setSavingTaskIds((current) => new Set(current).add(taskId));

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });

      const payload = (await response.json().catch(() => ({}))) as { task?: Task; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not update task.');
      }

      if (payload.task) {
        onBoardChange({
          ...board,
          tasks: nextTasks.map((task) => (task.id === taskId ? payload.task as Task : task)),
        });
      }

      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (error) {
      onBoardChange({ ...board, tasks: previousTasks });
      onError(error instanceof Error ? error.message : 'Could not update task.');
    } finally {
      setSavingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  const persistMove = async (nextTasks: Task[]) => {
    const previousTasks = board.tasks;
    onBoardChange({ ...board, tasks: nextTasks });

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/tasks/reorder', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: nextTasks.map((task) => ({
            id: task.id,
            groupId: task.groupId,
            position: task.position,
          })),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not move task.');
      }

      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (error) {
      onBoardChange({ ...board, tasks: previousTasks });
      onError(error instanceof Error ? error.message : 'Could not move task.');
    }
  };

  const moveTask = (targetGroupId: string, targetTaskId?: string) => {
    if (!draggedTaskId) {
      return;
    }

    const nextTasks = moveTaskAcrossColumns({
      tasks: board.tasks,
      groups: board.groups,
      draggedTaskId,
      targetGroupId,
      targetTaskId,
    });
    setDraggedTaskId('');
    void persistMove(nextTasks);
  };

  if (missingStages.length > 0) {
    return (
      <div className="border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Release operation stages are incomplete.</p>
            <p className="mt-1 text-status-error/80">Missing stages: {missingStages.join(', ')}.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1180px] grid-cols-6 gap-3 xl:min-w-0">
        {columns.map((column) => {
          const meta = getColumnMeta(column.stage);
          const doneCount = column.tasks.filter((task) => task.status === 'done').length;

          return (
            <section
              key={column.group.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveTask(column.group.id);
              }}
              className="flex max-h-[calc(100vh-220px)] min-h-[560px] flex-col border border-stroke-default bg-bg-surface"
            >
              <div className={`h-1 ${meta.accent}`} />
              <header className="border-b border-stroke-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-content-primary">{column.stage}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-content-tertiary">{meta.helper}</p>
                  </div>
                  <span className="shrink-0 border border-stroke-default bg-bg-elevated px-2 py-1 text-xs text-content-secondary">
                    {column.tasks.length}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-content-secondary">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
                  {doneCount} {getTaskStatusLabel('done').toLowerCase()}
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {column.tasks.length === 0 ? (
                  <div className="flex min-h-48 items-center justify-center border border-dashed border-stroke-default bg-bg-elevated/40 p-4 text-center">
                    <EmptyState
                      title="No tasks"
                      description="Drag work here or add a task for this stage."
                      className="border-0 bg-transparent p-0"
                    />
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <div key={task.id} className={savingTaskIds.has(task.id) ? 'pointer-events-none opacity-70' : ''}>
                      <KanbanTaskCard
                        task={task}
                        members={board.members}
                        isDragging={draggedTaskId === task.id}
                        onOpen={(task) => openTask(task.id)}
                        onPatch={patchTask}
                        onDragStart={setDraggedTaskId}
                        onDragEnd={() => setDraggedTaskId('')}
                        onDropOnTask={(targetTaskId) => moveTask(column.group.id, targetTaskId)}
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-stroke-subtle p-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full rounded-none"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => openQuickCreate({ releaseId: board.release.id, groupId: column.group.id, source: 'inline' })}
                >
                  Add task
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
