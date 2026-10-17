'use client';

import { useId, useState } from 'react';
import { ChevronRight } from '@/components/icons';
import { getPriorityDotClass } from '@/lib/tasks';
import { HOME_FOUR_COPY, describeWaiting } from '@/lib/home/home-four';
import type { WaitingItem } from '@/lib/home/stack-items';
import { HOME_ROW, HOME_ROW_CHEVRON, HOME_ROW_VALUE } from './HomeRow';

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

  // A row, not a card (2026-10-18, layout B): "Waiting on others   3 · 1 late  >".
  return (
    <section data-home-block="waiting">
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
        aria-controls={canOpen ? listId : undefined}
        disabled={!canOpen}
        className={`${HOME_ROW} disabled:cursor-default disabled:hover:text-content-primary`}
      >
        <span className="min-w-0 flex-1 truncate">{HOME_FOUR_COPY.waiting}</span>
        <span className={HOME_ROW_VALUE}>
          {summary.total}
          {summary.late > 0 ? (
            <>
              <span className="text-content-primary/55"> · </span>
              <span className="text-status-error">{HOME_FOUR_COPY.late(summary.late)}</span>
            </>
          ) : null}
        </span>
        {canOpen ? (
          <ChevronRight
            aria-hidden="true"
            className={`${HOME_ROW_CHEVRON} motion-safe:transition-transform ${open ? 'rotate-90' : ''}`}
          />
        ) : null}
      </button>
      {open ? (
        <ul id={listId} className="divide-y divide-stroke-subtle border-t border-stroke-subtle px-1 pb-1">
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
