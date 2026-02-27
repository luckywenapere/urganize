'use client';

import { useMemo, useState } from 'react';

type PlanSummary = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  setup_completed: boolean;
  hard_deadline: string | null;
};

type PlanStatus = 'Completed' | 'Overdue' | 'In Progress';

type VirtualizedPlanListProps = {
  plans: PlanSummary[];
  getPlanStatus: (plan: PlanSummary) => PlanStatus;
  onSelectPlan: (planId: string) => void;
};

const ROW_HEIGHT = 94;
const MAX_LIST_HEIGHT = 470;
const OVERSCAN_ROWS = 4;

export function VirtualizedPlanList({ plans, getPlanStatus, onSelectPlan }: VirtualizedPlanListProps) {
  const [scrollTop, setScrollTop] = useState(0);

  const viewportHeight = Math.min(MAX_LIST_HEIGHT, plans.length * ROW_HEIGHT);
  const totalHeight = plans.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endIndex = Math.min(plans.length, startIndex + visibleCount);

  const visiblePlans = useMemo(() => plans.slice(startIndex, endIndex), [endIndex, plans, startIndex]);

  return (
    <div
      className="mt-5 overflow-auto pr-1"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {visiblePlans.map((plan, index) => {
          const status = getPlanStatus(plan);
          const absoluteIndex = startIndex + index;
          return (
            <button
              type="button"
              key={plan.id}
              onClick={() => onSelectPlan(plan.id)}
              className="absolute left-0 right-0 h-[84px] rounded-xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-left transition hover:border-stroke-default hover:bg-bg-hover"
              style={{ top: absoluteIndex * ROW_HEIGHT }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-content-primary">{plan.title}</p>
                  <p className="truncate text-sm text-content-secondary">{plan.artist_name}</p>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap text-sm text-content-secondary">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      status === 'Completed'
                        ? 'bg-brand-muted text-brand'
                        : status === 'Overdue'
                          ? 'bg-status-error/20 text-status-error'
                          : 'bg-status-warning/20 text-status-warning'
                    }`}
                  >
                    {status}
                  </span>
                  <span className="text-content-tertiary">.</span>
                  <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
