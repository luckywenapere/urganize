'use client';

// Out now on Home (Nov 6, 2026, #1086, option A of docs/mocks/release-day-home,
// founder approved): from release day and for the six days after it, each song
// that came out gets a card on top of Home with its smart link one tap away.
//
// Most songs already have a link by the morning (the pre-save turns into a
// smart link at midnight), so the card usually shows the link to copy. A song
// with no UPC or ISRC gets the code finder instead: we look it up on streaming
// and ask "Is this your song?" before making anything.
//
// Release day on its own (#1090, docs/mocks/release-day-auto-link): nothing is
// shown while a link is looked for or made. The card appears once there is a
// link, or something the team must answer. Tapping the link copies it (#1160).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Disc3, X } from '@/components/icons';
import { copyText } from '@/lib/share-file';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useHiddenNudgeSet } from '@/lib/hidden-nudges';
import { pickOutNow } from '@/lib/code-finder/rules';
import { isAltlinkEnabled, isReleasedOn } from '@/lib/altlink/rules';
import { displayReleaseTitle } from '@/types/releases';
import type { ExecutionRelease } from '@/lib/execution-types';
import { CodeFinderPanel } from '@/components/releases/CodeFinderPanel';
import { useCodeFinder } from '@/components/releases/useCodeFinder';
import { SmartLinkBox } from '@/components/releases/SmartLinkBox';

const ALTLINK_ENABLED = isAltlinkEnabled();
/** How often to look again while a link is being made, and for how long. */
const POLL_MS = 4000;
const POLL_LIMIT = 15;

type LinkView = {
  enabled: boolean;
  configured: boolean;
  link: { url: string | null; status: string } | null;
  notReady: string | null;
};

const TYPE_LABEL: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album' };

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  });
}

/** Every song out this week, newest first. Renders nothing when there are none. */
export function OutNowCards({
  artistId,
  className = '',
  variant = 'card',
}: {
  artistId?: string;
  className?: string;
  /** 'line' is Home on a computer (#1182): the same states as one quiet line
   *  with a link for the action, since this is a small status, not a task. */
  variant?: 'card' | 'line';
}) {
  const releases = useReleaseStore((state) => state.releases);
  // The day changes the list, so it is read once per render of the list, not stored.
  const [now] = useState(() => Date.now());
  const out = useMemo(
    () => pickOutNow(artistId ? releases.filter((r) => r.artistId === artistId) : releases, now),
    [releases, artistId, now]
  );
  const [hidden, hide] = useHiddenNudgeSet(
    'out-now-',
    out.map((release) => release.id)
  );
  const shown = out.filter((release) => !hidden.has(release.id));
  if (!ALTLINK_ENABLED || shown.length === 0) return null;
  return (
    <div className={`${variant === 'line' ? 'space-y-2' : 'space-y-3'} ${className}`}>
      {shown.map((release) => (
        <OutNowCard key={release.id} release={release} now={now} onHide={() => hide(release.id)} variant={variant} />
      ))}
    </div>
  );
}

const LINE_LINK = 'motion-focus shrink-0 text-sm font-semibold text-brand underline underline-offset-[3px] disabled:opacity-60';

