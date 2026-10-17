'use client';

import Link from 'next/link';
import { ROLLOUT_PHASE_LABELS } from '@/lib/rollout-phases';
import { buildPhaseLine, describeDrop } from '@/lib/home/home-four';
import type { HomeReleaseSummary } from '@/lib/home/types';
import type { TeamPresenceMember } from '@/lib/home/team-presence';
import { HomeBell } from './HomeBell';
import { TeamAvatars } from './TeamAvatars';

const rolloutHref = (id: string) => `/dashboard?release=${encodeURIComponent(id)}`;

/**
 * State A's first block (URG-320): what, how long to go, where we are
 * (Pre-release, Release, Post-release) and the team. Since 2026-10-17 (founder
 * call) there is no artist eyebrow and no "+1 rollout" menu above the title:
 * the title leads, and the top right is the phone's bell, then the team.
 * Other rollouts are on the Artists tab.
 */
export function ReleaseHeader({
  release,
  team,
}: {
  release: HomeReleaseSummary;
  team: readonly TeamPresenceMember[];
}) {
  const drop = describeDrop(release);
  const phases = buildPhaseLine(release);

  return (
    <section aria-label="This release" data-home-block="release">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words font-display text-[1.875rem] leading-[1.15] text-content-primary">
            <Link href={rolloutHref(release.id)} className="motion-focus hover:text-brand">
              {release.title}
            </Link>
          </h1>
          <p className="mt-1.5 text-[15px] text-content-primary/55">
            {drop.lead}
            {drop.date ? <span className="text-content-primary"> {drop.date}</span> : null}
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <HomeBell />
          <TeamAvatars members={team} />
        </div>
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
