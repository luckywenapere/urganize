'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from '@/components/icons';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { artistSummary } from '@/lib/artist-overview';
import { answerDuplicatePair, fetchDuplicatePairs } from '@/lib/artist-merge-client';
import type { DuplicatePair } from '@/lib/artist-merge';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useReleaseStore } from '@/stores/useReleaseStore';

const DIALOG_Z = 'z-[220]';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function Faces({ pair, size }: { pair: DuplicatePair; size: number }) {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <span className="rounded-full ring-[3px] ring-bg-elevated">
        <ProfileFace name={pair.keep.name} photoUrl={pair.keep.photoUrl} size={size} />
      </span>
      <span className="relative z-10 -mx-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-content-inverse ring-[3px] ring-bg-elevated">
        <Link2 className="h-3.5 w-3.5" />
      </span>
      <span className="rounded-full ring-[3px] ring-bg-elevated">
        <ProfileFace name={pair.drop.name} photoUrl={pair.drop.photoUrl} size={size} />
      </span>
    </div>
  );
}

/** The kept artist as it will be after the join: "2 rollouts · +14 past releases". */
function After({ pair }: { pair: DuplicatePair }) {
  const { keep, drop } = pair;
  // Counted from the rollouts this person sees, the same count as the list
  // behind the popup, so the numbers agree. Before that list has loaded, the
  // server's count stands in rather than a wrong "0 rollouts".
  const releases = useReleaseStore((state) => state.releases);
  const rollouts =
    releases.length > 0
      ? artistSummary(keep.id, releases).releases + artistSummary(drop.id, releases).releases
      : keep.rollouts + drop.rollouts;
  return (
    <div className="mt-5 text-left">
      <p className="mb-1.5 pl-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-content-tertiary">
        You&rsquo;ll have
      </p>
      <div className="flex items-center gap-3 rounded-2xl border border-stroke-subtle bg-bg-surface px-3.5 py-3">
        <ProfileFace name={keep.name} photoUrl={keep.photoUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-content-primary">{keep.name}</p>
          <p className="text-xs text-content-secondary">
            {plural(rollouts, 'rollout', 'rollouts')}
            {drop.pastReleases > 0 ? (
              <>
                {' · '}
                <span className="font-semibold text-brand">
                  +{plural(drop.pastReleases, 'past release', 'past releases')}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * "Dorian and Babyboy Dorian, same artist?" (#865, founder approved the mock
 * "artist-fuse"). Shows on the Artists page while the team has look-alike
 * artists it has not answered. The server only returns pairs to the owner and
 * admins. Closing it is "not now": the next visit asks again. "They're
 * different" is remembered for good. A centred card on desktop, a sheet from
 * the bottom on a phone.
 */
export function DuplicateArtistsPrompt() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [total, setTotal] = useState(0);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState<'join' | 'dismiss' | null>(null);
  const [error, setError] = useState('');
  const loadRoster = useArtistRosterStore((state) => state.load);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  useEffect(() => {
    let live = true;
    void fetchDuplicatePairs().then((found) => {
      if (!live || found.length === 0) return;
      setPairs(found);
      setTotal(found.length);
      captureAnalyticsEvent({ name: 'artist_duplicate_shown', properties: { pairs: found.length } });
    });
    return () => {
      live = false;
    };
  }, []);

  const pair = closed ? null : pairs[0] ?? null;
  const open = pair !== null;

  const close = useCallback(() => {
    setClosed(true);
    captureAnalyticsEvent({ name: 'artist_duplicate_answered', properties: { answer: 'later' } });
  }, []);

  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const answer = async (choice: 'join' | 'dismiss') => {
    if (!pair || busy) return;
    setBusy(choice);
    setError('');
    const failed = await answerDuplicatePair(pair, choice);
    setBusy(null);
    if (failed) {
      setError(failed);
      return;
    }
    captureAnalyticsEvent({ name: 'artist_duplicate_answered', properties: { answer: choice } });
    if (choice === 'join') {
      void loadRoster({ force: true });
      void loadCommandCenter({ force: true });
    }
    setPairs((current) => current.slice(1));
  };

  if (!pair || typeof document === 'undefined') return null;
  const index = total - pairs.length;

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 ${DIALOG_Z} flex h-[100dvh] items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:px-4`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-artists-title"
        className="relative w-full max-w-md rounded-t-[26px] bg-bg-elevated px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-center shadow-xl sm:rounded-[22px] sm:px-6 sm:pb-5 sm:pt-7"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-stroke-default sm:hidden" aria-hidden="true" />
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="motion-press absolute right-3.5 top-3.5 hidden h-8 w-8 items-center justify-center rounded-full text-content-tertiary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary sm:flex"
        >
          <X className="h-4 w-4" />
        </button>

        <Faces pair={pair} size={64} />
        <h2
          id="duplicate-artists-title"
          className="mt-4 text-balance font-display text-[22px] font-semibold leading-tight text-content-primary"
        >
          {pair.keep.name} and {pair.drop.name}, same artist?
        </h2>
        <p className="mt-1.5 text-sm text-content-secondary">Join them and everything sits in one place.</p>

        <After pair={pair} />

        {error ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void answer('join')}
          disabled={busy !== null}
          autoFocus
          className="motion-press mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:opacity-60"
        >
          {busy === 'join' ? 'Joining…' : 'Join them'}
        </button>
        <button
          type="button"
          onClick={() => void answer('dismiss')}
          disabled={busy !== null}
          className="motion-press mt-1.5 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-content-secondary transition-colors duration-fast ease-standard hover:text-content-primary disabled:opacity-60"
        >
          {busy === 'dismiss' ? 'Saving…' : 'They’re different'}
        </button>

        {total > 1 ? (
          <div className="mt-2 flex justify-center gap-1.5" aria-label={`${index + 1} of ${total}`}>
            {Array.from({ length: total }, (_, dot) => (
              <span
                key={dot}
                className={`h-1.5 rounded-full transition-all duration-fast ease-standard ${
                  dot === index ? 'w-4 bg-content-primary' : 'w-1.5 bg-stroke-default'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
