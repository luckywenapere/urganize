import type { AISignal, ExecutionRelease, ExecutionTask, ReleasePipelineState } from '@/lib/execution-types';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { calculateReadinessForState, formatArtistName, getPipelineStateLabel } from '@/lib/release-execution';

const makeId = () => `signal_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export function requestMockAISignals({
  releases,
  tasks,
  releaseId,
  state,
}: {
  releases: ExecutionRelease[];
  tasks: ExecutionTask[];
  releaseId?: string | null;
  state?: ReleasePipelineState | null;
}): Promise<AISignal[]> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const now = Date.now();
      const signals: AISignal[] = [];
      const scopedReleases = releaseId ? releases.filter((release) => release.id === releaseId) : releases;

      for (const release of scopedReleases) {
        const releaseTasks = tasks.filter((task) => task.releaseId === release.id);
        const daysUntilRelease = release.releaseDate
          ? Math.ceil((new Date(release.releaseDate).getTime() - now) / 86400000)
          : null;
        const readinessScore = calculateReadinessForState(releaseTasks, release.state);
        const stateLabel = getPipelineStateLabel(release.state);
        const formattedDate = release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'no date set';

        if (daysUntilRelease !== null && daysUntilRelease <= 5 && daysUntilRelease >= 0) {
          signals.push({
            id: makeId(),
            releaseId: release.id,
            state: release.state,
            severity: 'critical',
            title: 'Release date is close',
            message: `Due on ${formattedDate} (${daysUntilRelease} day${daysUntilRelease === 1 ? '' : 's'}). Current state: ${stateLabel} (${readinessScore}%). Tighten the next action queue.`,
            actionLabel: 'Generate Plan',
            createdAt: new Date().toISOString(),
          });
        }

        const hasCampaignTask = releaseTasks.some((task) => task.state === 'campaign');
        if ((state || release.state) === 'campaign' && !hasCampaignTask) {
          signals.push({
            id: makeId(),
            releaseId: release.id,
            state: 'campaign',
            severity: 'warning',
            title: 'Campaign not started',
            message: `No campaign execution task exists yet. Readiness is at ${readinessScore}%. Generate one before rollout windows close.`,
            actionLabel: 'Generate Plan',
            createdAt: new Date().toISOString(),
          });
        }

        const missingAsset = releaseTasks.find(
          (task) => task.state === 'asset_prep' && task.requirement?.type === 'file_upload' && task.status !== TASK_DONE_STATUS
        );
        if (missingAsset) {
          signals.push({
            id: makeId(),
            releaseId: release.id,
            taskId: missingAsset.id,
            state: 'asset_prep',
            severity: 'warning',
            title: 'Artwork or asset still missing',
            message: `Asset prep is blocked by missing ${missingAsset.title.toLowerCase()}. Readiness at ${readinessScore}%.`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      resolve(signals);
    }, 450);
  });
}
