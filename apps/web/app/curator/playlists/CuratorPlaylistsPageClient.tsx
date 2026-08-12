'use client';

// The curator's playlists. This is the inventory artist teams browse, so the
// form asks only for what a team needs to judge a fit: name, platform, genres,
// follower count, link.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ListMusic, Plus, Trash2 } from 'lucide-react';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorPlaylistsSkeleton } from '@/components/loading/CuratorSkeleton';
import { useCuratorStore, type PlaylistInput } from '@/stores/useCuratorStore';
import {
  MAX_GENRE_TAG_LENGTH,
  MAX_PLAYLIST_GENRES,
  MAX_PLAYLIST_NAME_LENGTH,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  formatFollowerCount,
  normalizeGenreTags,
} from '@/lib/pitching';
import type { CuratorPlaylist, PitchPlatform } from '@/types/pitching';
import { openExternalUrl } from '@/lib/external-link';

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const labelClass = 'block text-[11px] uppercase tracking-[0.16em] text-content-tertiary';

type FormState = {
  name: string;
  platform: PitchPlatform;
  url: string;
  genres: string;
  followerCount: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  platform: 'spotify',
  url: '',
  genres: '',
  followerCount: '',
};

const toInput = (form: FormState): PlaylistInput => ({
  name: form.name.trim(),
  platform: form.platform,
  url: form.url.trim(),
  genres: normalizeGenreTags(form.genres.split(',')),
  followerCount: form.followerCount.trim() ? Number(form.followerCount.trim()) : null,
});

function PlaylistForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: CuratorPlaylist;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: PlaylistInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          platform: initial.platform,
          url: initial.url,
          genres: initial.genres.join(', '),
          followerCount:
            typeof initial.followerCount === 'number' ? String(initial.followerCount) : '',
        }
      : EMPTY_FORM
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = form.name.trim().length > 0 && form.url.trim().length > 0 && !isSaving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await onSubmit(toInput(form));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save that.');
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4"
    >
      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="playlist-name">
          Playlist name
        </label>
        <input
          id="playlist-name"
          className={inputClass}
          value={form.name}
          maxLength={MAX_PLAYLIST_NAME_LENGTH}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Lagos Nights"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="playlist-platform">
          Platform
        </label>
        <select
          id="playlist-platform"
          className={inputClass}
          value={form.platform}
          onChange={(event) =>
            setForm({ ...form, platform: event.target.value as PitchPlatform })
          }
        >
          {PITCH_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PITCH_PLATFORM_LABELS[platform]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="playlist-url">
          Link to the playlist
        </label>
        <input
          id="playlist-url"
          type="url"
          inputMode="url"
          className={inputClass}
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
          placeholder="https://open.spotify.com/playlist/…"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="playlist-genres">
          Genres
        </label>
        <input
          id="playlist-genres"
          className={inputClass}
          value={form.genres}
          onChange={(event) => setForm({ ...form, genres: event.target.value })}
          placeholder="afrobeats, amapiano"
        />
        <p className="text-xs text-content-tertiary">
          Separate with commas. Up to {MAX_PLAYLIST_GENRES} tags, {MAX_GENRE_TAG_LENGTH}{' '}
          characters each.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="playlist-followers">
          Followers or saves
        </label>
        <input
          id="playlist-followers"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          className={inputClass}
          value={form.followerCount}
          onChange={(event) => setForm({ ...form, followerCount: event.target.value })}
          placeholder="12400"
        />
        <p className="text-xs text-content-tertiary">Your own number. Leave it blank to skip.</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlaylistCard({ playlist }: { playlist: CuratorPlaylist }) {
  const updatePlaylist = useCuratorStore((state) => state.updatePlaylist);
  const removePlaylist = useCuratorStore((state) => state.removePlaylist);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [error, setError] = useState('');

  const followers = formatFollowerCount(playlist.followerCount);

  if (isEditing) {
    return (
      <PlaylistForm
        initial={playlist}
        submitLabel="Save playlist"
        onCancel={() => setIsEditing(false)}
        onSubmit={async (input) => {
          await updatePlaylist(playlist.id, input);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
            {PITCH_PLATFORM_LABELS[playlist.platform]}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-content-primary">
            {playlist.name}
          </h2>
          {followers ? (
            <p className="font-mono text-xs text-content-secondary">{followers} followers</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void openExternalUrl(playlist.url)}
          aria-label={`Open ${playlist.name}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stroke-default text-content-tertiary transition-colors hover:border-stroke-strong hover:text-content-primary"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {playlist.genres.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
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

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex h-9 items-center rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
        >
          Edit
        </button>
        {isConfirmingRemove ? (
          <>
            <button
              type="button"
              onClick={() => {
                setError('');
                void removePlaylist(playlist.id).catch((removeError: unknown) => {
                  setError(
                    removeError instanceof Error
                      ? removeError.message
                      : 'Could not remove the playlist.'
                  );
                });
              }}
              className="inline-flex h-9 items-center rounded-full border border-status-error/40 bg-status-error/10 px-3 text-xs font-semibold text-status-error"
            >
              Remove for good
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingRemove(false)}
              className="inline-flex h-9 items-center rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary"
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingRemove(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-status-error/40 hover:text-status-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>
    </article>
  );
}

export function CuratorPlaylistsPageClient() {
  const playlists = useCuratorStore((state) => state.playlists);
  const isLoading = useCuratorStore((state) => state.isLoadingPlaylists);
  const hydrated = useCuratorStore((state) => state.hydrated);
  const loadPlaylists = useCuratorStore((state) => state.loadPlaylists);
  const createPlaylist = useCuratorStore((state) => state.createPlaylist);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const summary = useMemo(() => {
    if (!playlists.length) return 'Add your first playlist so artist teams can pitch to it.';
    return playlists.length === 1
      ? 'One playlist open for pitches.'
      : `${playlists.length} playlists open for pitches.`;
  }, [playlists.length]);

  return (
    <CuratorShell>
      {isLoading && !hydrated ? (
        <CuratorPlaylistsSkeleton />
      ) : (
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Your playlists
            </p>
            <h1 className="font-display text-2xl text-content-primary">Playlists</h1>
            <p className="text-sm text-content-secondary">{summary}</p>
          </header>

          {isAdding ? (
            <PlaylistForm
              submitLabel="Add playlist"
              onCancel={() => setIsAdding(false)}
              onSubmit={async (input) => {
                await createPlaylist(input);
                setIsAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add a playlist
            </button>
          )}

          {playlists.length === 0 && !isAdding ? (
            <div className="rounded-xl border border-stroke-default bg-bg-surface p-8 text-center">
              <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-content-tertiary">
                <ListMusic className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-content-primary">No playlists yet</p>
              <p className="mt-1 text-sm text-content-secondary">
                Teams can only pitch to playlists you have added here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          )}
        </div>
      )}
    </CuratorShell>
  );
}
