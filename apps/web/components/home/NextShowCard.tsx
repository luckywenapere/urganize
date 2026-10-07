'use client';

import Link from 'next/link';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { HomeNextShow } from '@/lib/home/types';
import { HomeStack } from './HomeStack';

const FIT_LABEL: Record<'over' | 'under' | 'on_time', { text: string; className: string }> = {
  over: { text: 'over the slot', className: 'text-status-error' },
  under: { text: 'under the slot', className: 'text-status-warning' },
  on_time: { text: 'on time', className: 'text-status-info' },
};

/** The next show in the coming 14 days, as a one-card group. Not drawn when nothing is booked. */
export function NextShowCard({ nextShow }: { nextShow: HomeNextShow }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS['next-show']}
      items={[nextShow]}
      showCount={false}
      getKey={(show) => show.id}
      renderItem={(show) => {
        const fit = show.setlist ? FIT_LABEL[show.setlist.fit] : null;
        return (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
              {show.artistName}
            </p>
            <Link
              href={`/dashboard/shows/${show.id}`}
              className="motion-focus mt-1 block font-display text-lg font-semibold text-content-primary after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              {[show.venueName, show.city].filter(Boolean).join(', ') || 'Venue to confirm'}
            </Link>
            <p className="mt-1 text-sm text-content-secondary">
              {show.dateLabel} · {show.setTimeLabel}
            </p>
            {show.setlist ? (
              <p className="mt-3 text-xs text-content-tertiary">
                {show.setlist.isPartial ? 'At least ' : ''}
                {show.setlist.totalMinutes} of {show.setlist.slotMinutes} min set
                {fit ? <span className={`ml-1.5 font-medium ${fit.className}`}>{fit.text}</span> : null}
              </p>
            ) : null}
            {show.djLinks ? (
              <p className="mt-1.5 text-xs text-content-tertiary">
                DJ links opened: {show.djLinks.opened} of {show.djLinks.total}
              </p>
            ) : null}
            {show.soundcheckLabel ? (
              <p className="mt-1.5 text-xs text-content-tertiary">{show.soundcheckLabel}</p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