function OutNowCard({
  release,
  now,
  onHide,
  variant,
}: {
  release: ExecutionRelease;
  now: number;
  onHide: () => void;
  variant: 'card' | 'line';
}) {
  const [view, setView] = useState<LinkView | null>(null);
  const [copied, setCopied] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const polls = useRef(0);
  const title = displayReleaseTitle(release.title);

  const load = useCallback(async () => {
    try {
      const response = await authedFetch(`/api/releases/${release.id}/altlink`);
      if (!response.ok) return;
      const body = (await response.json()) as { view: LinkView; canWrite: boolean };
      setView(body.view);
      setCanWrite(Boolean(body.canWrite));
    } catch {
      // Keep whatever is showing; the card still opens the rollout.
    }
  }, [release.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const url = view?.link?.url ?? null;
  const making = Boolean(view?.link && !url && view.link.status !== 'failed') || (Boolean(view?.enabled && view?.configured) && !view?.link && !view?.notReady);
  const needsCode = !url && (view?.notReady === 'no_code' || view?.notReady === 'missing_identifier');

  useEffect(() => {
    if (!making || polls.current >= POLL_LIMIT) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      void load();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [making, view, load]);

  const onLinkMade = useCallback(() => {
    polls.current = 0;
    void load();
  }, [load]);
  const finder = useCodeFinder(
    release.id,
    needsCode && canWrite && isReleasedOn(release.releaseDate, now),
    onLinkMade
  );

  const cover = release.coverThumbUrl ?? release.coverArtUrl ?? null;
  const typeCodeHref = `/dashboard?release=${encodeURIComponent(release.id)}&scene=metadata&field=upc`;

  // Only a question the team must answer shows before the link: "Is this your
  // song?", or the "Type the code yourself" a song not found by then gets.
  const finderAsks =
    needsCode && canWrite && (finder.view?.status === 'found' || finder.view?.status === 'looking');
  const offerSetup = !url && !making && !needsCode && Boolean(view && canWrite && !view.link);
  if (!url && !finderAsks && !offerSetup) return null;

  if (variant === 'line') {
    const releaseLink = `/dashboard?release=${encodeURIComponent(release.id)}`;
    const found = finderAsks && finder.view?.status === 'found' ? finder.view.candidate : null;
    const copy = async () => {
      if (!url) return;
      captureAnalyticsEvent({ name: 'out_now_link_copied', properties: { release_id: release.id } });
      if (await copyText(url)) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    };
    return (
      <section
        className="flex min-h-[52px] items-center gap-3 rounded-xl border border-stroke-default bg-bg-surface py-2 pl-4 pr-2"
        data-home-block="out-now"
        aria-label={`${title} is out now`}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-bg-hover text-content-tertiary" aria-hidden="true">
            <Disc3 className="h-4 w-4" />
          </span>
        )}
        <span className="shrink-0 rounded-full bg-brand/10 px-2 text-xs font-semibold leading-5 text-brand">Out now</span>
        <p className="min-w-0 flex-1 truncate text-sm text-content-secondary">
          <Link href={releaseLink} className="motion-focus font-semibold text-content-primary hover:underline">
            {title}
          </Link>{' '}
          by {release.artistName}.{' '}
          {url
            ? 'The smart link is ready.'
            : found
              ? `Found "${found.title}" by ${found.artist} on streaming. Is this your song?`
              : finderAsks
                ? 'Looking for it on streaming. This can take a few hours.'
                : 'It has no smart link yet.'}
          {finder.error ? <span className="text-status-error"> {finder.error}</span> : null}
        </p>
        {url ? (
          <button type="button" onClick={() => void copy()} className={LINE_LINK} aria-live="polite">
            {copied ? 'Link copied' : 'Copy the link'}
          </button>
        ) : found ? (
          <>
            {found.url ? (
              <a href={found.url} target="_blank" rel="noreferrer" className={LINE_LINK}>
                Listen
              </a>
            ) : null}
            <button type="button" className={LINE_LINK} disabled={finder.answering !== null} onClick={() => void finder.answer(true)}>
              Yes, make the link
            </button>
            <button
              type="button"
              className="motion-focus shrink-0 text-sm font-medium text-content-secondary underline underline-offset-[3px] disabled:opacity-60"
              disabled={finder.answering !== null}
              onClick={() => void finder.answer(false)}
            >
              {finder.answering === 'no' ? 'Looking for another…' : 'No'}
            </button>
          </>
        ) : finderAsks ? (
          <Link href={typeCodeHref} className={LINE_LINK}>
            Type the code yourself
          </Link>
        ) : (
          <Link href={`/dashboard/distribute/${encodeURIComponent(release.id)}?tab=link`} className={LINE_LINK}>
            Set up the smart link
          </Link>
        )}
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${title} from Home`}
          className="motion-focus grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section
      className="relative rounded-[20px] border border-stroke-default bg-bg-surface p-4 sm:p-5"
      data-home-block="out-now"
      aria-label={`${title} is out now`}
    >
      <button
        type="button"
        onClick={onHide}
        aria-label={`Hide ${title} from Home`}
        className="hit-44 motion-focus absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <Link
        href={`/dashboard?release=${encodeURIComponent(release.id)}`}
        className="motion-focus flex items-center gap-4 rounded-xl pr-10"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-[84px] w-[84px] shrink-0 rounded-xl object-cover" />
        ) : (
          <span
            className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-xl bg-bg-hover text-content-tertiary"
            aria-hidden="true"
          >
            <Disc3 className="h-7 w-7" />
          </span>
        )}
        <span className="min-w-0">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 text-xs font-semibold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            Out now
          </span>
          <span className="mt-2 block truncate font-display text-[1.375rem] leading-tight text-content-primary">{title}</span>
          <span className="mt-0.5 block truncate text-sm text-content-secondary">
            {release.artistName}
            {TYPE_LABEL[release.releaseType] ? ` · ${TYPE_LABEL[release.releaseType]}` : ''}
          </span>
        </span>
      </Link>

      <div className="mt-4">
        {url ? (
          <SmartLinkBox url={url} title={title} releaseId={release.id} />
        ) : finderAsks ? (
          <CodeFinderPanel
            view={finder.view}
            answering={finder.answering}
            error={finder.error}
            onAnswer={(accept) => void finder.answer(accept)}
            typeCodeHref={typeCodeHref}
            compact
          />
        ) : offerSetup ? (
          <Link
            href={`/dashboard/distribute/${encodeURIComponent(release.id)}?tab=link`}
            className="motion-focus motion-press flex h-11 items-center justify-center rounded-full border border-stroke-control text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            Set up the smart link
          </Link>
        ) : null}
      </div>
    </section>
  );
}
