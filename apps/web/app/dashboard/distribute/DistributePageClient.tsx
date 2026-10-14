'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Send } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { DISTRIBUTION_PARTNER } from '@/lib/distribution';
import type { ExecutionRelease } from '@/lib/execution-types';
import { useReleaseStore } from '@/stores/useReleaseStore';

/**
 * Distribute, a Catalogue tab (founder call, 2026-10-14: it took Press kits'
 * place in the tab row). One job: pick a rollout and land on its Distribute
 * step, where the check and the partner sign-up live. Nothing is decided
 * here; this is a door, so it stays a plain list with as few words as it can.
 */

const distributeHref = (releaseId: string) =>
  `/dashboard?release=${encodeURIComponent(releaseId)}&scene=distribute`;

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
        <Image
          src={url as string}
          alt=""
          fill
          sizes="48px"
          unoptimized
          className="object-cover"
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

  return (
    <div>
      <div className="pt-5 sm:pt-6" />
      <p className="mb-4 text-sm text-content-secondary">
        Pick a rollout to send to stores with {DISTRIBUTION_PARTNER.name}.
      </p>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stroke-default p-8 text-center">
          <Send className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No rollouts yet</p>
          <p className="mt-1 text-sm text-content-secondary">Start one in Rollouts and it shows up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-stroke-subtle overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          {rows.map((release) => {
            const day = formatDate(release.releaseDate);
            return (
              <li key={release.id}>
                <Link
                  href={distributeHref(release.id)}
                  className="motion-focus flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-hover/60"
                >
                  <Cover url={release.coverArtUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-semibold text-content-primary">
                      {release.title}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-content-secondary">
                      {release.artistName}
                      {day ? ` · ${day}` : ''}
                    </span>
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
