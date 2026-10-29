'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Send } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import type { ExecutionRelease } from '@/lib/execution-types';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ThumbImage } from '@/components/shared/ThumbImage';
import { NeedsRolloutEmpty } from '@/components/releases/NeedsRolloutEmpty';
import { supabase } from '@/lib/supabase/client';
import type { DistributeChip, DistributeRow } from '@/lib/distribute-summary';

/**
 * Distribute, a Catalogue tab (founder call, 2026-10-14: it took Press kits'
 * place in the tab row). One job: pick a rollout and land on its Distribute
 * step, which opens inside this tab ([releaseId]/) so the tab stays lit
 * (founder, same day: "it still looks like it is under catalogue"). No
 * partner is named here: there will be more than one.
 *
 * Each row carries two tags (Oct 29, 2026, #850): where it is with stores, and
 * its smart link. They come from one read after the list shows, so a slow read
 * never holds the list back.
 */

const CHIP_TONE: Record<DistributeChip['tone'], string> = {
  live: 'border-brand/45 text-brand',
  done: 'border-brand/45 text-brand',
  error: 'border-status-error/45 text-status-error',
  quiet: 'border-stroke-strong text-content-secondary',
};

function Chip({ chip }: { chip: DistributeChip }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CHIP_TONE[chip.tone]}`}>
      {chip.label}
    </span>
  );
}

const distributeHref = (releaseId: string) => `/dashboard/distribute/${encodeURIComponent(releaseId)}`;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function Cover({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(url) && !failed;
  return (
    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-elevated" aria-hidden="true">
      {show ? (
        <ThumbImage
          src={url as string}
          width={48}
          height={48}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center">
          <Image
            src="/images/urganize-mark.png"
            alt=""
            width={161}
            height={173}
            className="app-wordmark h-4 w-auto opacity-35"
          />
        </span>
      )}
    </span>
  );
}

/** Soonest release day first; undated rollouts after, newest first. */
function byReleaseDay(a: ExecutionRelease, b: ExecutionRelease): number {
  if (a.releaseDate && b.releaseDate) return a.releaseDate.localeCompare(b.releaseDate);
  if (a.releaseDate) return -1;
  if (b.releaseDate) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

export default function DistributePageClient() {
  const authLoading = useAuthStore((state) => state.isLoading);
  const releases = useReleaseStore((state) => state.releases);
  const initialLoading = useReleaseStore((state) => state.isInitialLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const rows = useMemo(
    () => releases.filter((release) => release.status !== 'archived').slice().sort(byReleaseDay),
    [releases]
  );

  const loading = (authLoading || initialLoading) && rows.length === 0;

  const idsKey = rows.map((release) => release.id).join(',');
  const [tags, setTags] = useState<Record<string, DistributeRow>>({});
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(`/api/distribute/summary?ids=${encodeURIComponent(idsKey)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { rows?: Record<string, DistributeRow>; altlink?: boolean };
        if (cancelled || !body.rows) return;
        // With Altlink switched off, the smart link tag says nothing useful.
        const shown = Object.fromEntries(
          Object.entries(body.rows).map(([id, row]) => [id, body.altlink === false ? { ...row, link: null } : row])
        );
        setTags(shown as Record<string, DistributeRow>);
      } catch {
        // Tags are extra; the list stands without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return (
    <div>
      <div className="pt-5 sm:pt-6" />
      <p className="mb-4 text-sm text-content-secondary">
        Send each rollout to stores and share its smart link.
      </p>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <NeedsRolloutEmpty
          icon={<Send className="h-6 w-6" aria-hidden />}
          title="No rollouts yet"
          body="Sending to stores needs a rollout. Plan one and it shows up here."
        />
      ) : (
        <ul className="divide-y divide-stroke-subtle overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          {rows.map((release) => {
            const day = formatDate(release.releaseDate);
            const tag = tags[release.id];
            return (
              <li key={release.id}>
                <Link
                  href={distributeHref(release.id)}
                  className="motion-focus flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-hover/60"
                >
                  <Cover url={release.coverThumbUrl ?? release.coverArtUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-semibold text-content-primary">
                      {release.title}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-content-secondary">
                      {release.artistName}
                      {day ? ` · ${day}` : ''}
                    </span>
                    {tag && (tag.stores || tag.link) ? (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {tag.stores ? <Chip chip={tag.stores} /> : null}
                        {tag.link ? <Chip chip={tag.link} /> : null}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
