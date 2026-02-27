'use client';

import { useMemo, useState } from 'react';

type PlanSummary = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  setup_completed: boolean;
  hard_deadline: string | null;
};

type PlanStatus = 'Completed' | 'Overdue' | 'In Progress';

type VirtualizedPlanListProps = {
  plans: PlanSummary[];
  showArchivedBadge?: boolean;
  getPlanStatus: (plan: PlanSummary) => PlanStatus;
  onSelectPlan: (planId: string) => void;
  onRequestDeletePlan: (plan: PlanSummary) => void;
};

const ROW_HEIGHT = 94;
const MAX_LIST_HEIGHT = 470;
const OVERSCAN_ROWS = 4;
const PLAN_MENU_WIDTH_PX = 190;
const PLAN_MENU_SAFE_MARGIN_PX = 12;

export function VirtualizedPlanList({ plans, showArchivedBadge = false, getPlanStatus, onSelectPlan, onRequestDeletePlan }: VirtualizedPlanListProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [activePlanMenuId, setActivePlanMenuId] = useState<string | null>(null);
  const [activePlanMenuDirection, setActivePlanMenuDirection] = useState<'up' | 'down'>('down');
  const [activePlanMenuOffsetX, setActivePlanMenuOffsetX] = useState(0);

  const togglePlanMenu = (planId: string, anchor: HTMLElement) => {
    if (activePlanMenuId === planId) {
      setActivePlanMenuId(null);
      setActivePlanMenuDirection('down');
      setActivePlanMenuOffsetX(0);
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const menuLeft = anchorRect.right - PLAN_MENU_WIDTH_PX;
    const menuRight = anchorRect.right;
    let offsetX = 0;
    if (menuLeft < PLAN_MENU_SAFE_MARGIN_PX) {
      offsetX = PLAN_MENU_SAFE_MARGIN_PX - menuLeft;
    }
    const maxRight = window.innerWidth - PLAN_MENU_SAFE_MARGIN_PX;
    if (menuRight + offsetX > maxRight) {
      offsetX -= menuRight + offsetX - maxRight;
    }
    setActivePlanMenuDirection(spaceBelow < 220 ? 'up' : 'down');
    setActivePlanMenuOffsetX(offsetX);
    setActivePlanMenuId(planId);
  };

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
            <div
              key={plan.id}
              className="absolute left-0 right-0 h-[84px] rounded-xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-left transition hover:border-stroke-default hover:bg-bg-hover"
              style={{
                top: absoluteIndex * ROW_HEIGHT,
                zIndex: activePlanMenuId === plan.id ? 60 : 1,
              }}
              data-plan-menu="true"
            >
              <div className="flex h-full items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-medium text-content-primary">{plan.title}</p>
                      {showArchivedBadge && plan.status === 'released' && (
                        <span className="rounded-full border border-stroke-default bg-bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-tertiary">
                          Archived
                        </span>
                      )}
                    </div>
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
                </button>
                <div className="relative ml-2">
                  <button
                    type="button"
                    onClick={(event) => togglePlanMenu(plan.id, event.currentTarget)}
                    className="rounded-md border border-stroke-default bg-bg-surface px-2 py-1 text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    aria-label={`Open menu for ${plan.title}`}
                  >
                    ...
                  </button>
                  {activePlanMenuId === plan.id && (
                    <div
                      className={`absolute right-0 z-50 min-w-[170px] rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-lg ${activePlanMenuDirection === 'up' ? 'bottom-full mb-2 animate-menu-up' : 'top-full mt-2 animate-menu-down'}`}
                      style={{ transform: `translateX(${activePlanMenuOffsetX}px)` }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActivePlanMenuId(null);
                          setActivePlanMenuDirection('down');
                          setActivePlanMenuOffsetX(0);
                          onSelectPlan(plan.id);
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                      >
                        Open plan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePlanMenuId(null);
                          setActivePlanMenuDirection('down');
                          setActivePlanMenuOffsetX(0);
                          onRequestDeletePlan(plan);
                        }}
                        className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-status-error/10"
                      >
                        Delete plan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
