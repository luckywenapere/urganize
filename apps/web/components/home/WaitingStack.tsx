'use client';

import { getPriorityDotClass } from '@/lib/tasks';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { WaitingItem } from '@/lib/home/stack-items';
import { HomeStack } from './HomeStack';

function WaitingRow({ item }: { item: WaitingItem }) {
  const { task } = item;
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-content-primary">{task.title}</p>
        <p className="mt-0.5 break-words text-xs text-content-tertiary">
          {task.assigneeName || 'Someone on your team'}
          {task.releaseTitle ? ` · ${task.releaseTitle}` : ''}
          {' · '}
          <span className="font-medium text-status-error">
            {task.daysLate === 1 ? '1 day overdue' : `${task.daysLate} days overdue`}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Waiting on others: late tasks someone else holds, as one stack. Read-only (a nudge is a later step). The count of
 * tasks that are with the team and on time shows under the open stack.
 */
export function WaitingStack({ items, onTimeCount }: { items: readonly WaitingItem[]; onTimeCount: number }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.waiting}
      items={items}
      getKey={(item) => item.key}
      renderItem={(item) => <WaitingRow item={item} />}
      footer={
        onTimeCount > 0 ? (
          <p className="text-xs text-content-tertiary">
            {onTimeCount} more {onTimeCount === 1 ? 'task is' : 'tasks are'} with your team and on time.
          </p>
        ) : null
      }
    />
  );
}
