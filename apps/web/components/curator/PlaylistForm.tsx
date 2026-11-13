'use client';

// The add and edit form for a playlist, shared by the phone cards and the
// desktop table (#1237). It asks only for what a team needs to judge a fit:
// name, platform, genres, follower count, link. `idPrefix` keeps label ids
// unique when more than one form is open.

import { useState } from 'react';
import type { PlaylistInput } from '@/stores/useCuratorStore';
import {
  MAX_GENRE_TAG_LENGTH,
  MAX_PLAYLIST_GENRES,
  MAX_PLAYLIST_NAME_LENGTH,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  normalizeGenreTags,
} from '@/lib/pitching';
import type { CuratorPlaylist, PitchPlatform } from '@/types/pitching';

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
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

export function PlaylistForm({
  idPrefix = 'playlist',
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  idPrefix?: string;
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
        <label className={labelClass} htmlFor={`${idPrefix}-name`}>
          Playlist name
        </label>
        <input
          id={`${idPrefix}-name`}
          className={inputClass}
          value={form.name}
          maxLength={MAX_PLAYLIST_NAME_LENGTH}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Lagos Nights"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor={`${idPrefix}-platform`}>
          Platform
        </label>
        <select
          id={`${idPrefix}-platform`}
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
        <label className={labelClass} htmlFor={`${idPrefix}-url`}>
          Link to the playlist
        </label>
        <input
          id={`${idPrefix}-url`}
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
        <label className={labelClass} htmlFor={`${idPrefix}-genres`}>
          Genres
        </label>
        <input
          id={`${idPrefix}-genres`}
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
        <label className={labelClass} htmlFor={`${idPrefix}-followers`}>
          Followers or saves
        </label>
        <input
          id={`${idPrefix}-followers`}
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

