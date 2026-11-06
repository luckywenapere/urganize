'use client';

// "Is this Tems on streaming?" (Nov 2026, #1088, mock docs/mocks/artist-streaming-link).
// On Home, for every artist not yet linked to their streaming profile, one at a
// time with our best guess already picked. Linking lets Urganize find their
// songs, codes and covers from their own page instead of by name.
//
// "Not now" puts it away for this visit (sessionStorage). "Not on streaming yet"
// stops asking about that artist until one of their rollouts comes out.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { supabase } from '@/lib/supabase/client';
import { isBodyScrollLocked } from '@/lib/body-scroll-lock';
import { pickSuggestion, streamingLinkUrl } from '@/lib/artist-streaming/rules';
import type { ImportArtistCandidate } from '@/lib/artist-import/providers';
import { formatFans, initials } from './ImportParts';

const NOT_NOW_KEY = 'urganize.streaming-link.not-now';
/** Waits for the page to settle before asking, so it never lands on top of a first paint. */
const OPEN_DELAY_MS = 1500;

type ToLink = { id: string; name: string };

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  });
}

function readNotNow(): boolean {
  try {
    return window.sessionStorage.getItem(NOT_NOW_KEY) === '1';
  } catch {
    return false;
  }
}

export function StreamingLinkPrompt() {
  const [queue, setQueue] = useState<ToLink[] | null>(null);
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (readNotNow()) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await authedFetch('/api/workspace/artists/streaming-links');
        if (!response.ok) return;
        const body = (await response.json()) as { artists?: ToLink[] };
        const list = body.artists ?? [];
        if (!live || list.length === 0 || isBodyScrollLocked()) return;
        setQueue(list);
        setTotal(list.length);
        setOpen(true);
      } catch {
        // Nothing to ask about is the safe answer.
      }
    }, OPEN_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  const notNow = useCallback(() => {
    try {
      window.sessionStorage.setItem(NOT_NOW_KEY, '1');
    } catch {
      // Closing still works for this page.
    }
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    setQueue((current) => (current ?? []).slice(1));
  }, []);

  if (!open || !queue || queue.length === 0 || typeof document === 'undefined') return null;
  const artist = queue[0];
  const position = total - queue.length + 1;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Not now" tabIndex={-1} onClick={notNow} className="absolute inset-0 bg-black/60" />
      <DialogPanel
        label={`Link ${artist.name} to streaming`}
        onClose={notNow}
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-stroke-default bg-bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" />
        <LinkOne key={artist.id} artist={artist} position={position} total={total} onDone={next} onNotNow={notNow} />
      </DialogPanel>
    </div>,
    document.body
  );
}

