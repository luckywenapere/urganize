/**
 * The small picture on each plan card: what the plan opens for the team
 * (#978, mock approved Nov 1, 2026). Drawn as markup with the app's tokens, so
 * it follows light and dark and costs no image bytes.
 *
 * The counts come from the plan itself (lib/plan-picture.ts), so a reprice
 * redraws it. Every name is made up and none of it is the team's data.
 * Decorative: the list under it says the same thing in words, so it is hidden
 * from screen readers.
 */

import type { PricingTierId } from '@urganize/pricing';
import { profileInitials } from '@/components/shared/ProfileFace';
import { planPictureFacts } from '@/lib/plan-picture';

const ROW = 'flex h-8 items-center gap-2 border-t border-stroke-default px-3';

// A flat initials tile on an opaque fill a step darker than the card, so it
// reads at this size and the stacked faces do not show through each other.
// Never a picture or a gradient.
function Face({ initials, className = '' }: { initials: string; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bg-active font-semibold text-content-secondary ${className}`}
    >
      {initials}
    </span>
  );
}

export function PlanPicture({ tierId }: { tierId: PricingTierId }) {
  const { artists, faces, peopleLabel } = planPictureFacts(tierId);

  return (
    <div aria-hidden="true" className="relative mt-5 h-[150px] overflow-hidden rounded-2xl bg-bg-overlay px-4 pt-4">
      <div className="w-[85%] max-w-[256px] rounded-t-xl border border-b-0 border-stroke-default bg-bg-surface pb-2">
        <p className="px-3 py-2 text-[12px] font-semibold text-content-primary">Artists</p>
        {artists.map((artist) => (
          <div key={artist.name} className={ROW}>
            <Face initials={profileInitials(artist.name)} className="size-5 text-[8px]" />
            <span className="truncate font-display text-[13.5px] text-content-primary">{artist.name}</span>
            {artist.distributed ? (
              <span className="ml-auto whitespace-nowrap rounded-full bg-brand-subtle px-2 py-px text-[10.5px] font-semibold text-brand">
                Distribute
              </span>
            ) : null}
          </div>
        ))}
        {/* One artist leaves room to show their rollout under them. A single
            is 64 tasks, the same number the marketing site quotes. */}
        {artists.length === 1 ? (
          <div className="mx-3 mt-1 rounded-lg border border-stroke-default bg-bg-elevated px-2.5 py-2">
            <p className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-semibold text-content-primary">Harmattan Gold</span>
              <span className="whitespace-nowrap text-[10.5px] text-content-tertiary">40 of 64 done</span>
            </p>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-bg-hover">
              <span className="block h-full w-[62%] rounded-full bg-brand" />
            </span>
          </div>
        ) : null}
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-stroke-strong bg-bg-surface py-1 pl-1 pr-2.5 shadow-sm">
        <span className="flex -space-x-1">
          {faces.map((name) => (
            <Face key={name} initials={name[0]} className="size-[18px] text-[9px] ring-2 ring-bg-surface" />
          ))}
        </span>
        <span className="whitespace-nowrap text-[11.5px] font-semibold text-content-primary">{peopleLabel}</span>
      </div>
    </div>
  );
}
