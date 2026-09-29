import type { HomePitchItem, HomePlacements } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

function PitchRow({ pitch, placed }: { pitch: HomePitchItem; placed: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${placed ? 'bg-brand' : 'bg-status-info'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-content-primary">{pitch.playlistName}</p>
        <p className="mt-0.5 truncate text-xs text-content-tertiary">
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
  const hasAny = placements.placed.length > 0 || placements.underReview.length > 0;

  return (
    <HomeSectionShell title="Placements">
      {!hasAny ? (
        <EmptyState title="No pitches out right now." className="py-4" />
      ) : (
        <ul className="divide-y divide-stroke-subtle">
          {placements.placed.map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} placed />
          ))}
          {placements.underReview.map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} placed={false} />
          ))}
        </ul>
      )}
    </HomeSectionShell>
  );
}
