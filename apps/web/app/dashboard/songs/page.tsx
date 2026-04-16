'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { SongLibrarySkeleton } from '@/components/loading/SongLibrarySkeleton';
import {
  buildSongSearchValue,
  emptySongFormInput,
  normalizeSongFormInput,
  validateSongFormInput,
  type SongFormInput,
} from '@/lib/song-library';

type ReleaseOption = {
  id: string;
  label: string;
};

type SongListItem = {
  id: string;
  songTitle: string;
  primaryArtist: string;
  isrc: string;
  contributorCount: number;
  associatedRelease: string;
  hasLinkedRelease?: boolean;
  updatedAt: string;
  contributorNames: string[];
};

const getAccessToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export default function SongLibraryPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [releaseOptions, setReleaseOptions] = useState<ReleaseOption[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'linked' | 'missing_isrc' | 'contributors'>('all');
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState<SongFormInput>(emptySongFormInput);

  const loadSongs = async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch('/api/songs', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as {
        songs?: SongListItem[];
        releaseOptions?: ReleaseOption[];
        error?: string;
      };

      if (!response.ok || !payload.songs) {
        throw new Error(payload.error || 'Could not load the song library.');
      }

      setSongs(payload.songs);
      setReleaseOptions(payload.releaseOptions || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load the song library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadSongs();
  }, [authLoading, router, user]);

  const filteredSongs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return songs.filter((song) => {
      if (filter === 'linked' && !song.associatedRelease) return false;
      if (filter === 'missing_isrc' && song.isrc) return false;
      if (filter === 'contributors' && song.contributorCount === 0) return false;
      if (!query) return true;
      return buildSongSearchValue(song, song.contributorNames).includes(query);
    });
  }, [filter, search, songs]);

  const handleCreateSong = async () => {
    const nextForm = normalizeSongFormInput(form);
    const validationError = validateSongFormInput(nextForm);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch('/api/songs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ song: nextForm }),
      });

      const payload = (await response.json().catch(() => ({}))) as { songId?: string; error?: string };
      if (!response.ok || !payload.songId) {
        throw new Error(payload.error || 'Could not create song.');
      }

      setShowCreateModal(false);
      setForm(emptySongFormInput);
      router.push(`/dashboard/songs/${payload.songId}`);
    } catch (createSongError: any) {
      setCreateError(createSongError?.message || 'Could not create song.');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading || authLoading || !user) {
    return <SongLibrarySkeleton />;
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-20 sm:px-8 sm:py-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Song Library</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.1rem)] tracking-tight text-content-primary">
              Song metadata library
            </h1>
            <p className="mt-3 text-sm text-content-secondary">
              Store every song in one place and keep contributor metadata ready.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/dashboard"
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Dashboard
            </Link>
            <PaywallGate>
              {({ requireAccess }) => (
                <button
                  type="button"
                  onClick={() => {
                    void requireAccess(() => {
                      setCreateError('');
                      setShowCreateModal(true);
                    });
                  }}
                  className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:w-auto sm:py-2"
                >
                  New song
                </button>
              )}
            </PaywallGate>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <section className="mt-8 rounded-[30px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,320px)]">
            <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Search</p>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by song title, artist, contributor, or ISRC"
                className="mt-3 w-full rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3 text-sm text-content-primary outline-none focus:border-brand"
              />
            </div>
            <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Filter</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ['all', 'All songs'],
                  ['linked', 'Linked'],
                  ['missing_isrc', 'Missing ISRC'],
                  ['contributors', 'Has contributors'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as typeof filter)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      filter === value
                        ? 'bg-brand text-content-inverse'
                        : 'border border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[30px] border border-stroke-default bg-bg-surface/95 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke-default px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Library</p>
              <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Every song, stored in one place</h2>
            </div>
            <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
              {filteredSongs.length} songs
            </span>
          </div>

          {filteredSongs.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-content-secondary">
              No songs match this view. Create one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stroke-default text-sm">
                <thead className="bg-bg-elevated/80 text-left text-content-tertiary">
                  <tr>
                    <th className="px-4 py-3 font-medium">Song Title</th>
                    <th className="px-4 py-3 font-medium">Primary Artist</th>
                    <th className="px-4 py-3 font-medium">ISRC</th>
                    <th className="px-4 py-3 font-medium">Contributors</th>
                    <th className="px-4 py-3 font-medium">Associated Release</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-default bg-bg-surface/90">
                  {filteredSongs.map((song) => (
                    <tr
                      key={song.id}
                      onClick={() => router.push(`/dashboard/songs/${song.id}`)}
                      className="cursor-pointer hover:bg-bg-hover/70"
                    >
                      <td className="px-4 py-3 text-content-primary">{song.songTitle}</td>
                      <td className="px-4 py-3 text-content-secondary">{song.primaryArtist}</td>
                      <td className="px-4 py-3 text-content-secondary">{song.isrc || 'Not added'}</td>
                      <td className="px-4 py-3 text-content-secondary">{song.contributorCount}</td>
                      <td className="px-4 py-3 text-content-secondary">
                        {song.associatedRelease ? (
                          <span className="inline-flex rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-primary">
                            {song.associatedRelease}
                          </span>
                        ) : (
                          'Standalone song'
                        )}
                      </td>
                      <td className="px-4 py-3 text-content-secondary">{new Date(song.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.3)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">New Song</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Create song</h2>
                <p className="mt-2 text-sm text-content-secondary">
                  Start with the core metadata. You can fill in the rest right after.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Close
              </button>
            </div>

            {createError ? (
              <p className="mt-5 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                {createError}
              </p>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Song title</span>
                <input
                  value={form.songTitle}
                  onChange={(event) => setForm((current) => ({ ...current, songTitle: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Primary artist</span>
                <input
                  value={form.primaryArtist}
                  onChange={(event) => setForm((current) => ({ ...current, primaryArtist: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Project or release</span>
                <input
                  value={form.projectOrRelease}
                  onChange={(event) => setForm((current) => ({ ...current, projectOrRelease: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Link to release</span>
                <select
                  value={form.releaseId}
                  onChange={(event) => setForm((current) => ({ ...current, releaseId: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                >
                  <option value="">No linked release</option>
                  {releaseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">ISRC</span>
                <input
                  value={form.isrc}
                  onChange={(event) => setForm((current) => ({ ...current, isrc: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Duration</span>
                <input
                  value={form.duration}
                  onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))}
                  placeholder="e.g. 3:24"
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Genre</span>
                <input
                  value={form.genre}
                  onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Language</span>
                <input
                  value={form.language}
                  onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-full rounded-full border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
              >
                Cancel
              </button>
              <PaywallGate>
                {({ requireAccess }) => (
                  <button
                    type="button"
                    onClick={() => void requireAccess(() => handleCreateSong())}
                    disabled={isCreating}
                    className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60 sm:w-auto sm:py-2"
                  >
                    {isCreating ? 'Creating...' : 'Create Song'}
                  </button>
                )}
              </PaywallGate>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
