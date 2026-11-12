'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { DeleteForeverDialog } from '@/components/trash/DeleteForeverDialog';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { displayReleaseTitle } from '@/types/releases';
import { formatDaysLeft, trashDaysLeft, trashUrgency } from '@/lib/rollout-trash';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { TrashDesk } from '@/components/settings/desk/TrashDesk';
import { setDeskCount } from '@/components/settings/desk/useDeskCounts';

type TrashItem = {
  id: string;
  title: string;
  artistName: string;
  status: string;
  deletedAt: string;
  taskCount: number;
};

const URGENCY_CLASS = {
  normal: 'text-content-tertiary',
  soon: 'text-status-warning',
  urgent: 'text-status-error',
} as const;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * Deleted rollouts, newest first. Restore is one tap and brings the rollout
 * back with every activity and file; Delete forever has its own confirm.
 * Items remove themselves 30 days after deletion (the daily cron).
 */
export default function TrashPageClient() {
  const desktop = useIsDesktopViewport();
  const authLoading = useAuthStore((state) => state.isLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoredTitle, setRestoredTitle] = useState('');
  const [toPurge, setToPurge] = useState<TrashItem | null>(null);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('/api/releases/trash', { headers, cache: 'no-store' });
      if (!response.ok) {
        setError(await readError(response, 'Could not load Trash.'));
        return;
      }
      const body = (await response.json()) as { items: TrashItem[] };
      setItems(body.items ?? []);
      setDeskCount('trash', (body.items ?? []).length);
      setError('');
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (item: TrashItem) => {
    setRestoringId(item.id);
    setError('');
    setRestoredTitle('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/releases/${item.id}/restore`, { method: 'POST', headers });
      if (!response.ok) {
        setError(await readError(response, 'Could not restore the rollout.'));
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setDeskCount('trash', Math.max(0, items.length - 1));
      setRestoredTitle(displayReleaseTitle(item.title));
      void loadCommandCenter({ force: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore the rollout.');
    } finally {
      setRestoringId(null);
    }
  };

  const purge = async (id: string): Promise<string | null> => {
    try {
      const headers = await authHeaders();
      if (!headers) return 'Session expired. Please sign in again.';
      const response = await fetch(`/api/releases/${id}/purge`, { method: 'DELETE', headers });
      if (!response.ok) return await readError(response, 'Could not delete the rollout.');
      setItems((current) => current.filter((entry) => entry.id !== id));
      setDeskCount('trash', Math.max(0, items.length - 1));
      setToPurge(null);
      return null;
    } catch {
      return 'Could not reach Urganize. Check your connection and try again.';
    }
  };

  const dialog = (
    <DeleteForeverDialog
      open={toPurge !== null}
      item={toPurge ? { ...toPurge, title: displayReleaseTitle(toPurge.title) } : null}
      onConfirm={purge}
      onClose={() => setToPurge(null)}
    />
  );

  // On a computer: a table inside the settings menu (#1226). Phones keep this list.
  if (desktop) {
    return (
      <>
        <TrashDesk
          items={items}
          loading={authLoading || isLoading}
          error={error}
          restoringId={restoringId}
          restoredTitle={restoredTitle}
          onRestore={(item) => void restore(item)}
          onDeleteForever={setToPurge}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-16">
      <Link
        href="/dashboard"
        className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">Rollouts</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-content-primary">Trash</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Deleted rollouts stay here for 30 days, then are removed for good.
        </p>
      </header>

      {restoredTitle ? (
        <p role="status" className="border border-stroke-default bg-bg-surface px-3 py-2.5 text-sm text-content-primary">
          &ldquo;{restoredTitle}&rdquo; is back, with all its activities.{' '}
          <Link href="/dashboard" className="text-brand-primary underline underline-offset-4">
            Open
          </Link>
        </p>
      ) : null}

      {authLoading || isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <SkeletonBlock key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="px-3 py-10 text-center">
          <p className="font-display text-lg font-semibold text-content-primary">Trash is empty</p>
          <p className="mt-1 text-sm text-content-secondary">Deleted rollouts show up here for 30 days.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const daysLeft = trashDaysLeft(item.deletedAt);
              const deleted = new Date(item.deletedAt);
              const restoring = restoringId === item.id;
              const activities = item.taskCount === 1 ? '1 activity' : `${item.taskCount} activities`;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content-primary">
                      {displayReleaseTitle(item.title)}
                    </p>
                    <p className="truncate text-xs text-content-secondary">
                      {item.artistName || 'Unassigned artist'} &middot; {activities}
                    </p>
                    <p className="text-xs text-content-tertiary">
                      {Number.isNaN(deleted.getTime()) ? '' : `Deleted ${dateFormat.format(deleted)} · `}
                      <span className={`font-mono font-bold ${URGENCY_CLASS[trashUrgency(daysLeft)]}`}>
                        {formatDaysLeft(daysLeft)}
                      </span>
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => void restore(item)}
                      disabled={restoring}
                      className="motion-focus inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 border border-brand-primary bg-brand-primary px-4 text-[13px] font-semibold text-text-inverse disabled:opacity-60 sm:flex-none"
                    >
                      {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      {restoring ? 'Restoring…' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToPurge(item)}
                      disabled={restoring}
                      className="motion-focus inline-flex min-h-[44px] flex-1 items-center justify-center border border-status-error/40 bg-status-error/10 px-4 text-[13px] font-semibold text-status-error hover:bg-status-error/20 disabled:opacity-60 sm:flex-none"
                    >
                      Delete forever
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}
        </>
      )}

      {dialog}
    </div>
  );
}
