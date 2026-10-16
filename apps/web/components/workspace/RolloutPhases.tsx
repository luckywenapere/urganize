'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from '@/components/icons';
import {
  formatPhaseDates,
  phaseStateLabel,
  type RolloutPhaseSummary,
} from '@/lib/rollout-phases';

/**
 * Pre-release, Release and Post-release at a glance (URG-292).
 *
 * Two pieces, one look: the strip of three cards at the top of the timeline,
 * and the header each phase group carries in the activity list. Both show the
 * same three facts a manager asked for: when the phase runs, how much of it is
 * done, and whether it is the one we are in now. The numbers come from
 * lib/rollout-phases.ts summarizeRolloutPhases, so both views agree.
 */

const STATE_BADGE_CLASS: Record<string, string> = {
  Now: 'bg-brand/15 text-brand',
  Done: 'bg-status-success/15 text-status-success',
  'Still open': 'bg-status-warning/15 text-status-warning',
};

function StateBadge({ summary }: { summary: RolloutPhaseSummary }) {
  const label = phaseStateLabel(summary.state);
  if (!label) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
        STATE_BADGE_CLASS[label] ?? 'bg-bg-hover text-content-secondary'
      }`}
    >
      {label}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  // The Motion bar pattern: bg-stroke-strong track, aria-hidden, the count
  // beside it is the accessible metric.
  return (
    <div className="h-1.5 min-w-0 flex-1 rounded-full bg-stroke-strong" aria-hidden="true">
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * The three phases side by side, for the top of the timeline.
 *
 * `compact` (2026-10-16, founder: "taking up too much space... one line"): on a
 * computer each phase is a single 36px line (name, dates, bar, count) so the
 * phases and the distribution check share one row and the week grid starts
 * higher. Below lg it keeps the three stacked cards, which read better narrow.
 */
export function RolloutPhaseStrip({
  phases,
  compact = false,
}: {
  phases: RolloutPhaseSummary[];
  compact?: boolean;
}) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Rollout phases">
      {phases.map((summary) => {
        const dates = formatPhaseDates(summary);
        const current = summary.state === 'current';
        return (
          <li
            key={summary.phase}
            className={`min-w-0 rounded-xl border px-3 py-2 ${compact ? 'lg:flex lg:h-9 lg:items-center lg:gap-2 lg:rounded-lg lg:py-0' : ''} ${
              current ? 'border-brand/50 bg-brand/5' : 'border-stroke-default bg-bg-surface'
            }`}
            aria-current={current ? 'step' : undefined}
          >
            <div className={`flex items-center gap-1.5 ${compact ? 'lg:shrink-0' : ''}`}>
              <span className={`min-w-0 flex-1 truncate text-xs font-semibold text-content-primary ${compact ? 'lg:flex-none' : ''}`}>
                {summary.label}
              </span>
              <StateBadge summary={summary} />
            </div>
            <p className={`mt-0.5 truncate text-[11px] text-content-tertiary ${compact ? 'lg:mt-0 lg:min-w-0 lg:shrink' : ''}`}>
              {dates || 'No dates yet'}
            </p>
            <div className={`mt-1.5 flex items-center gap-2 ${compact ? 'lg:mt-0 lg:min-w-[3.5rem] lg:flex-1' : ''}`}>
              <ProgressBar percent={summary.percent} />
              <span className="shrink-0 text-[11px] tabular-nums text-content-secondary">
                {summary.done}/{summary.total}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The collapsible header of one phase group in the activity list. */
export function RolloutPhaseHeader({
  summary,
  isOpen,
  onToggle,
  controlsId,
  children,
}: {
  summary: RolloutPhaseSummary;
  isOpen: boolean;
  onToggle: () => void;
  controlsId: string;
  children?: ReactNode;
}) {
  const dates = formatPhaseDates(summary);
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        summary.state === 'current' ? 'border-brand/50' : 'border-stroke-default'
      } bg-bg-surface`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={controlsId}
        className={`motion-focus flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
          isOpen ? 'border-b border-stroke-subtle' : ''
        }`}
      >
        <span className="flex min-w-0 shrink-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-content-primary">{summary.label}</span>
            <StateBadge summary={summary} />
          </span>
          {dates ? <span className="text-xs text-content-tertiary">{dates}</span> : null}
        </span>
        <ProgressBar percent={summary.percent} />
        <span className="shrink-0 text-xs tabular-nums text-content-secondary">
          {summary.done}/{summary.total} done
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${isOpen ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
      </button>
      {isOpen ? <div id={controlsId}>{children}</div> : null}
    </div>
  );
}
