import {
  RELEASE_PIPELINE_STATES,
  TASK_DONE_STATUS,
  TASK_LOCKED_STATUS,
  type ExecutionRelease,
  type ExecutionTask,
  type ReleasePipelineState,
  type TaskRequirement,
} from '@/lib/execution-types';

const STATE_LABELS: Record<ReleasePipelineState, string> = {
  idea: 'Idea',
  planning: 'Planning',
  asset_prep: 'Asset Prep',
  distribution: 'Distribution',
  campaign: 'Campaign',
  post_release: 'Post Release',
};

export function getPipelineStateLabel(state: ReleasePipelineState): string {
  return STATE_LABELS[state] || 'Idea';
}

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

export function getPipelineStateIndex(state: ReleasePipelineState): number {
  return Math.max(0, RELEASE_PIPELINE_STATES.indexOf(state));
}

export function getNextPipelineState(state: ReleasePipelineState): ReleasePipelineState | null {
  const next = RELEASE_PIPELINE_STATES[getPipelineStateIndex(state) + 1];
  return next || null;
}

export function canOpenPipelineState(current: ReleasePipelineState, target: ReleasePipelineState): boolean {
  return getPipelineStateIndex(target) <= getPipelineStateIndex(current);
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

export function calculateReadinessForState(
  tasks: ExecutionTask[],
  state: ReleasePipelineState
): number {
  const requiredTasks = tasks.filter((task) => task.state === state && task.requirement);
  if (requiredTasks.length === 0) {
    return tasks.some((task) => task.state === state) ? 0 : 100;
  }

  const completedRequiredTasks = requiredTasks.filter((task) => task.status === TASK_DONE_STATUS);
  return Math.round((completedRequiredTasks.length / requiredTasks.length) * 100);
}

export function calculateOverallReadiness(tasks: ExecutionTask[]): number {
  const requiredTasks = tasks.filter((task) => task.requirement);
  if (requiredTasks.length === 0) return 0;
  return Math.round((requiredTasks.filter((task) => task.status === TASK_DONE_STATUS).length / requiredTasks.length) * 100);
}

export function selectPrimaryRelease(releases: ExecutionRelease[], tasks: ExecutionTask[]): ExecutionRelease | null {
  if (releases.length === 0) return null;
  const now = Date.now();

  return [...releases].sort((left, right) => {
    const leftIncomplete = calculateOverallReadiness(tasks.filter((task) => task.releaseId === left.id)) < 100 ? 0 : 1;
    const rightIncomplete = calculateOverallReadiness(tasks.filter((task) => task.releaseId === right.id)) < 100 ? 0 : 1;
    if (leftIncomplete !== rightIncomplete) return leftIncomplete - rightIncomplete;

    const leftDate = left.releaseDate ? new Date(left.releaseDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDate = right.releaseDate ? new Date(right.releaseDate).getTime() : Number.POSITIVE_INFINITY;
    const leftDistance = Number.isFinite(leftDate) ? Math.abs(leftDate - now) : Number.POSITIVE_INFINITY;
    const rightDistance = Number.isFinite(rightDate) ? Math.abs(rightDate - now) : Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  })[0];
}

export function buildReleaseWarnings(release: ExecutionRelease, tasks: ExecutionTask[]): string[] {
  const releaseTasks = tasks.filter((task) => task.releaseId === release.id);
  const now = Date.now();
  const warnings: string[] = [];

  if (releaseTasks.some((task) => task.state === 'asset_prep' && task.requirement?.type === 'file_upload' && task.status !== TASK_DONE_STATUS)) {
    warnings.push('Missing artwork or asset upload');
  }

  if (releaseTasks.some((task) => task.dueDate && new Date(task.dueDate).getTime() < now && task.status !== TASK_DONE_STATUS)) {
    warnings.push('Overdue task');
  }

  if (release.releaseDate) {
    const daysUntilRelease = Math.ceil((new Date(release.releaseDate).getTime() - now) / 86400000);
    if (daysUntilRelease <= 7 && daysUntilRelease >= 0) {
      warnings.push(`Release date in ${daysUntilRelease} day${daysUntilRelease === 1 ? '' : 's'}`);
    }
  }

  return warnings;
}
