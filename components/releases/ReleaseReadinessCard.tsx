'use client';

import { ProgressBar } from '@/components/shared/ProgressBar';
import { StatusBadge } from '@/components/shared/StatusBadge';
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
  complete: 'border-status-success/25 bg-status-success/10',
  in_progress: 'border-status-warning/35 bg-status-warning/10 shadow-[0_16px_36px_-28px_rgba(0,0,0,0.3)]',
  pending: 'border-stroke-default bg-bg-surface',
  locked: 'border-stroke-subtle bg-bg-elevated/70',
};

export function ReleaseReadinessCard({ readiness }: ReleaseReadinessCardProps) {
  const completedCount = readiness.checklist.filter((item) => item.status === 'complete').length;
  const allComplete = completedCount === readiness.checklist.length;
  const activeItem =
    readiness.checklist.find((item) => item.status === 'in_progress') ||
    readiness.checklist.find((item) => item.status === 'pending') ||
    readiness.checklist[readiness.checklist.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-content-primary">Release Progress</p>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                Track collaborators, credits, metadata, and delivery readiness.
              </p>
            </div>
            <StatusBadge
              label={`${completedCount}/${readiness.checklist.length} complete`}
              tone={allComplete ? 'success' : 'neutral'}
              size="sm"
            />
          </div>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[3rem] font-semibold tracking-[-0.04em] text-content-primary sm:text-[4.25rem]">
                {readiness.completionPercent}%
              </p>
              <p className="mt-2 text-sm font-semibold text-content-primary">
                {completedCount} of {readiness.checklist.length} checkpoints complete
              </p>
            </div>

            <div className="rounded-[22px] border border-stroke-default bg-bg-surface/90 px-4 py-4 sm:min-w-[220px]">
              <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Completion</p>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {allComplete ? 'All workflow checkpoints are complete.' : 'Progress updates automatically from live release data.'}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.12em] text-content-tertiary">
              <span>Progress</span>
              <span>{readiness.completionPercent}% complete</span>
            </div>
            <ProgressBar
              value={readiness.completionPercent}
              className="h-3.5 bg-bg-overlay"
              fillClassName="bg-brand"
            />
          </div>
        </div>

        <div className="rounded-[26px] border border-stroke-subtle bg-bg-surface/90 p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Current focus</p>
          <p className="mt-3 text-xl font-semibold tracking-tight text-content-primary">{activeItem?.label}</p>
          <p className="mt-3 text-sm leading-6 text-content-secondary">{activeItem?.detail}</p>
          <div className="mt-5 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Status</p>
            <div className="mt-3 flex items-center gap-2">
              <StatusBadge
                label={statusLabels[activeItem?.status || 'pending']}
                tone={
                  activeItem?.status === 'complete'
                    ? 'success'
                    : activeItem?.status === 'in_progress'
                      ? 'warning'
                      : 'neutral'
                }
                size="sm"
              />
              {!allComplete ? <StatusBadge label="Current step" tone="warning" size="sm" /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3.5">
        {readiness.checklist.map((item, index) => {
          const isActive = activeItem?.id === item.id && item.status !== 'complete';
          return (
            <div
              key={item.id}
              className={`rounded-[24px] border px-4 py-4 transition sm:px-5 sm:py-5 ${statusClasses[item.status]} ${
                isActive ? 'ring-1 ring-status-warning/25 shadow-[0_20px_42px_-32px_rgba(0,0,0,0.34)]' : ''
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      item.status === 'complete'
                        ? 'border-status-success/35 bg-status-success/10 text-status-success'
                        : item.status === 'in_progress'
                          ? 'border-status-warning/35 bg-status-warning/10 text-status-warning'
                          : item.status === 'pending'
                            ? 'border-stroke-default bg-bg-elevated text-content-primary'
                            : 'border-stroke-subtle bg-bg-overlay text-content-tertiary'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-content-primary">{item.label}</p>
                      {isActive ? <StatusBadge label="Current" tone="warning" size="sm" /> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">{item.detail}</p>
                  </div>
                </div>

                <StatusBadge
                  label={statusLabels[item.status]}
                  tone={
                    item.status === 'complete' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'
                  }
                  size="sm"
                  className={item.status === 'locked' ? 'opacity-70' : ''}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
