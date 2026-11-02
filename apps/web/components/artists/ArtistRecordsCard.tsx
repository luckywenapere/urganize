'use client';

import { useCallback, useEffect, useState } from 'react';
import { recallLast, rememberLast } from '@/lib/last-seen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from '@/components/icons';
import { CoverTile, DoneBars } from '@/components/records/RecordParts';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { recordHref } from '@/lib/artist-page';
import { DEFAULT_RECORD_TITLE, recordKindLabel, sessionWhen, type RecordSummary } from '@/lib/next-records';
import { fetchArtistRecords, startRecord } from '@/lib/next-records-client';

// "In the making" on the artist page (2026-10-27, mock screen 2): the records
// still being made. v2 (next-record-v2 mock): each record is a small cover in
// its colour, with one bar per song, lit when it is done. Since the page
// redesign (#866) the records feed the header and Up next too, so loading and
// starting live in a hook and this file draws only the rows.

export function useArtistRecords(artistId: string) {
  const router = useRouter();
  // The last copy seen in this page life paints at once (Nov 2, 2026).
  const [records, setRecords] = useState<RecordSummary[] | null>(() => recallLast<RecordSummary[]>('records', artistId));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void fetchArtistRecords(artistId).then((list) => {
      if (!live) return;
      if (list) rememberLast('records', artistId, list);
      setRecords(list ?? []);
    });
    return () => {
      live = false;
    };
  }, [artistId]);

  /** Starts an untitled record and opens it, one tap from the first song. */
  const start = useCallback(async () => {
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
  }, [artistId, router]);

  return { records, starting, error, start };
}

export const isUntitledRecord = (title: string): boolean => title.trim() === DEFAULT_RECORD_TITLE;

export function RecordRows({ artistId, records }: { artistId: string; records: RecordSummary[] }) {
  return (
    <ul className="space-y-0.5">
      {records.map((record) => {
        const untitled = isUntitledRecord(record.title);
        const parts = [
          record.songCount
            ? `${record.doneCount} of ${record.songCount === 1 ? '1 song' : `${record.songCount} songs`} done`
            : 'Add the first song',
          record.nextSession ? `next ${sessionWhen(record.nextSession)}` : null,
        ].filter(Boolean);
        return (
          <li key={record.id}>
            <Link
              href={recordHref(artistId, record.id)}
              className="motion-focus -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-bg-hover"
            >
              {untitled && !record.coverUrl ? (
                <span aria-hidden className="h-12 w-12 shrink-0 rounded-[10px] border-[1.5px] border-dashed border-stroke-strong" />
              ) : (
                <CoverTile color={record.coverColor} url={record.coverUrl} size={48} />
              )}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${untitled ? 'text-content-secondary' : 'text-content-primary'}`}>
                  {untitled ? 'Untitled record' : record.title}
                  {record.kind ? <span className="font-normal text-content-secondary"> · {recordKindLabel(record.kind)}</span> : null}
                </p>
                <p className="truncate text-[13px] text-content-secondary">{parts.join(' · ')}</p>
                {record.songCount ? (
                  <div className="mt-1.5">
                    <DoneBars total={record.songCount} done={record.doneCount} />
                  </div>
                ) : null}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
