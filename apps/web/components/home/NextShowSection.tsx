import type { HomeNextShow } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

const FIT_LABEL: Record<'over' | 'under' | 'on_time', { text: string; className: string }> = {
  over: { text: 'over the slot', className: 'text-status-error' },
  under: { text: 'under the slot', className: 'text-status-warning' },
  on_time: { text: 'on time', className: 'text-status-info' },
};

export function NextShowSection({ nextShow }: { nextShow: HomeNextShow | null }) {
  if (!nextShow) {
    return (
      <HomeSectionShell title="Next show">
        <EmptyState title="Nothing booked in the next 14 days." className="py-4" />
      </HomeSectionShell>
    );
  }

  const fit = nextShow.setlist ? FIT_LABEL[nextShow.setlist.fit] : null;

  return (
    <HomeSectionShell title="Next show">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
          {nextShow.artistName}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-content-primary">
          {[nextShow.venueName, nextShow.city].filter(Boolean).join(', ') || 'Venue to confirm'}
        </h3>
        <p className="mt-1 text-sm text-content-secondary">
          {nextShow.dateLabel} · {nextShow.setTimeLabel}
        </p>

        {nextShow.setlist ? (
          <p className="mt-3 text-xs text-content-tertiary">
            {nextShow.setlist.isPartial ? 'At least ' : ''}
            {nextShow.setlist.totalMinutes} of {nextShow.setlist.slotMinutes} min set
            {fit ? <span className={`ml-1.5 font-medium ${fit.className}`}>{fit.text}</span> : null}
          </p>
        ) : null}

        {nextShow.djLinks ? (
          <p className="mt-1.5 text-xs text-content-tertiary">
            DJ links opened: {nextShow.djLinks.opened} of {nextShow.djLinks.total}
          </p>
        ) : null}

        {nextShow.soundcheckLabel ? (
          <p className="mt-1.5 text-xs text-content-tertiary">{nextShow.soundcheckLabel}</p>
        ) : null}
      </div>
    </HomeSectionShell>
  );
}
