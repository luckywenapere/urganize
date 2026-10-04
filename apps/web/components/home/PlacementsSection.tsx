'use client';

import { useState } from 'react';
import type { HomePitchItem, HomePlacements } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';

const VISIBLE = 2;

function PitchRow({ pitch, placed }: { pitch: HomePitchItem; placed: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${placed ? 'bg-brand' : 'bg-status-info'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium sm:truncate text-content-primary">{pitch.playlistName}</p>
        <p className="mt-0.5 break-words text-xs sm:truncate text-content-tertiary">
          {pitch.songTitle}
          {pitch.curatorName ? ` · ${pitch.curatorName}` : ''}
          {' · '}
          {pitch.sentDaysAgo === 0 ? 'Sent today' : `Sent ${pitch.sentDaysAgo}d ago`}
        </p>
      </div>
    </li>
  );
}

/**
 * Step 2 scope: pitches only. Distribution-order and money are out of this
 * section's build (mapping report: no distributor link exists, and nothing
 * records money) — see the approved plan's data-mapping notes.
 */
export function PlacementsSection({ placements }: { placements: HomePlacements }) {
  const [expanded, setExpanded] = useState(false);
  const hasAny = placements.placed.length > 0 || placements.underReview.length > 0;
  const total = placements.placed.length + placements.underReview.length;
  const limit = expanded ? total : VISIBLE;
  const placed = placements.placed.slice(0, limit);
  const review = placements.underReview.slice(0, Math.max(0, limit - placed.length));
  const hidden = total - placed.length - review.length;

  return (
    <HomeSectionShell title="Placements">
      {!hasAny ? (
        <p className="text-sm text-content-secondary">No pitches out right now.</p>
      ) : (
        <>
        <ul className="divide-y divide-stroke-subtle">
          {placed.map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} placed />
          ))}
          {review.map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} placed={false} />
          ))}
        </ul>
        {hidden > 0 || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="motion-focus mt-2 min-h-11 w-full rounded-lg px-2 text-left text-xs font-semibold text-content-secondary hover:text-content-primary"
          >
            {expanded ? 'Show fewer' : `Show ${hidden} more`}
          </button>
        ) : null}
        </>
      )}
    </HomeSectionShell>
  );
}
