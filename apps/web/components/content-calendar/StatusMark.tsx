'use client';

import { Check } from '@/components/icons';
import type { ContentPostStatus } from '@/types/content-calendar';

/**
 * Status-mark glyph for the content calendar (URG-157, Phase A). Encodes
 * status by shape + fill, color secondary, so it reads for colorblind users
 * in the brand island's two-green palette:
 *   - draft  -> hollow ring
 *   - ready  -> filled dot
 *   - posted -> check glyph
 * Overdue-unposted posts get a muted-alert treatment on top of the
 * draft/ready glyph (a reduced-opacity wrapper), never a new color.
 *
 * When the post is eligible for one-tap mark-posted (canQuickTogglePosted),
 * this renders as a BUTTON that PATCHes the posted/draft toggle directly,
 * mirroring TaskCompletionCheckbox's row-action split. It stops propagation
 * so a click here never also triggers a sibling "open edit" control.
 *
 * Otherwise it's a decorative, aria-hidden glyph: the status word is carried
 * by the parent chip's own aria-label (getStatusLabel below builds that
 * text) rather than duplicated here.
 */

export function getStatusLabel(status: ContentPostStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'ready':
      return 'Ready';
    case 'posted':
      return 'Posted';
    default:
      return 'Draft';
  }
}

type StatusMarkProps = {
  status: ContentPostStatus;
  overdue: boolean;
  canToggle: boolean;
  onToggle?: () => void;
  className?: string;
};

// Glyphs sit on forest chip surfaces in BOTH themes, so they use the
// on-fill/chip-accent vars (spring + cream on forest, never the page-level
// accent, which flips to forest itself in light mode).
function StatusGlyph({ status, overdue }: { status: ContentPostStatus; overdue: boolean }) {
  if (status === 'posted') {
    return <Check className="h-3 w-3 text-[var(--cc-chip-accent)]" strokeWidth={3} aria-hidden="true" />;
  }

  if (status === 'ready') {
    return (
      <span
        aria-hidden="true"
        className={`block h-2.5 w-2.5 rounded-full bg-[var(--cc-chip-accent)] ${overdue ? 'opacity-55' : ''}`}
      />
    );
  }

  // draft
  return (
    <span
      aria-hidden="true"
      className={`block h-2.5 w-2.5 rounded-full border ${
        overdue ? 'border-[var(--cc-on-fill)]/60' : 'border-[var(--cc-on-fill-muted)]'
      }`}
    />
  );
}

export function StatusMark({ status, overdue, canToggle, onToggle, className = '' }: StatusMarkProps) {
  if (!canToggle) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}
      >
        <StatusGlyph status={status} overdue={overdue} />
      </span>
    );
  }

  const nextStatusLabel = status === 'posted' ? 'draft' : 'posted';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
      title={overdue ? 'Overdue' : `Mark ${nextStatusLabel}`}
      aria-label={`Mark ${nextStatusLabel}`}
      // 28px hit area around the 10-12px glyph (this is the calendar's primary
      // one-tap action, and 16px was far under the 24px WCAG floor). The
      // negative margins keep the LAYOUT footprint at the old 16px so chips
      // don't grow; the small overlap into neighbors is safe because later
      // siblings paint (and hit-test) above this button.
      className={`-mx-1.5 -my-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center transition-opacity hover:opacity-75 ${className}`}
    >
      <StatusGlyph status={status} overdue={overdue} />
    </button>
  );
}
