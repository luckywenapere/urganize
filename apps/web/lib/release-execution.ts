import { RELEASE_PIPELINE_STATES, type ReleasePipelineState } from '@/types/releases';
import {
  TASK_DONE_STATUS,
  TASK_LOCKED_STATUS,
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
  if (task.status === TASK_LOCKED_STATUS) {
    return 'Complete the dependency chain first.';
  }

  const dependencyTitles = task.dependencies
    .map((id) => tasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is ExecutionTask => Boolean(candidate))
    .filter((candidate) => candidate.status !== TASK_DONE_STATUS)
    .map((candidate) => candidate.title);

  if (dependencyTitles.length > 0) {
    return `Waiting on ${dependencyTitles.join(', ')}.`;
  }

  if (!isRequirementSatisfied(task.requirement)) {
    return task.requirement?.spec || 'Complete the required proof before marking this done.';
  }

  return null;
}
