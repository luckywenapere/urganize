'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { recordHref } from '@/lib/artist-page';
import { recordKindLabel, sessionWhen, type RecordSummary } from '@/lib/next-records';
import { fetchArtistRecords, startRecord } from '@/lib/next-records-client';

// "In the making" on the artist page (2026-10-27, mock screen 2): the records
// still being made, above the released music. The plus starts an untitled one
// and opens it, so a manager is one tap from writing the first song down.

export function ArtistRecordsCard({ artistId }: { artistId: string }) {
  const router = useRouter();
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void fetchArtistRecords(artistId).then((list) => {
      if (live) setRecords(list ?? []);
    });
    return () => {
      live = false;
    };
  }, [artistId]);

  const start = async () => {
    setStarting(true);
    setError('');
    const result = await startRecord(artistId);
    if (!result.ok) {
      setStarting(false);
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'record_started', properties: { artist_id: artistId, source: 'artist_page' } });
    router.push(recordHref(artistId, result.record.id));
  };

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4" aria-labelledby="in-the-making">
      <div className="flex items-center justify-between gap-3">
        <h2 id="in-the-making" className="font-display text-base font-semibold text-content-primary">
          In the making
        </h2>
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting}
          aria-label="Start the next record"
          title="Start the next record"
          className="motion-focus motion-press -my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="mt-3">
        {records === null ? (
          <div className="h-14 animate-pulse rounded-lg bg-bg-elevated" aria-busy="true" />
        ) : records.length === 0 ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={starting}
            className="motion-focus w-full rounded-lg border border-dashed border-stroke-strong p-3 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-content-primary">
              {starting ? 'Starting…' : 'Start the next record'}
            </span>
            <span className="mt-0.5 block text-sm text-content-secondary">
              Keep the songs, sessions and people in one place, not in your head.
            </span>
          </button>
        ) : (
          <ul className="space-y-2">
            {records.map((record) => {
              const progress = record.songCount ? Math.round((record.doneCount / record.songCount) * 100) : 0;
              const parts = [
                record.songCount === 1 ? '1 song' : `${record.songCount} songs`,
                record.songCount ? `${record.doneCount} done` : null,
                record.nextSession ? `next session ${sessionWhen(record.nextSession)}` : null,
              ].filter(Boolean);
              return (
                <li key={record.id}>
                  <Link
                    href={recordHref(artistId, record.id)}
                    className="motion-focus block rounded-lg border border-stroke-default p-2.5 transition-colors hover:border-stroke-strong"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-stroke-strong text-sm font-semibold text-content-tertiary">
                        ?
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-content-primary">
                          {record.title}
                          {record.kind ? <span className="font-normal text-content-secondary"> · {recordKindLabel(record.kind)}</span> : null}
                        </p>
                        <p className="truncate text-xs text-content-secondary">{parts.join(' · ')}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
                    </div>
                    {record.songCount ? (
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-elevated" aria-hidden>
                        <div className="h-full rounded-full bg-content-primary" style={{ width: `${progress}%` }} />
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-status-error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
