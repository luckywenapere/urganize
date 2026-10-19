import { RELEASE_PIPELINE_STATES, type ReleasePipelineState } from '@/types/releases';
import {
  PITCH_BLOCKED_COPY,
  isDistributionOrderTask,
  isEditorialPitchTask,
} from '@/lib/editorial-pitch';
import {
  TASK_LOCKED_STATUS,
  isDependencySatisfied,
  type ExecutionTask,
  type TaskRequirement,
} from '@/lib/execution-types';

export function formatArtistName(name: string): string {
  if (!name) return '';
  if (name.includes(' ')) return name;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').trim();
}

export function cleanTaskTitle(title: string): string {
  return title.replace(/^AI Action:\s*/i, '').trim();
}

export function formatReleaseTitle(title: string): string {
  if (!title) return '';
  if (title.startsWith('REL_')) {
    return title.slice(4).replace(/_/g, ' ').trim();
  }
  return title;
}

export function normalizePipelineState(value: unknown): ReleasePipelineState {
  const normalized = String(value || '').trim().toLowerCase();
  return RELEASE_PIPELINE_STATES.includes(normalized as ReleasePipelineState)
    ? (normalized as ReleasePipelineState)
    : 'idea';
}

export function isRequirementSatisfied(requirement: TaskRequirement | null | undefined): boolean {
  return !requirement || requirement.satisfied === true;
}

export function getTaskCompletionBlocker(task: ExecutionTask, tasks: ExecutionTask[]): string | null {
  const knownDependencies = task.dependencies
    .map((id) => tasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is ExecutionTask => Boolean(candidate));
  // Done or cancelled prerequisites hold nothing up (URG-389): a dropped
  // prerequisite must not keep this task waiting forever.
  const openDependencies = knownDependencies.filter((candidate) => !isDependencySatisfied(candidate.status));

  // A locked task stays locked while anything it waits on is open, or when we
  // cannot see its prerequisites at all. Once every one is done or cancelled
  // it may be finished even if the stored status has not caught up yet.
  if (
    task.status === TASK_LOCKED_STATUS &&
    (openDependencies.length > 0 || knownDependencies.length === 0)
  ) {
    return 'Complete the dependency chain first.';
  }

  if (openDependencies.length > 0) {
    // Spotify takes a pitch only after the distributor has delivered, so the
    // pitch says that instead of naming the upload step.
    if (
      isEditorialPitchTask(task.templateTaskId) &&
      openDependencies.some((candidate) => isDistributionOrderTask(candidate.templateTaskId))
    ) {
      return PITCH_BLOCKED_COPY;
    }
    return `Waiting on ${openDependencies.map((candidate) => candidate.title).join(', ')}.`;
  }

  if (!isRequirementSatisfied(task.requirement)) {
    return task.requirement?.spec || 'Complete the required proof before marking this done.';
  }

  return null;
}

/**
 * The one line under "Depends on" in the activity pop-up (URG-389): what still
 * has to be finished, or that a cancelled prerequisite no longer holds this up,
 * or nothing when every prerequisite is done. A prerequisite we cannot see
 * (null) counts as open, as getTaskCompletionBlocker's caller would.
 */
export function dependencyHint(statuses: ReadonlyArray<string | null>): string {
  if (statuses.some((status) => status === null || !isDependencySatisfied(status))) {
    return 'Finish each prerequisite before this task can be marked done.';
  }
  if (statuses.some((status) => status === 'cancelled')) {
    return 'A cancelled prerequisite no longer holds this up.';
  }
  return '';
}
