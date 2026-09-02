'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  SONG_VERSION_LABEL_COPY,
  describeSetlistFit,
  formatDuration,
  summarizeSetlist,
  type SetlistItemType,
  type SetlistSummaryItem,
} from '@/lib/setlist';

/** One row as the API returns it, already enriched with its song and version. */
type BuilderItem = {
  id: string;
  itemType: SetlistItemType;
  songId: string | null;
  position: number;
  durationSeconds: number | null;
  cueNote: string | null;
  label: string | null;
  song: {
    id: string;
    title: string;
    durationSeconds: number | null;
    musicalKey: string | null;
    bpm: number | null;
  } | null;
  version: { id: string; label: string; durationSeconds: number | null } | null;
  resolvedDurationSeconds: number | null;
  durationSource: 'item' | 'version' | 'song' | null;
};

type CatalogSong = { id: string; title: string; durationSeconds: number | null };

type SetlistBuilderProps = {
  setlistId: string;
  artistId: string;
  setLengthMinutes: number;
};

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

const NON_SONG_TYPES: { type: SetlistItemType; label: string; seconds: number }[] = [
  { type: 'talk', label: 'Talk', seconds: 60 },
  { type: 'interlude', label: 'Interlude', seconds: 90 },
  { type: 'break', label: 'Break', seconds: 60 },
];

/**
 * The setlist, and the number that makes it worth having.
 *
 * The running total is recomputed locally on every change from the SAME pure
 * summarizeSetlist the API uses, so the figure never lags a round trip while
 * the manager is reordering — and cannot disagree with the server's, because
 * there is one implementation.
 *
 * REORDER IS BUTTONS, NOT DRAG, and that is a deliberate shortfall against the
 * spec's "drag to reorder". Native HTML5 drag does not work on touch at all,
 * and this is a tool a manager uses on a phone backstage; a real drag would
 * mean a new dependency, which the stack rules ask us not to add without a
 * documented need. Up and down move a row from any device and are reachable by
 * keyboard. Worth revisiting with a library if reordering long sets becomes
 * the daily friction.
 */
