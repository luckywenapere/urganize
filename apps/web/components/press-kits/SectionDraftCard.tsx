'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Sparkles } from '@/components/icons';
import type { PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';
import { DRAFT_ALLOWED_FIELDS } from '@/lib/press-kit-draft';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';

/**
 * UrgAns proposes, a person accepts.
 *
 * Nothing here writes. The draft sits in the action row on the server until
 * Accept, and Try again replaces it with another one. Discard leaves the
 * section exactly as it was, which is why there is no confirmation on it.
 *
 * The proposal is shown as plain text rather than dropped into the editor,
 * so what is on screen is unambiguously a suggestion and not something that
 * has already happened.
 */

const FIELD_LABELS: Record<string, string> = {
  descriptor: 'One line',
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  hook: 'The hook',
};

type Props = {
  section: PressKitSectionKey;
  content: PressKitSectionContent;
  /** UrgAns credits the team has, or null when unknown. */
  balance: number | null;
  isBusy: boolean;
  error: string;
  onAccept: () => void;
  onRetry: (notes: string) => void;
  onDiscard: () => void;
};

export function SectionDraftCard({
  section,
  content,
  balance,
  isBusy,
  error,
  onAccept,
  onRetry,
  onDiscard,
}: Props) {
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const fields = (DRAFT_ALLOWED_FIELDS[section] || []).filter(
    (field) => typeof content[field] === 'string' && String(content[field]).trim()
  );

  return (
    <div className="mb-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="text-sm font-semibold text-content-primary">
          Here is a draft. Nothing changes until you tap Use this.
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {fields.map((field) => (
          <div key={field}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {FIELD_LABELS[field] || field}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">
              {String(content[field])}
            </p>
          </div>
        ))}
      </div>

      {showNotes ? (
        <div className="mt-4">
          <label
            htmlFor="press-kit-draft-notes"
            className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary"
          >
            What should it say instead?
          </label>
          <textarea
            id="press-kit-draft-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="They just came off a tour, and the record is about coming home."
            className="mt-1.5 w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
          />
          <p className="mt-1 text-xs text-content-tertiary">
            Tell it what to change. Rough notes are fine.
          </p>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}

      {isCreditsEnabled() ? (
        <p className="mt-3 text-xs text-content-tertiary">Another try: {embeddedCostLine('presskit.draft_section', balance)}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={isBusy}
          className="motion-focus inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Use this
        </button>
        <button
          type="button"
          onClick={() => (showNotes ? onRetry(notes) : setShowNotes(true))}
          disabled={isBusy}
          className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {showNotes ? 'Try again' : 'Not quite'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={isBusy}
          className="motion-focus rounded-lg px-2 py-2 text-sm text-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          Leave it
        </button>
      </div>
    </div>
  );
}
