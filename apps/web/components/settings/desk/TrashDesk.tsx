'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from '@/components/icons';
import { displayReleaseTitle } from '@/types/releases';
import { sortTrashSoonestFirst, trashDaysLeft, trashGoneIn, trashGoneInIsClose } from '@/lib/rollout-trash';
import { RowMenu } from './RowMenu';
import { SettingsDesk } from './SettingsDesk';

export type TrashDeskItem = {
  id: string;
  title: string;
  artistName: string;
  deletedAt: string;
  taskCount: number;
};

const COLUMNS = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_100px_110px_auto_32px] items-center gap-4 px-5';

/**
 * Trash on a computer (#1226): a table, soonest gone first. Restore is the one
 * action on the row; Delete forever is in the ⋯ menu and still opens the
 * page's own confirm (DeleteForeverDialog). There is no Empty trash: no
 * endpoint removes everything at once.
 */
export function TrashDesk<T extends TrashDeskItem>({
  items,
  loading,
  error,
  restoringId,
  restoredTitle,
  onRestore,
  onDeleteForever,
}: {
  items: T[];
  loading: boolean;
  error: string;
  restoringId: string | null;
  restoredTitle: string;
  onRestore: (item: T) => void;
  onDeleteForever: (item: T) => void;
}) {
  const [now] = useState(() => new Date());
  const sorted = useMemo(() => sortTrashSoonestFirst(items), [items]);

  return (
    <SettingsDesk
      active="trash"
      title="Trash"
      lead="Deleted rollouts stay here for 30 days, then they are gone for good."
    >
      {restoredTitle ? (
        <p role="status" className="mb-4 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-primary">
          &ldquo;{restoredTitle}&rdquo; is back, with all its activities.{' '}
          <Link href="/dashboard" className="font-semibold text-brand underline underline-offset-4">
            Open
          </Link>
        </p>
      ) : null}

      <div className="rounded-2xl border border-stroke-default bg-bg-surface">
        <div className={`${COLUMNS} border-b border-stroke-default py-3 text-xs font-semibold text-content-tertiary`}>
          <span>Rollout</span>
          <span>Artist</span>
          <span>Activities</span>
          <span>Gone in</span>
          <span className="sr-only">Restore</span>
          <span className="sr-only">More</span>
        </div>
        {loading ? (
          <div aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className={`${COLUMNS} h-[52px] border-t border-stroke-default first:border-t-0`}>
                <span className="h-4 w-40 animate-pulse rounded bg-bg-hover" />
                <span className="h-4 w-20 animate-pulse rounded bg-bg-hover" />
                <span className="h-4 w-6 animate-pulse rounded bg-bg-hover" />
                <span className="h-4 w-14 animate-pulse rounded bg-bg-hover" />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <p role="alert" className="px-5 py-6 text-sm text-status-error">
            {error}
          </p>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-display text-lg text-content-primary">Trash is empty</p>
            <p className="mt-1 text-sm text-content-secondary">Deleted rollouts show up here for 30 days.</p>
          </div>
        ) : (
          <ul aria-label="Deleted rollouts">
            {sorted.map((item) => {
              const daysLeft = trashDaysLeft(item.deletedAt, now);
              const restoring = restoringId === item.id;
              const title = displayReleaseTitle(item.title);
              return (
                <li key={item.id} className={`${COLUMNS} border-t border-stroke-default py-3 first:border-t-0`}>
                  <span className="truncate text-sm font-semibold text-content-primary">{title}</span>
                  <span className="truncate text-sm text-content-secondary">{item.artistName || 'No artist'}</span>
                  <span className="text-sm tabular-nums text-content-secondary">{item.taskCount}</span>
                  <span
                    className={`text-sm tabular-nums ${
                      trashGoneInIsClose(daysLeft) ? 'font-semibold text-status-error' : 'text-content-secondary'
                    }`}
                  >
                    {trashGoneIn(item.deletedAt, now)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(item)}
                    disabled={restoring}
                    className="motion-focus inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline disabled:opacity-60"
                  >
                    {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {restoring ? 'Restoring' : 'Restore'}
                  </button>
                  <RowMenu
                    label={`More for ${title}`}
                    items={[{ label: 'Delete forever', danger: true, onSelect: () => onDeleteForever(item) }]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && items.length > 0 ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </SettingsDesk>
  );
}