export function SetlistBuilder({ setlistId, artistId, setLengthMinutes }: SetlistBuilderProps) {
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState('');

  const loadItems = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/setlists/${setlistId}/items`, { headers });
    if (!response.ok) {
      setError(await readError(response, 'Could not load the set.'));
      setIsLoading(false);
      return;
    }
    const body = await response.json();
    setItems(Array.isArray(body.items) ? body.items : []);
    setError('');
    setIsLoading(false);
  }, [setlistId]);

  const loadCatalog = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/songs?artistId=${encodeURIComponent(artistId)}`, { headers });
    if (!response.ok) return;
    const body = await response.json();
    setCatalog(Array.isArray(body.songs) ? body.songs : []);
  }, [artistId]);

  useEffect(() => {
    void loadItems();
    void loadCatalog();
  }, [loadItems, loadCatalog]);

  // Local recompute, from the same function the server runs. This is what keeps
  // the total honest while dragging rows around before anything is saved.
  const summary = useMemo(() => {
    const inputs: SetlistSummaryItem[] = items.map((item) => ({
      itemType: item.itemType,
      itemSeconds: item.durationSeconds,
      versionSeconds: item.version?.durationSeconds ?? null,
      songSeconds: item.song?.durationSeconds ?? null,
    }));
    return summarizeSetlist(inputs, setLengthMinutes);
  }, [items, setLengthMinutes]);

  const mutate = async (run: () => Promise<Response>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await run();
      if (!response.ok) {
        setError(await readError(response, fallback));
        return;
      }
      await loadItems();
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const addSong = async (songId: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    await mutate(
      () =>
        fetch(`/api/setlists/${setlistId}/items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ itemType: 'song', songId }),
        }),
      'Could not add that song.'
    );
  };

  const addNonSong = async (type: SetlistItemType, seconds: number, label: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    await mutate(
      () =>
        fetch(`/api/setlists/${setlistId}/items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ itemType: type, durationSeconds: seconds, label }),
        }),
      `Could not add the ${label.toLowerCase()}.`
    );
  };

  const createSong = async () => {
    const title = newSongTitle.trim();
    if (!title) return;
    const headers = await authHeaders();
    if (!headers) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/songs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ artistId, title }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not add the song.'));
        return;
      }
      const body = await response.json();
      setNewSongTitle('');
      await loadCatalog();
      if (body.song?.id) await addSong(body.song.id);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    // Optimistic: the row moves under the thumb, and the total recomputes with
    // it. A failed save reloads the server's order over the top.
    setItems(next);

    const headers = await authHeaders();
    if (!headers) return;
    await mutate(
      () =>
        fetch(`/api/setlists/${setlistId}/reorder`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ itemIds: next.map((item) => item.id) }),
        }),
      'Could not save the new order.'
    );
  };

  const setDuration = async (itemId: string, value: string) => {
    const seconds = Number.parseInt(value, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const headers = await authHeaders();
    if (!headers) return;
    await mutate(
      () =>
        fetch(`/api/setlists/${setlistId}/items/${itemId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ durationSeconds: seconds }),
        }),
      'Could not save that length.'
    );
  };

  const removeItem = async (itemId: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    await mutate(
      () => fetch(`/api/setlists/${setlistId}/items/${itemId}`, { method: 'DELETE', headers }),
      'Could not remove that.'
    );
  };

  const fitClass =
    summary.fit === 'over'
      ? 'border-status-error/30 bg-status-error/10 text-status-error'
      : summary.fit === 'on_time'
        ? 'border-brand/30 bg-brand/10 text-brand'
        : 'border-stroke-default bg-bg-surface text-content-secondary';

  const iconButton =
    'motion-focus grid h-7 w-7 place-items-center rounded-md text-content-tertiary hover:text-content-primary disabled:opacity-30';

  return (
    <div>
      {/* The running total. First thing on the panel, because it is the reason
          the panel exists. */}
      <div className={`rounded-xl border p-4 ${fitClass}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-2xl font-semibold">
            {formatDuration(summary.totalSeconds)}
            {summary.isPartial ? <span className="text-base font-normal"> so far</span> : null}
          </p>
          <p className="text-sm">of {setLengthMinutes} min</p>
        </div>
        <p className="mt-1 text-sm">{describeSetlistFit(summary)}</p>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <ol className="mt-4 space-y-2">
        {isLoading ? (
          [0, 1, 2].map((key) => (
            <li
              key={key}
              className="h-14 animate-pulse rounded-lg border border-stroke-default bg-bg-surface"
            />
          ))
        ) : items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
            Nothing in the set yet. Add the first song below.
          </li>
        ) : (
          items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-stroke-default bg-bg-surface p-3"
            >
              <span className="w-6 shrink-0 text-center font-mono text-xs text-content-tertiary">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-content-primary">
                  {item.itemType === 'song'
                    ? item.song?.title || 'Song'
                    : item.label || item.itemType}
                  {item.version ? (
                    <span className="ml-1.5 font-normal text-content-tertiary">
                      (
                      {SONG_VERSION_LABEL_COPY[
                        item.version.label as keyof typeof SONG_VERSION_LABEL_COPY
                      ] || item.version.label}
                      )
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-content-tertiary">
                  {item.resolvedDurationSeconds === null ? (
                    // Never rendered as 0:00 — an unmeasured item asks for a
                    // number rather than quietly counting as nothing.
                    <label className="inline-flex items-center gap-1.5 text-status-warning">
                      Needs a length
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="secs"
                        onBlur={(blurEvent) => void setDuration(item.id, blurEvent.target.value)}
                        className="h-6 w-16 rounded border border-stroke-default bg-bg-base px-1 text-xs text-content-primary outline-none focus:border-brand"
                      />
                    </label>
                  ) : (
                    <span>{formatDuration(item.resolvedDurationSeconds)}</span>
                  )}
                  {item.song?.bpm ? <span>{item.song.bpm} BPM</span> : null}
                  {item.song?.musicalKey ? <span>{item.song.musicalKey}</span> : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0 || busy}
                  aria-label={`Move ${item.song?.title || 'item'} up`}
                  className={iconButton}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === items.length - 1 || busy}
                  aria-label={`Move ${item.song?.title || 'item'} down`}
                  className={iconButton}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void removeItem(item.id)}
                  disabled={busy}
                  aria-label={`Remove ${item.song?.title || 'item'} from the set`}
                  className={`${iconButton} hover:text-status-error`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))
        )}
      </ol>

      <div className="mt-5 space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Add to the set
        </p>

        {catalog.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {catalog.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => void addSong(song.id)}
                disabled={busy}
                className="motion-focus rounded-full border border-stroke-default px-3 py-1 text-xs font-semibold text-content-secondary hover:border-brand hover:text-content-primary disabled:opacity-50"
              >
                {song.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            value={newSongTitle}
            onChange={(changeEvent) => setNewSongTitle(changeEvent.target.value)}
            placeholder="New song title"
            className="h-9 flex-1 rounded-lg border border-stroke-default bg-bg-base px-3 text-content-primary outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => void createSong()}
            disabled={busy || !newSongTitle.trim()}
            className="motion-focus motion-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-stroke-subtle pt-3">
          {NON_SONG_TYPES.map((entry) => (
            <button
              key={entry.type}
              type="button"
              onClick={() => void addNonSong(entry.type, entry.seconds, entry.label)}
              disabled={busy}
              className="motion-focus rounded-full border border-stroke-default px-3 py-1 text-xs font-semibold text-content-secondary hover:border-brand hover:text-content-primary disabled:opacity-50"
            >
              + {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