function LinkOne({
  artist,
  position,
  total,
  onDone,
  onNotNow,
}: {
  artist: ToLink;
  position: number;
  total: number;
  onDone: () => void;
  onNotNow: () => void;
}) {
  const [results, setResults] = useState<ImportArtistCandidate[] | null>(null);
  const [query, setQuery] = useState(artist.name);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<'guess' | 'search'>('guess');
  const [chosen, setChosen] = useState<ImportArtistCandidate | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [saving, setSaving] = useState<'link' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const response = await fetch(`/api/artist-import/search?q=${encodeURIComponent(q)}`);
      const body = (await response.json().catch(() => ({}))) as { artists?: ImportArtistCandidate[] };
      setResults(response.ok ? (body.artists ?? []) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void search(artist.name);
  }, [artist.name, search]);

  const guess = useMemo(() => (results ? pickSuggestion(artist.name, results) : null), [results, artist.name]);
  const showing = mode === 'guess' ? guess : chosen;

  // The suggested artist's newest release, so a manager can tell two people with one name apart.
  useEffect(() => {
    if (!showing) return;
    let live = true;
    void fetch(`/api/artist-import/releases?provider=${showing.provider}&id=${encodeURIComponent(showing.id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { releases?: { title: string }[] } | null) => {
        if (live) setLatest(body?.releases?.[0]?.title ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [showing]);

  const link = async (candidate: ImportArtistCandidate) => {
    setSaving('link');
    setError(null);
    try {
      const response = await authedFetch(streamingLinkUrl(artist.id), {
        method: 'POST',
        body: JSON.stringify({ provider: candidate.provider, id: candidate.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not save that. Try again.');
      }
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that. Try again.');
    } finally {
      setSaving(null);
    }
  };

  const skip = async () => {
    setSaving('skip');
    try {
      await authedFetch(streamingLinkUrl(artist.id), {
        method: 'POST',
        body: JSON.stringify({ notOnStreaming: true }),
      });
    } finally {
      setSaving(null);
      onDone();
    }
  };

  const loading = results === null;
  const searchMode = mode === 'search' || (!loading && !guess);

  return (
    <div>
      {total > 1 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          Artist {position} of {total}
        </p>
      ) : null}
      <h2 className="mt-1.5 font-display text-[1.375rem] leading-tight text-content-primary">
        {searchMode && !chosen ? `Find ${artist.name} on streaming` : `Is this ${artist.name} on streaming?`}
      </h2>
      <p className="mt-1.5 text-sm text-content-secondary">
        Linking them lets us find their songs and make smart links for you.
      </p>

      {loading ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Looking for {artist.name}…
        </p>
      ) : searchMode && !chosen ? (
        <div className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim().length >= 2) void search(query.trim());
            }}
            className="flex gap-2"
          >
            <label className="sr-only" htmlFor={`stream-search-${artist.id}`}>
              Artist name
            </label>
            <input
              id={`stream-search-${artist.id}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-stroke-control bg-bg-base px-3 text-base text-content-primary"
            />
            <button
              type="submit"
              aria-label="Search"
              className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stroke-control text-content-primary hover:bg-bg-hover"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>
          {results.length === 0 ? (
            <p className="mt-3 text-sm text-content-secondary">No one by that name on Deezer or Apple Music.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {results.map((candidate) => (
                <li key={`${candidate.provider}:${candidate.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen(candidate);
                      setLatest(null);
                    }}
                    className="motion-focus flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-bg-hover"
                  >
                    <Face candidate={candidate} size={44} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-content-primary">{candidate.name}</span>
                      <span className="block truncate text-[13px] text-content-secondary">
                        {[formatFans(candidate.followers), candidate.provider === 'deezer' ? 'Deezer' : 'Apple Music']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : showing ? (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-stroke-default bg-bg-base p-4">
          <Face candidate={showing} size={64} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-content-primary">{showing.name}</p>
            {showing.followers !== null ? <p className="text-[13px] text-content-secondary">{formatFans(showing.followers)}</p> : null}
            {latest ? <p className="truncate text-[13px] text-content-secondary">Latest: {latest}</p> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {showing && !(searchMode && !chosen) ? (
        <>
          <button
            type="button"
            onClick={() => void link(showing)}
            disabled={saving !== null}
            className="motion-focus motion-press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {saving === 'link' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Yes, that&rsquo;s {artist.name}
          </button>
          <button
            type="button"
            onClick={() => {
              setChosen(null);
              setMode('search');
            }}
            disabled={saving !== null}
            className="motion-focus motion-press mt-2 flex h-11 w-full items-center justify-center rounded-full border border-stroke-control text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-60"
          >
            No, search again
          </button>
        </>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void skip()}
          disabled={saving !== null}
          className="motion-focus h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          Not on streaming yet
        </button>
        <button
          type="button"
          onClick={onNotNow}
          className="motion-focus h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function Face({ candidate, size }: { candidate: ImportArtistCandidate; size: number }) {
  const style = { width: size, height: size };
  return candidate.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={candidate.imageUrl} alt="" style={style} className="shrink-0 rounded-full bg-bg-hover object-cover" />
  ) : (
    <span
      aria-hidden="true"
      style={style}
      className="grid shrink-0 place-items-center rounded-full bg-bg-hover text-sm font-semibold text-content-secondary"
    >
      {initials(candidate.name)}
    </span>
  );
}
