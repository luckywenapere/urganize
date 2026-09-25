'use client';

// Browse playlists, pick one, send a song to it.
//
// Extracted from PitchScene 2026-09-09, when the team-wide Pitching page
// arrived and needed the identical composer. The scene keeps its own shell (the
// sent list for one release plus this) and this file owns everything from the
// filters down to the send button, so the two surfaces cannot drift into
// offering different fields or different validation.
//
// It is deliberately RELEASE-AGNOSTIC in shape: it takes a releaseId rather
// than a release, so the page can hand it whichever release the manager picked
// without pretending to be scoped to one.

import { useEffect, useState } from 'react';
import { ExternalLink, Send } from '@/components/icons';
import type { BrowsablePlaylist, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  detectPitchPlatform,
  formatFollowerCount,
  isValidSongUrl,
} from '@/lib/pitching';
import { openExternalUrl } from '@/lib/external-link';
import { CuratorCardListSkeleton } from '@/components/loading/CuratorSkeleton';

type PitchComposerProps = {
  /** The release this pitch belongs to. Empty disables the whole composer. */
  releaseId: string;
  /** Seeds the song title — the release's own title, which is usually right. */
  initialSongTitle: string;
  /** True when this release already has the maximum waiting on a reply. */
  atLimit: boolean;
  /**
   * Narrows the list to one curator, set when an artist arrives from her public
   * page at /pitch/{slug}. Empty for everyone else, which is the ordinary
   * global browse.
   */
  curatorSlug?: string;
  /** Drops that narrowing. Required whenever curatorSlug can be set, because a
   *  pre-filtered list with no way out reads as a broken browse. */
  onClearCurator?: () => void;
  onSent: (pitch: SentPitch) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const labelClass = 'block text-[11px] uppercase tracking-[0.16em] text-content-tertiary';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function PitchComposer({
  releaseId,
  initialSongTitle,
  atLimit,
  curatorSlug,
  onClearCurator,
  onSent,
  onToast,
}: PitchComposerProps) {
  const [playlists, setPlaylists] = useState<BrowsablePlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const curatorFilter = (curatorSlug || '').trim();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [songTitle, setSongTitle] = useState(initialSongTitle);
  const [songUrl, setSongUrl] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  // Playlists are global inventory, refetched when a filter changes rather than
  // filtered client-side: the list is capped server-side, so a filter has to
  // reach the query to be honest about what is available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingPlaylists(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const params = new URLSearchParams();
        if (platformFilter) params.set('platform', platformFilter);
        if (genreFilter.trim()) params.set('genre', genreFilter.trim());
        if (curatorFilter) params.set('curator', curatorFilter);
        const query = params.toString();
        const response = await fetch(`/api/pitching/playlists${query ? `?${query}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json().catch(() => null)) as {
          playlists?: BrowsablePlaylist[];
        } | null;
        if (cancelled || !payload || !Array.isArray(payload.playlists)) return;
        setPlaylists(payload.playlists);
      } finally {
        if (!cancelled) setIsLoadingPlaylists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curatorFilter, genreFilter, platformFilter]);

  const detectedPlatform = detectPitchPlatform(songUrl);
  const canSend =
    Boolean(releaseId) &&
    Boolean(selectedPlaylistId) &&
    songTitle.trim().length > 0 &&
    isValidSongUrl(songUrl) &&
    !atLimit &&
    !isSending;

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSending(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again to send this pitch.');
      const response = await fetch('/api/pitching/pitches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId,
          playlistId: selectedPlaylistId,
          songTitle: songTitle.trim(),
          songUrl: songUrl.trim(),
          note: note.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        pitch?: SentPitch;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || 'Could not send the pitch.');

      onToast('Pitch sent.', 'success');
      setSelectedPlaylistId('');
      setNote('');
      if (payload?.pitch) onSent(payload.pitch);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Could not send the pitch.';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;

  return (
    <>
      {atLimit ? (
        <p className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          This release has {MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies
          before sending more.
        </p>
      ) : null}

      {curatorFilter ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2">
          <p className="text-sm text-content-primary">
            Showing one playlist owner, because you came from their page.
          </p>
          {onClearCurator ? (
            <button
              type="button"
              onClick={onClearCurator}
              className="text-sm underline underline-offset-4 text-content-secondary hover:text-content-primary"
            >
              See everyone
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Filter by platform"
          className={`${inputClass} appearance-none sm:max-w-[12rem]`}
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value)}
        >
          <option value="">All platforms</option>
          {PITCH_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PITCH_PLATFORM_LABELS[platform]}
            </option>
          ))}
        </select>
        <input
          aria-label="Filter by genre"
          className={inputClass}
          value={genreFilter}
          onChange={(event) => setGenreFilter(event.target.value)}
          placeholder="Filter by genre"
        />
      </div>

      {isLoadingPlaylists ? (
        <CuratorCardListSkeleton rows={2} />
      ) : playlists.length === 0 ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          {curatorFilter
            ? 'This playlist owner has nothing listed right now. See everyone to keep looking.'
            : 'No playlists match that. Clear the filters to see everything on offer.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {playlists.map((playlist) => {
            const isSelected = playlist.id === selectedPlaylistId;
            const followers = formatFollowerCount(playlist.followerCount);
            return (
              <li key={playlist.id}>
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? 'border-brand bg-brand/8'
                      : 'border-stroke-default bg-bg-surface hover:border-stroke-strong'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedPlaylistId(isSelected ? '' : playlist.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                        {PITCH_PLATFORM_LABELS[playlist.platform]}
                        {followers ? ` · ${followers} followers` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-content-primary">
                        {playlist.name}
                      </p>
                      <p className="truncate text-xs text-content-secondary">
                        {playlist.curatorName}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openExternalUrl(playlist.url)}
                      aria-label={`Open ${playlist.name}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stroke-default text-content-tertiary transition-colors hover:border-stroke-strong hover:text-content-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {playlist.genres.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {playlist.genres.map((genre) => (
                        <li
                          key={genre}
                          className="rounded-full bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-content-secondary"
                        >
                          {genre}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={handleSend}
        className="space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4"
      >
        <p className="text-sm text-content-secondary">
          {selectedPlaylist
            ? `Pitching to ${selectedPlaylist.name}.`
            : 'Pick a playlist above to pitch to.'}
        </p>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-song-title">
            Song
          </label>
          <input
            id="pitch-song-title"
            className={inputClass}
            value={songTitle}
            maxLength={MAX_SONG_TITLE_LENGTH}
            onChange={(event) => setSongTitle(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-song-url">
            Link to the song
          </label>
          <input
            id="pitch-song-url"
            type="url"
            inputMode="url"
            className={inputClass}
            value={songUrl}
            onChange={(event) => setSongUrl(event.target.value)}
            placeholder="https://…"
            required
          />
          <p className="text-xs text-content-tertiary">
            {detectedPlatform
              ? `Looks like ${PITCH_PLATFORM_LABELS[detectedPlatform]}.`
              : 'Any link works: a private stream, a demo host or a live page.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-note">
            Note
          </label>
          <textarea
            id="pitch-note"
            rows={3}
            className="w-full rounded-xl border border-stroke-default bg-bg-base p-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
            value={note}
            maxLength={MAX_PITCH_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this playlist, in a line or two."
          />
          <p className="text-right font-mono text-[11px] text-content-tertiary">
            {note.length}/{MAX_PITCH_NOTE_LENGTH}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50 sm:w-auto"
        >
          <Send className="h-4 w-4" />
          {isSending ? 'Sending…' : 'Send pitch'}
        </button>
      </form>
    </>
  );
}
