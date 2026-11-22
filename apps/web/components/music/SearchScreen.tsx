'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Search } from '@/components/icons/lucide';
import { readPreviousLocation } from '@/lib/nav-history';
import type { ArtistHit } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';
import { SongListSkeleton, SongRow } from './parts';

/** The playlists the music side will have. Shown, not yet made. */
const PLAYLISTS = ['Top 10', 'Top 50', 'Top 100'] as const;

type Results = { tracks: PublicTrack[]; artists: ArtistHit[] };

/** Search (#1364): a page pushed on top of the tabs, with Back to where you
 *  were, the field ready to type, and the coming-soon playlists as cassettes. */
export function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const requestRef = useRef(0);
  const trimmed = query.trim();

  // Wait for a pause in typing, then ask. A newer question always wins, so a
  // slow answer to "la" can never overwrite the answer to "lagos".
  useEffect(() => {
    if (!trimmed) return;
    const request = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await fetch(`/api/music/tracks?q=${encodeURIComponent(trimmed)}`);
        const data = (await response.json().catch(() => ({}))) as {
          tracks?: PublicTrack[];
          artists?: ArtistHit[];
        };
        if (request !== requestRef.current) return;
        if (!response.ok || !Array.isArray(data.tracks)) {
          setStatus('error');
          return;
        }
        setResults({ tracks: data.tracks, artists: Array.isArray(data.artists) ? data.artists : [] });
        setStatus('idle');
      } catch {
        if (request === requestRef.current) setStatus('error');
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const showingResults = trimmed.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const previous = readPreviousLocation();
          if (previous && previous.startsWith('/music') && !previous.startsWith('/music/search')) router.back();
          else router.push('/music');
        }}
        className="motion-focus -ml-2 flex h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        Back
      </button>
      <h1 className="sr-only">Search</h1>

      <div className="relative mt-2.5 md:max-w-xl">
        <label htmlFor="music-search" className="sr-only">
          Search songs or artists
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary"
          aria-hidden="true"
        />
        <input
          id="music-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Songs or artists"
          autoComplete="off"
          autoFocus
          enterKeyHint="search"
          className="motion-focus h-12 w-full rounded-[14px] border border-stroke-control bg-bg-surface pl-10 pr-4 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary"
        />
      </div>

      {!showingResults ? (
        <section aria-labelledby="music-playlists" className="mt-6">
          <h2 id="music-playlists" className="text-[15px] font-bold tracking-[-0.02em] text-content-primary">
            Playlists
          </h2>
          <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-2.5 p-0 md:max-w-xl md:grid-cols-3">
            {PLAYLISTS.map((name) => (
              <li
                key={name}
                className="relative h-[92px] rounded-xl border border-content-primary/[0.16] bg-bg-surface/80 px-3 py-2.5 opacity-[0.62]"
              >
                <span className="block text-[15px] font-semibold tracking-[-0.02em] text-content-primary">{name}</span>
                <span className="block text-[11.5px] text-content-tertiary">
                  <span className="sr-only">{name} is </span>Coming soon
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-2.5 flex h-[26px] items-center justify-between rounded-md border border-content-primary/[0.16] px-3"
                >
                  <span className="h-4 w-4 rounded-full border-[3px] border-content-primary/[0.16]" />
                  <span className="h-4 w-4 rounded-full border-[3px] border-content-primary/[0.16]" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-5" aria-live="polite">
          {status === 'loading' && !results ? <SongListSkeleton rows={4} /> : null}

          {status === 'error' ? (
            <p role="alert" className="text-sm text-content-secondary">
              We could not search just now. Try again.
            </p>
          ) : null}

          {results && status !== 'error' ? (
            <>
              {results.artists.length > 0 ? (
                <section aria-labelledby="music-artists" className="mb-5">
                  <h2 id="music-artists" className="text-sm font-semibold text-content-primary">
                    Artists
                  </h2>
                  <ul className="m-0 mt-1 list-none p-0">
                    {results.artists.map((artist) => (
                      <li key={artist.name} className="border-b border-content-primary/[0.08] last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setQuery(artist.name)}
                          className="motion-focus flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-1 text-left hover:bg-content-primary/[0.06]"
                        >
                          <span className="truncate text-sm font-medium text-content-primary">{artist.name}</span>
                          <span className="flex-none text-xs text-content-secondary">
                            {artist.songs} {artist.songs === 1 ? 'song' : 'songs'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="music-songs">
                <h2 id="music-songs" className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                  Songs
                  {status === 'loading' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-content-secondary" aria-hidden="true" />
                  ) : null}
                </h2>
                {results.tracks.length > 0 ? (
                  <ul className="m-0 mt-1 list-none p-0">
                    {results.tracks.map((track) => (
                      <SongRow key={track.id} track={track} queue={results.tracks} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-content-secondary">
                    Nothing matches &ldquo;{trimmed}&rdquo;. Try another word.
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
