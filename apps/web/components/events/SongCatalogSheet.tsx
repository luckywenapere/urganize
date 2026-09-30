'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, Trash2, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { MAX_SONG_TITLE_LENGTH } from '@/lib/song-catalog';
import { formatDuration } from '@/lib/setlist';
import { ConfirmDialog } from './ConfirmDialog';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import type { CatalogSong } from './SongPicker';

type SongCatalogSheetProps = {
  artistName: string;
  songs: CatalogSong[];
  onClose: () => void;
  onChanged: () => void;
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

/**
 * An artist's songs: rename one, or delete one nobody plays.
 *
 * Songs could not be renamed or deleted anywhere before 2026-09-25, so a typo
 * was permanent and a duplicate lived forever. Deleting a song that is in a
 * set is refused by the server with the names of the shows it is in, and that
 * sentence is shown as it comes back, so the manager knows exactly where to go.
 */
export function SongCatalogSheet({ artistName, songs, onClose, onChanged }: SongCatalogSheetProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CatalogSong | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus moves in, Tab stays in, and focus returns to the opener on close.
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape' && !pendingDelete) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pendingDelete]);

  useEffect(() => lockBodyScroll(), []);

  if (typeof document === 'undefined') return null;

  const rename = async (song: CatalogSong) => {
    const title = draft.trim();
    setEditingId(null);
    if (!title || title === song.title) return;
    const headers = await authHeaders();
    if (!headers) return;
    setError('');
    try {
      const response = await fetch(`/api/songs/${song.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Couldn’t rename the song.'));
        return;
      }
      onChanged();
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    }
  };

  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-catalog-title"
        className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-stroke-default bg-bg-surface sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stroke-subtle px-5 py-3">
          <h2 id="song-catalog-title" className="font-display text-base font-semibold text-content-primary">
            {artistName ? `${artistName}’s songs` : 'Songs'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus -m-1 rounded-lg p-1 text-content-tertiary hover:text-content-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mx-5 mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-2.5 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <ul className="overflow-y-auto px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {sorted.map((song) => (
            <li key={song.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-base">
              {editingId === song.id ? (
                <>
                  <input
                    value={draft}
                    autoFocus
                    maxLength={MAX_SONG_TITLE_LENGTH}
                    aria-label="Song title"
                    onChange={(changeEvent) => setDraft(changeEvent.target.value)}
                    onBlur={() => void rename(song)}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter') {
                        keyEvent.preventDefault();
                        void rename(song);
                      } else if (keyEvent.key === 'Escape') {
                        keyEvent.preventDefault();
                        keyEvent.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-brand bg-bg-base px-3 text-sm text-content-primary outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Save title"
                    onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
                    onClick={() => void rename(song)}
                    className="motion-focus grid h-9 w-9 place-items-center rounded-md text-brand"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-content-primary">{song.title}</span>
                    {song.durationSeconds ? (
                      <span className="block text-xs tabular-nums text-content-tertiary">
                        {formatDuration(song.durationSeconds)}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Rename ${song.title}`}
                    onClick={() => {
                      setDraft(song.title);
                      setEditingId(song.id);
                    }}
                    className="motion-focus grid h-9 w-9 place-items-center rounded-md text-content-tertiary hover:text-content-primary"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${song.title}`}
                    onClick={() => setPendingDelete(song)}
                    className="motion-focus grid h-9 w-9 place-items-center rounded-md text-content-tertiary hover:text-status-error"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.title ?? 'this song'}?`}
        body="Its files are deleted with it. A song that’s in a set can’t be deleted until it’s taken out."
        confirmLabel="Delete song"
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          const song = pendingDelete;
          if (!song) return;
          const headers = await authHeaders();
          if (!headers) throw new Error('You’re signed out. Sign in and try again.');
          let response: Response;
          try {
            response = await fetch(`/api/songs/${song.id}`, { method: 'DELETE', headers });
          } catch {
            throw new Error('Couldn’t reach the server. Check your connection.');
          }
          if (!response.ok) throw new Error(await readError(response, 'Couldn’t delete the song.'));
          setPendingDelete(null);
          onChanged();
        }}
      />
    </div>,
    document.body
  );
}
