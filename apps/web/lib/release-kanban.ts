import type { Task, TaskGroup } from '@/lib/tasks';

export const RELEASE_OPERATION_STAGES = [
  'PREP',
  'DISTRIBUTION',
  'CONTENT',
  'MARKETING',
  'RELEASE DAY',
  'POST RELEASE',
] as const;

export type ReleaseOperationStage = (typeof RELEASE_OPERATION_STAGES)[number];

export type KanbanTaskPatch = {
  status?: Task['status'];
  assignedTo?: string | null;
  dueDate?: string | null;
};

export type ReleaseKanbanColumn = {
  stage: ReleaseOperationStage;
  group: TaskGroup;
  tasks: Task[];
};

export function isReleaseOperationStage(value: string): value is ReleaseOperationStage {
  return RELEASE_OPERATION_STAGES.includes(value as ReleaseOperationStage);
}

export function sortKanbanGroups(groups: TaskGroup[]) {
  const byName = new Map(groups.map((group) => [group.name.toUpperCase(), group]));

  return RELEASE_OPERATION_STAGES.map((stage) => byName.get(stage)).filter(Boolean) as TaskGroup[];
}

export function buildKanbanColumns(tasks: Task[], groups: TaskGroup[]): ReleaseKanbanColumn[] {
  const stageGroups = sortKanbanGroups(groups);

  return stageGroups.map((group) => ({
    stage: group.name.toUpperCase() as ReleaseOperationStage,
    group,
    tasks: tasks
      .filter((task) => task.groupId === group.id)
      .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt)),
  }));
}

export function moveTaskAcrossColumns({
  tasks,
  groups,
  draggedTaskId,
  targetGroupId,
  targetTaskId,
}: {
  tasks: Task[];
  groups: TaskGroup[];
  draggedTaskId: string;
  targetGroupId: string;
  targetTaskId?: string;
}) {
  const draggedTask = tasks.find((task) => task.id === draggedTaskId);
  const targetGroup = groups.find((group) => group.id === targetGroupId);
  if (!draggedTask || !targetGroup) {
    return tasks;
  }

  const tasksByGroup = new Map<string, Task[]>();
  for (const group of groups) {
    tasksByGroup.set(
      group.id,
      tasks
        .filter((task) => task.groupId === group.id && task.id !== draggedTaskId)
        .sort((left, right) => left.position - right.position)
    );
  }

  const targetTasks = tasksByGroup.get(targetGroupId) || [];
  const targetIndex = targetTaskId ? targetTasks.findIndex((task) => task.id === targetTaskId) : -1;
  const insertAt = targetIndex >= 0 ? targetIndex : targetTasks.length;

  targetTasks.splice(insertAt, 0, {
    ...draggedTask,
    groupId: targetGroupId,
    group: targetGroup,
  });
  tasksByGroup.set(targetGroupId, targetTasks);

  const movedIds = new Set<string>();
  const movedTasks = groups.flatMap((group) =>
    (tasksByGroup.get(group.id) || []).map((task, position) => {
      movedIds.add(task.id);
      return {
        ...task,
        groupId: group.id,
        group,
        position,
      };
    })
  );

  return [
    ...movedTasks,
    ...tasks.filter((task) => !movedIds.has(task.id) && task.id !== draggedTaskId),
  ];
}
