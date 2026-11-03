'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Sparkles } from '@/components/icons';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';

/**
 * UrgAns proposes a bio, the person accepts it.
 *
 * The directory twin of components/press-kits/SectionDraftCard.tsx, and the
 * same contract: nothing here writes. The draft sits in the action row on the
 * server until "Use this", "Not quite" replaces it with another, and "Leave it"
 * keeps the bio exactly as it was, which is why there is no confirmation on it.
 *
 * Shown as plain text rather than dropped into the field, so what is on screen
 * is unambiguously a suggestion and not something that has already happened.
 */

type Props = {
  bio: string;
  /** UrgAns credits the team has, or null when unknown. */
  balance: number | null;
  isBusy: boolean;
  error: string;
  onAccept: () => void;
  onRetry: (notes: string) => void;
  onDiscard: () => void;
};

export function BioDraftCard({ bio, balance, isBusy, error, onAccept, onRetry, onDiscard }: Props) {
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="text-sm font-semibold text-content-primary">
          AI wrote this. Nothing is saved until you accept it.
        </p>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-content-primary">{bio}</p>

      {showNotes ? (
        <div className="mt-4">
          <label
            htmlFor="directory-bio-draft-notes"
            className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary"
          >
            What should it say instead?
          </label>
          <textarea
            id="directory-bio-draft-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="I mix for Afrobeats artists and I care about vocals."
            className="mt-1.5 w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand focus:outline-none"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {isCreditsEnabled() ? (
        <p className="mt-3 text-xs text-content-tertiary">
          Another try: {embeddedCostLine('directory.draft_bio', balance)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={isBusy}
          className="motion-focus inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Use this
        </button>
        <button
          type="button"
          onClick={() => (showNotes ? onRetry(notes) : setShowNotes(true))}
          disabled={isBusy}
          className="motion-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stroke-control px-4 text-sm text-content-secondary hover:border-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {showNotes ? 'Try again' : 'Not quite'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={isBusy}
          className="motion-focus min-h-11 rounded-lg px-3 text-sm text-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          Leave it
        </button>
      </div>
    </div>
  );
}
