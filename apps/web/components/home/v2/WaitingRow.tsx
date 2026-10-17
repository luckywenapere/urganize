'use client';

import { useId, useState } from 'react';
import { ChevronRight } from '@/components/icons';
import { getPriorityDotClass } from '@/lib/tasks';
import { HOME_FOUR_COPY, describeWaiting } from '@/lib/home/home-four';
import type { WaitingItem } from '@/lib/home/stack-items';

/**
 * Waiting on others as one row (URG-320): how many things sit with the team and
 * how many of them are late. Tap to see the late ones. Hidden when nothing waits.
 */
export function WaitingRow({ items, onTimeCount }: { items: readonly WaitingItem[]; onTimeCount: number }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const lateCount = items.length;
  const summary = describeWaiting({ lateCount, onTimeCount });
  if (!summary) return null;
  const canOpen = items.length > 0;

  return (
    <section className="rounded-[20px] border border-stroke-default bg-bg-surface" data-home-block="waiting">
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
        aria-controls={canOpen ? listId : undefined}
        disabled={!canOpen}
        className="motion-focus flex min-h-14 w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left disabled:cursor-default"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-content-primary">{HOME_FOUR_COPY.waiting}</span>
          <span className="mt-0.5 block text-[13px]">
            <span className="text-content-secondary">{HOME_FOUR_COPY.withTeam(summary.total)}</span>
            {summary.late > 0 ? (
              <>
                <span className="text-content-secondary"> · </span>
                <span className="text-status-error">{HOME_FOUR_COPY.late(summary.late)}</span>
              </>
            ) : null}
          </span>
        </span>
        {canOpen ? (
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-content-primary/40 motion-safe:transition-transform ${open ? 'rotate-90' : ''}`}
          />
        ) : null}
      </button>
      {open ? (
        <ul id={listId} className="divide-y divide-stroke-subtle border-t border-stroke-subtle px-4">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-3">
              <span
                className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(item.task.priority)}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-content-primary">{item.task.title}</span>
                <span className="mt-0.5 block break-words text-xs text-content-primary/55">
                  {item.task.assigneeName || 'Someone on your team'}
                  {' · '}
                  <span className="text-status-error">
                    {item.task.daysLate === 1 ? '1 day late' : `${item.task.daysLate} days late`}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
