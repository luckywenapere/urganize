'use client';

// "Is this your song?" (Nov 2026, #1086). Shown where a released song has no
// UPC or ISRC: on the Out now card on Home and on the smart link on Distribute.
// It shows what was found on streaming and waits for a yes before anything is
// saved, because the smart link it makes is public.

import Link from 'next/link';
import { Loader2 } from '@/components/icons';
import type { CodeFinderClientView } from './useCodeFinder';

const SOURCE_NAME = { deezer: 'Deezer', spotify: 'Spotify' } as const;

type Props = {
  view: CodeFinderClientView | null;
  answering: 'yes' | 'no' | null;
  error: string | null;
  onAnswer: (accept: boolean) => void;
  /** Where to type the code by hand. */
  typeCodeHref: string;
  /** On Home the card already shows the cover, so the found song is a line. */
  compact?: boolean;
};

const GREEN =
  'motion-focus motion-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET =
  'motion-focus motion-press flex h-11 w-full items-center justify-center rounded-full border border-stroke-control text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-60';

export function CodeFinderPanel({ view, answering, error, onAnswer, typeCodeHref, compact = false }: Props) {
  if (!view || view.status === 'has_code' || view.status === 'not_out' || view.status === 'confirmed') {
    if (view?.status === 'confirmed') {
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Making your smart link. It takes about a minute.
        </p>
      );
    }
    if (!view) {
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Looking for your song on streaming…
        </p>
      );
    }
    return null;
  }

  if (view.status === 'looking') {
    return (
      <div>
        <p role="status" className="flex items-start gap-2 text-sm text-content-secondary">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>
            Looking for your song on streaming. Songs can take a few hours to show up on release day, so we’ll keep
            looking.
          </span>
        </p>
        <Link href={typeCodeHref} className={`${QUIET} mt-3`}>
          Type the code yourself
        </Link>
      </div>
    );
  }

  const { candidate } = view;
  return (
    <div>
      <p className="text-sm font-semibold text-content-primary">Is this your song?</p>
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-stroke-default bg-bg-base p-3">
        {!compact && candidate.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content-primary">{candidate.title}</p>
          <p className="truncate text-[13px] text-content-secondary">
            {candidate.artist} · on {SOURCE_NAME[candidate.source]}
          </p>
        </div>
        {candidate.url ? (
          <a
            href={candidate.url}
            target="_blank"
            rel="noreferrer"
            className="motion-focus shrink-0 text-[13px] font-semibold text-brand hover:underline"
          >
            Listen
          </a>
        ) : null}
      </div>
      <button type="button" className={`${GREEN} mt-3`} disabled={answering !== null} onClick={() => onAnswer(true)}>
        {answering === 'yes' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Yes, make the link
      </button>
      <button type="button" className={`${QUIET} mt-2`} disabled={answering !== null} onClick={() => onAnswer(false)}>
        {answering === 'no' ? 'Looking for another…' : 'No, that’s not it'}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
