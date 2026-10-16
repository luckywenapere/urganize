'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from '@/components/icons';
import { ROLLOUT_PHASE_LABELS } from '@/lib/rollout-phases';
import { HOME_FOUR_COPY, buildPhaseLine, describeDrop } from '@/lib/home/home-four';
import type { HomeReleaseSummary } from '@/lib/home/types';
import type { TeamPresenceMember } from '@/lib/home/team-presence';
import { TeamAvatars } from './TeamAvatars';

const rolloutHref = (id: string) => `/dashboard?release=${encodeURIComponent(id)}`;

/**
 * State A's first block (URG-320): who and what, how long to go, where we are
 * (Pre-release, Release, Post-release) and the team. With more than one
 * rollout in flight, "+1 rollout" opens the others.
 */
export function ReleaseHeader({
  release,
  others,
  team,
}: {
  release: HomeReleaseSummary;
  others: readonly HomeReleaseSummary[];
  team: readonly TeamPresenceMember[];
}) {
  const drop = describeDrop(release);
  const phases = buildPhaseLine(release);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <section aria-label="This release" data-home-block="release">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div ref={wrapRef} className="relative flex flex-wrap items-center gap-x-2 font-mono text-[11px] uppercase tracking-[0.14em] text-content-primary/55">
            <span className="truncate">{release.artistName}</span>
            {others.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-controls={menuId}
                  className="motion-focus inline-flex min-h-8 items-center gap-1 uppercase text-content-secondary hover:text-content-primary"
                >
                  {HOME_FOUR_COPY.moreRollouts(others.length)}
                  <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open ? (
                  <ul
                    id={menuId}
                    className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-2xl border border-stroke-default bg-bg-elevated py-1 font-sans normal-case tracking-normal shadow-xl"
                  >
                    {others.map((other) => (
                      <li key={other.id}>
                        <Link
                          href={rolloutHref(other.id)}
                          className="motion-focus flex min-h-11 flex-col justify-center px-4 py-2 hover:bg-bg-hover"
                        >
                          <span className="truncate text-sm font-medium text-content-primary">{other.title}</span>
                          <span className="truncate text-xs text-content-primary/55">
                            {other.artistName} · {describeDrop(other).lead}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
          <h1 className="mt-2 break-words font-display text-[1.875rem] leading-[1.15] text-content-primary">
            <Link href={rolloutHref(release.id)} className="motion-focus hover:text-brand">
              {release.title}
            </Link>
          </h1>
          <p className="mt-1.5 text-[15px]">
            <span className={release.daysOut === null ? 'text-content-secondary' : 'font-semibold text-brand'}>
              {drop.lead}
            </span>
            {drop.date ? <span className="text-content-primary/55"> · {drop.date}</span> : null}
          </p>
        </div>
        <TeamAvatars members={team} />
      </div>

      {phases ? (
        <ol className="mt-4 flex gap-1.5" aria-label="Phase">
          {phases.map((segment) => (
            <li key={segment.phase} className="min-w-0 flex-1" aria-current={segment.active ? 'step' : undefined}>
              <div className="h-1 overflow-hidden rounded-full bg-content-primary/[0.12]">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(segment.fill * 100)}%` }} />
              </div>
              <p
                className={`mt-1.5 truncate text-[11px] ${
                  segment.active ? 'font-semibold text-content-primary' : 'text-content-primary/55'
                }`}
              >
                {ROLLOUT_PHASE_LABELS[segment.phase]}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
