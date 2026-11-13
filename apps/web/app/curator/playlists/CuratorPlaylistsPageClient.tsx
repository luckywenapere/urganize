'use client';

// The curator's playlists. This is the inventory artist teams browse, so the
// form asks only for what a team needs to judge a fit: name, platform, genres,
// follower count, link.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ListMusic, Plus, Trash2 } from '@/components/icons';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorPlaylistsSkeleton, CuratorPlaylistsTableSkeleton } from '@/components/loading/CuratorSkeleton';
import { CuratorLoadError } from '@/components/curator/CuratorLoadError';
import { useCuratorStore } from '@/stores/useCuratorStore';
import { PITCH_PLATFORM_LABELS, formatFollowerCount } from '@/lib/pitching';
import type { CuratorPlaylist } from '@/types/pitching';
import { PlaylistForm } from '@/components/curator/PlaylistForm';
import { PlaylistsDesk } from '@/components/curator/desk/PlaylistsDesk';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { openExternalUrl } from '@/lib/external-link';

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
  const loadError = useCuratorStore((state) => state.playlistsError);
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

  const isDesktop = useIsDesktopViewport();

  if (isDesktop) {
    return (
      <CuratorShell>
        <PlaylistsDesk
          playlists={playlists}
          isLoading={isLoading && !hydrated}
          summary={summary}
          skeleton={<CuratorPlaylistsTableSkeleton />}
          errorBanner={
            loadError ? (
              <div className="mb-4">
                <CuratorLoadError
                  message={loadError}
                  variant="banner"
                  isRetrying={isLoading}
                  onRetry={() => void loadPlaylists({ force: true })}
                />
              </div>
            ) : null
          }
        />
      </CuratorShell>
    );
  }

  return (
    <CuratorShell>
      {(
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Your playlists
            </p>
            <h1 className="font-display text-2xl text-content-primary">Playlists</h1>
            <p className="text-sm text-content-secondary">{summary}</p>
          </header>

          {/* Banner rather than a replacement, for the same reason the inbox
              uses one: zero playlists is where every curator starts. */}
          {loadError ? (
            <CuratorLoadError
              message={loadError}
              variant="banner"
              isRetrying={isLoading}
              onRetry={() => void loadPlaylists({ force: true })}
            />
          ) : null}

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

          {/* Same split as the inbox: the header and the add control are real
              content and ship in the server HTML; only the list waits, because
              "No playlists yet" is a claim we cannot make before the load
              resolves. */}
          {isLoading && !hydrated ? (
            <CuratorPlaylistsSkeleton />
          ) : playlists.length === 0 && !isAdding ? (
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
