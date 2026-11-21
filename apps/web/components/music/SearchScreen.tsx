'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from '@/components/icons';
import type { ArtistHit } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';
import { SongListSkeleton, SongRow } from './parts';

/** The playlists the music side will have. Shown, not yet made. */
const PLAYLISTS = ['Top 10', 'Top 50', 'Top 100'] as const;

type Results = { tracks: PublicTrack[]; artists: ArtistHit[] };

export function SearchScreen() {
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
      <h1 className="text-xl font-semibold tracking-tight text-content-primary">Search</h1>

      <div className="relative mt-4">
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
          enterKeyHint="search"
          className="motion-focus h-12 w-full rounded-xl border border-stroke-control bg-bg-surface pl-10 pr-4 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary"
        />
      </div>

      {!showingResults ? (
        <section aria-labelledby="music-playlists" className="mt-6">
          <h2 id="music-playlists" className="text-sm font-semibold text-content-primary">
            Playlists
          </h2>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {PLAYLISTS.map((name) => (
              <li
                key={name}
                className="flex min-h-[56px] items-center justify-between rounded-xl border border-stroke-default bg-bg-surface px-4 py-3 text-content-secondary opacity-70"
              >
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs"><span className="sr-only">{name} is </span>Coming soon</span>
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
                      <li key={artist.name} className="border-b border-stroke-subtle last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setQuery(artist.name)}
                          className="motion-focus flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-1 text-left hover:bg-bg-hover"
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
