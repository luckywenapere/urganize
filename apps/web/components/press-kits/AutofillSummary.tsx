'use client';

import { Sparkles } from 'lucide-react';
import { PRESS_KIT_SECTION_LABELS } from '@/lib/press-kits';
import type { AutofillSummary as Counts } from '@/lib/press-kit-autofill';
import type { PressKitSectionKey } from '@/types/press-kits';

/**
 * What the product filled in for you, and what it still needs.
 *
 * The brief's second step: before asking a person for anything, show them the
 * work that was already done. Bespoke, because there is no reusable
 * propose-and-accept surface in this repo; the voice matches PlanScene's
 * banners.
 *
 * The counts are only known in the response that created the kit, so they are
 * optional. On every later visit the card still does its main job, which is
 * naming the gaps and offering the interview.
 */

type Props = {
  counts: Counts | null;
  filled: PressKitSectionKey[];
  gapCount: number;
  onStart: () => void;
};

const countLine = (counts: Counts): string => {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(counts.releases, 'release', 'releases');
  add(counts.songs, 'song', 'songs');
  add(counts.shows, 'show', 'shows');
  add(counts.credits, 'credit', 'credits');
  add(counts.members, 'teammate', 'teammates');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

export function AutofillSummary({ counts, filled, gapCount, onStart }: Props) {
  const found = counts ? countLine(counts) : '';

  if (gapCount === 0 && !found) return null;

  return (
    <div className="mb-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          {found ? (
            <p className="text-sm text-content-primary">
              Filled in from your {found}.
            </p>
          ) : (
            <p className="text-sm text-content-primary">
              Some of this kit is already filled in from your releases.
            </p>
          )}

          {filled.length > 0 ? (
            <p className="mt-1 text-sm text-content-secondary">
              {filled.map((key) => PRESS_KIT_SECTION_LABELS[key]).join(', ')}.
            </p>
          ) : null}

          {gapCount > 0 ? (
            <>
              <p className="mt-3 text-sm text-content-secondary">
                {gapCount === 1
                  ? 'One thing is still missing, and only you can answer it.'
                  : `${gapCount} things are still missing, and only you can answer them.`}{' '}
                It takes a couple of minutes and you can stop partway.
              </p>
              <button
                type="button"
                onClick={onStart}
                className="motion-focus mt-3 inline-flex items-center rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse"
              >
                Fill in the gaps
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-content-secondary">
              Nothing is missing. Edit any section below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
