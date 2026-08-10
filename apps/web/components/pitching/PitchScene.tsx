'use client';

// The team side of playlist pitching, rendered inline in the workspace's
// activity slot like every other release scene.
//
// Two halves: what has been sent (with each curator's answer) and a composer for
// sending the next one. The composer's playlist browser is a global list, so it
// loads on demand rather than through the per-release scene cache.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { Release } from '@/types/releases';
import type { BrowsablePlaylist, PitchStatus, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  PITCH_STATUS_LABELS,
  detectPitchPlatform,
  formatFollowerCount,
  isValidSongUrl,
} from '@/lib/pitching';
import { formatRelativeTime } from '@/lib/relative-time';
import { openExternalUrl } from '@/lib/external-link';
import { CuratorCardListSkeleton } from '@/components/loading/CuratorSkeleton';

type PitchSceneProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName'>;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const labelClass = 'block text-[11px] uppercase tracking-[0.16em] text-content-tertiary';

const statusPillClass = (status: PitchStatus): string => {
  const base =
    'inline-flex h-6 shrink-0 items-center rounded-full px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]';
  if (status === 'added') return `${base} bg-brand/15 text-brand`;
  if (status === 'passed') return `${base} bg-bg-elevated text-content-secondary`;
  if (status === 'listened') return `${base} bg-status-info/15 text-status-info`;
  return `${base} bg-status-warning/15 text-status-warning`;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function SentPitchRow({ pitch }: { pitch: SentPitch }) {
  return (
    <li className="rounded-xl border border-stroke-default bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content-primary">
            {pitch.playlistName}
          </p>
          <p className="truncate text-xs text-content-secondary">
            {pitch.curatorName} · {pitch.songTitle}
          </p>
        </div>
        <span className={statusPillClass(pitch.status)}>{PITCH_STATUS_LABELS[pitch.status]}</span>
      </div>
      {pitch.reply ? (
        <p className="mt-2 rounded-lg bg-bg-elevated px-2 py-1.5 text-sm text-content-secondary">
          {pitch.reply}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[11px] text-content-tertiary">
        Sent {formatRelativeTime(pitch.createdAt)} by {pitch.pitcherName}
      </p>
    </li>
  );
}

export function PitchScene({ release, onToast }: PitchSceneProps) {
  const loadScene = useSceneDataStore((state) => state.loadScene);
  const getScene = useSceneDataStore((state) => state.getScene);
  const cached = getScene(release.id, 'pitch');

  const [pitches, setPitches] = useState<SentPitch[]>(cached?.pitches || []);
  const [isLoadingPitches, setIsLoadingPitches] = useState(!cached);

  const [playlists, setPlaylists] = useState<BrowsablePlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');

  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [songTitle, setSongTitle] = useState(release.title || '');
  const [songUrl, setSongUrl] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const refreshPitches = useCallback(
    async (force = false) => {
      try {
        const payload = await loadScene(release.id, 'pitch', { force });
        if (payload) setPitches(payload.pitches);
      } finally {
        setIsLoadingPitches(false);
      }
    },
    [loadScene, release.id]
  );

  useEffect(() => {
    void refreshPitches();
  }, [refreshPitches]);

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
  }, [genreFilter, platformFilter]);

  const waitingCount = useMemo(
    () => pitches.filter((pitch) => pitch.status === 'new').length,
    [pitches]
  );
  const atLimit = waitingCount >= MAX_WAITING_PITCHES_PER_RELEASE;

  const detectedPlatform = detectPitchPlatform(songUrl);
  const canSend =
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
          releaseId: release.id,
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
      await refreshPitches(true);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Could not send the pitch.';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;

  return (
    <div className="mt-8 space-y-8">
      <section aria-label="Pitches sent" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-content-primary">Sent</h3>
          <span className="font-mono text-[11px] text-content-tertiary">
            {waitingCount}/{MAX_WAITING_PITCHES_PER_RELEASE} waiting
          </span>
        </div>

        {isLoadingPitches ? (
          <CuratorCardListSkeleton rows={2} />
        ) : pitches.length === 0 ? (
          <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
            No pitches yet for this release.
          </p>
        ) : (
          <ul className="space-y-2">
            {pitches.map((pitch) => (
              <SentPitchRow key={pitch.id} pitch={pitch} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Send a pitch" className="space-y-4">
        <h3 className="text-sm font-semibold text-content-primary">Pitch a playlist</h3>

        {atLimit ? (
          <p className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            This release has {MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies
            before sending more.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            aria-label="Filter by platform"
            className={`${inputClass} sm:max-w-[12rem]`}
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
            No playlists match that. Clear the filters to see everything on offer.
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
      </section>
    </div>
  );
}
