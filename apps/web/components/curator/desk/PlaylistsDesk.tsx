'use client';

// The playlist owner's playlists on a computer (#1237): one line per playlist,
// with Edit and Remove in a ⋯ menu. The form and the store calls are the same
// ones the phone cards use.

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ListMusic, MoreHorizontal, Plus } from '@/components/icons';
import { PlaylistForm } from '@/components/curator/PlaylistForm';
import { useCuratorStore, type PlaylistInput } from '@/stores/useCuratorStore';
import { PITCH_PLATFORM_LABELS, formatFollowerCount } from '@/lib/pitching';
import { curatorInitials, playlistTag } from '@/lib/curator-desk';
import { openExternalUrl } from '@/lib/external-link';
import type { CuratorPlaylist } from '@/types/pitching';

const COLUMNS = 'grid grid-cols-[44px_minmax(0,1.4fr)_110px_90px_minmax(0,1.2fr)_32px_32px] items-center gap-4';

function RowMenu({
  name,
  onEdit,
  onRemove,
}: {
  name: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
        return;
      }
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const item =
    'motion-focus block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="motion-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-stroke-strong bg-bg-elevated p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={`${item} text-content-primary`}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-status-error`}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PlaylistRow({ playlist }: { playlist: CuratorPlaylist }) {
  const updatePlaylist = useCuratorStore((state) => state.updatePlaylist);
  const removePlaylist = useCuratorStore((state) => state.removePlaylist);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');

  if (isEditing) {
    return (
      <li className="border-t border-stroke-default px-5 py-4 first:border-t-0">
        <PlaylistForm
          idPrefix={`desk-edit-${playlist.id}`}
          initial={playlist}
          submitLabel="Save playlist"
          onCancel={() => setIsEditing(false)}
          onSubmit={async (input: PlaylistInput) => {
            await updatePlaylist(playlist.id, input);
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  const followers = formatFollowerCount(playlist.followerCount);

  return (
    <li className="border-t border-stroke-default first:border-t-0">
      <div className={`${COLUMNS} px-5 py-3`}>
        <div
          aria-hidden="true"
          className="grid h-11 w-11 place-items-center rounded-lg bg-bg-active text-xs font-semibold text-content-secondary"
        >
          {curatorInitials(playlist.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-content-primary">{playlist.name}</p>
          <p className="text-xs font-semibold text-brand">Open for pitches</p>
        </div>
        <span className="text-[13px] text-content-secondary">{PITCH_PLATFORM_LABELS[playlist.platform]}</span>
        <span className="text-sm tabular-nums text-content-primary">{followers || '–'}</span>
        <ul className="flex flex-wrap gap-1.5">
          {playlist.genres.map((genre) => (
            <li key={genre} className="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-content-secondary">
              {playlistTag(genre)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void openExternalUrl(playlist.url)}
          aria-label={`Open ${playlist.name}`}
          className="motion-focus inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stroke-strong text-content-tertiary transition-colors hover:text-content-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <RowMenu
          name={playlist.name}
          onEdit={() => setIsEditing(true)}
          onRemove={() => {
            setError('');
            setIsConfirmingRemove(true);
          }}
        />
      </div>
      {isConfirmingRemove ? (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pl-[80px]">
          <p className="mr-2 text-sm text-content-secondary">Remove {playlist.name}? Artists can no longer pitch it.</p>
          <button
            type="button"
            disabled={isRemoving}
            onClick={() => {
              setError('');
              setIsRemoving(true);
              void removePlaylist(playlist.id).catch((removeError: unknown) => {
                setIsRemoving(false);
                setError(removeError instanceof Error ? removeError.message : 'Could not remove the playlist.');
              });
            }}
            className="motion-focus inline-flex h-8 items-center rounded-full border border-status-error/40 bg-status-error/10 px-3 text-xs font-semibold text-status-error disabled:opacity-50"
          >
            Remove for good
          </button>
          <button
            type="button"
            onClick={() => setIsConfirmingRemove(false)}
            className="motion-focus inline-flex h-8 items-center rounded-full border border-stroke-strong px-3 text-xs font-semibold text-content-secondary"
          >
            Keep it
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-5 pb-3 pl-[80px] text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function PlaylistsDesk({
  playlists,
  isLoading,
  summary,
  skeleton,
  errorBanner,
}: {
  playlists: CuratorPlaylist[];
  isLoading: boolean;
  summary: string;
  skeleton: React.ReactNode;
  errorBanner: React.ReactNode;
}) {
  const createPlaylist = useCuratorStore((state) => state.createPlaylist);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-[38px] text-content-primary">Playlists</h1>
          <p className="mt-1 text-sm text-content-secondary">{summary}</p>
        </div>
        {isAdding ? null : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="motion-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-content-primary px-5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a playlist
          </button>
        )}
      </div>

      {errorBanner}

      {isAdding ? (
        <div className="mb-4 max-w-xl">
          <PlaylistForm
            idPrefix="desk-new"
            submitLabel="Add playlist"
            onCancel={() => setIsAdding(false)}
            onSubmit={async (input) => {
              await createPlaylist(input);
              setIsAdding(false);
            }}
          />
        </div>
      ) : null}

      {isLoading ? (
        skeleton
      ) : playlists.length === 0 ? (
        isAdding ? null : (
          <div className="rounded-2xl border border-stroke-default bg-bg-surface p-10 text-center">
            <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-hover text-content-tertiary">
              <ListMusic className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-content-primary">No playlists yet</p>
            <p className="mt-1 text-sm text-content-secondary">
              Teams can only pitch to playlists you have added here.
            </p>
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-stroke-default bg-bg-surface">
          <div
            aria-hidden="true"
            className={`${COLUMNS} border-b border-stroke-default px-5 py-3 text-xs font-semibold text-content-tertiary`}
          >
            <span />
            <span>Playlist</span>
            <span>Platform</span>
            <span>Followers</span>
            <span>Genres</span>
            <span />
            <span />
          </div>
          <ul aria-label="Your playlists">
            {playlists.map((playlist) => (
              <PlaylistRow key={playlist.id} playlist={playlist} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
