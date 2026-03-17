'use client';

import { ProgressBar } from '@/components/shared/ProgressBar';
import type { ReadinessChecklistItem, ReadinessChecklistStatus } from '@/lib/release-ops';

type ReleaseReadinessCardProps = {
  readiness: {
    completionPercent: number;
    checklist: ReadinessChecklistItem[];
  };
};

const statusLabels: Record<ReadinessChecklistStatus, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  pending: 'Pending',
  locked: 'Locked',
};

const statusClasses: Record<ReadinessChecklistStatus, string> = {
  complete: 'border-status-success/35 bg-status-success/10 text-status-success',
  in_progress: 'border-status-warning/35 bg-status-warning/10 text-status-warning',
  pending: 'border-stroke-default bg-bg-surface text-content-secondary',
  locked: 'border-stroke-subtle bg-bg-elevated text-content-tertiary',
};

export function ReleaseReadinessCard({ readiness }: ReleaseReadinessCardProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-content-primary">Release Progress</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-content-primary">
            {readiness.completionPercent}% complete
          </p>
        </div>
        <p className="max-w-sm text-right text-sm text-content-secondary">
          System-generated from collaborator status and metadata review.
        </p>
      </div>
      <div className="mt-4">
        <ProgressBar value={readiness.completionPercent} />
      </div>
      <div className="mt-5 space-y-3">
        {readiness.checklist.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-content-primary">{item.label}</p>
              <p className="mt-1 text-sm text-content-secondary">{item.detail}</p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClasses[item.status]}`}
            >
              {statusLabels[item.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
