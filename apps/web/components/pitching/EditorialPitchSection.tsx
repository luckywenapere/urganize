'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import {
  EDITORIAL_EMPTY_COPY,
  EDITORIAL_EMPTY_COPY_ROLLOUT,
  EDITORIAL_OPEN_LABEL,
  EDITORIAL_SECTION_TITLE,
  editorialStateCopy,
  type EditorialRow,
} from '@/lib/editorial-overview';
import { EDITORIAL_PLATFORMS } from '@/lib/editorial-pitch';
import { supabase } from '@/lib/supabase/client';

const OPEN_BUTTON_CLASS =
  'motion-focus motion-press inline-flex min-h-11 shrink-0 items-center rounded-lg border border-stroke-control px-3 text-sm font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary';

/**
 * Where a rollout's editorial pitch stands, inside that rollout's Pitch tab
 * (the app-wide Pitching page left the top menu, founder call 2026-10-15).
 * Read only: the fields are edited in the task pop-up (one copy of the data),
 * which this opens the way the notification bell does, by going to the
 * rollout first. Without `releaseId` it lists every rollout.
 */
export function EditorialPitchSection({ releaseId }: { releaseId?: string } = {}) {
  const router = useRouter();
  const { openTask } = useTaskUI();
  const [rows, setRows] = useState<EditorialRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to see your editorial pitches.');
      const response = await fetch('/api/pitching/editorial', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => null)) as { rows?: EditorialRow[]; error?: string } | null;
      if (!response.ok || !Array.isArray(body?.rows)) {
        throw new Error(body?.error || 'Could not load editorial pitches.');
      }
      setRows(releaseId ? body.rows.filter((row) => row.releaseId === releaseId) : body.rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load editorial pitches.');
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (row: EditorialRow) => {
    router.push(`/dashboard?release=${row.releaseId}`);
    openTask(row.taskId);
  };

  const platformNames = EDITORIAL_PLATFORMS.map((platform) => platform.name).join(' and ');

  return (
    <section aria-label={EDITORIAL_SECTION_TITLE} className={releaseId ? 'space-y-3' : 'mt-10 space-y-4'}>
      {releaseId ? (
        <h3 className="font-display text-xl font-semibold text-content-primary">{EDITORIAL_SECTION_TITLE}</h3>
      ) : (
        <h2 className="text-sm font-semibold text-content-primary">{EDITORIAL_SECTION_TITLE}</h2>
      )}

      {error ? (
        <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="motion-focus mt-2 text-sm font-semibold underline">
            Try again
          </button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2" aria-hidden="true">
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          {releaseId ? EDITORIAL_EMPTY_COPY_ROLLOUT : EDITORIAL_EMPTY_COPY}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.taskId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4"
            >
              <div className="min-w-0">
                {releaseId ? null : (
                  <p className="truncate text-sm font-semibold text-content-primary">{row.releaseTitle}</p>
                )}
                <p
                  className={
                    releaseId ? 'text-sm font-semibold text-content-primary' : 'mt-0.5 text-sm text-content-secondary'
                  }
                >
                  {editorialStateCopy(row)}
                </p>
                <p className="mt-0.5 text-xs text-content-tertiary">{platformNames}</p>
              </div>
              <button type="button" onClick={() => open(row)} className={OPEN_BUTTON_CLASS}>
                {EDITORIAL_OPEN_LABEL}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
