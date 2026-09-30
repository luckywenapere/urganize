'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_CUE_NOTE_LENGTH,
  MAX_ITEM_LABEL_LENGTH,
  NON_SONG_ITEM_COPY,
  SONG_VERSION_LABELS,
  SONG_VERSION_LABEL_COPY,
  formatDuration,
  parseDurationInput,
  type SetlistItemType,
} from '@/lib/setlist';
import { MAX_MUSICAL_KEY_LENGTH, MAX_SONG_TITLE_LENGTH } from '@/lib/song-catalog';
import { MAX_SONG_VERSION_BYTES, SONG_VERSION_ACCEPT } from '@/lib/song-versions';
import { ConfirmDialog } from './ConfirmDialog';
import { useSongFileUpload } from './useSongFileUpload';

export type SongFile = {
  id: string;
  label: string;
  fileName: string;
  durationSeconds: number | null;
};

/** One row as GET /api/setlists/[id]/items returns it. */
export type BuilderItem = {
  id: string;
  itemType: SetlistItemType;
  songId: string | null;
  songVersionId: string | null;
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
  /** The file this row sends: chosen, or the song's default. */
  version: SongFile | null;
  versionChosen: boolean;
  files: SongFile[];
  resolvedDurationSeconds: number | null;
  durationSource: 'item' | 'version' | 'song' | null;
};

type SetRowEditorProps = {
  item: BuilderItem;
  setlistId: string;
  isFirst: boolean;
  isLast: boolean;
  onReload: () => Promise<void>;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
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

const sourceCopy: Record<NonNullable<BuilderItem['durationSource']>, string> = {
  item: 'Typed here.',
  version: 'From the file.',
  song: 'From the song.',
};

/**
 * Everything about one row of a set, opened by tapping it.
 *
 * For a song: how long it runs here, which file goes to the DJ (and adding
 * one, which was impossible anywhere in the app before 2026-09-25), a note for
 * the DJ, and the song's own details. For talk, an interlude or a break: what
 * it is, how long, and a note.
 *
 * Every edit saves on its own when the field is left, so there is no Save
 * button to forget and nothing lost to a tap outside.
 */
export function SetRowEditor({
  item,
  setlistId,
  isFirst,
  isLast,
  onReload,
  onMove,
  onRemove,
  onClose,
}: SetRowEditorProps) {
  const isSong = item.itemType === 'song';
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [length, setLength] = useState(item.durationSeconds ? formatDuration(item.durationSeconds) : '');
  const [lengthError, setLengthError] = useState('');
  const [cueNote, setCueNote] = useState(item.cueNote ?? '');
  const [label, setLabel] = useState(item.label ?? '');
  const [showDetails, setShowDetails] = useState(false);
  const [songTitle, setSongTitle] = useState(item.song?.title ?? '');
  const [songBpm, setSongBpm] = useState(item.song?.bpm ? String(item.song.bpm) : '');
  const [songKey, setSongKey] = useState(item.song?.musicalKey ?? '');
  const [songLength, setSongLength] = useState(
    item.song?.durationSeconds ? formatDuration(item.song.durationSeconds) : ''
  );
  const [pendingFileDelete, setPendingFileDelete] = useState<SongFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useSongFileUpload({
    songId: item.songId,
    onUploaded: () => {
      void onReload();
    },
  });

  const patchItem = async (patch: Record<string, unknown>, fallback: string): Promise<boolean> => {
    const headers = await authHeaders();
    if (!headers) {
      setError('You’re signed out. Sign in and try again.');
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/setlists/${setlistId}/items/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError(await readError(response, fallback));
        return false;
      }
      await onReload();
      return true;
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveLength = async () => {
    const parsed = parseDurationInput(length);
    if (!parsed.ok) {
      setLengthError(parsed.error);
      return;
    }
    setLengthError('');
    if (parsed.seconds === item.durationSeconds) {
      setLength(parsed.seconds ? formatDuration(parsed.seconds) : '');
      return;
    }
    if (parsed.seconds === null && !isSong) {
      setLengthError(`This ${NON_SONG_ITEM_COPY[item.itemType as Exclude<SetlistItemType, 'song'>].toLowerCase()} needs a length.`);
      return;
    }
    const ok = await patchItem({ durationSeconds: parsed.seconds }, 'Couldn’t save that length.');
    if (ok) setLength(parsed.seconds ? formatDuration(parsed.seconds) : '');
  };

  const saveCueNote = async () => {
    const next = cueNote.trim() || null;
    if (next === (item.cueNote ?? null)) return;
    await patchItem({ cueNote: next }, 'Couldn’t save the note.');
  };

  const saveLabel = async () => {
    const next = label.trim() || null;
    if (next === (item.label ?? null)) return;
    await patchItem({ label: next }, 'Couldn’t save that.');
  };

  const chooseFile = async (versionId: string | null) => {
    await patchItem({ songVersionId: versionId }, 'Couldn’t change the file.');
  };

  /** A song or file request. Returns the failure to show, or null when it
   *  worked. `inline: false` leaves the message to the caller (a dialog shows
   *  its own), so it is not said twice. */
  const songRequest = async (
    path: string,
    init: RequestInit,
    fallback: string,
    inline = true
  ): Promise<string | null> => {
    const fail = (message: string) => {
      if (inline) setError(message);
      return message;
    };
    const headers = await authHeaders();
    if (!headers) return fail('You’re signed out. Sign in and try again.');
    setSaving(true);
    setError('');
    try {
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) return fail(await readError(response, fallback));
      await onReload();
      return null;
    } catch {
      return fail('Couldn’t reach the server. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const relabelFile = (file: SongFile, next: string) =>
    songRequest(
      `/api/songs/${item.songId}/versions/${file.id}`,
      { method: 'PATCH', body: JSON.stringify({ label: next }) },
      'Couldn’t change that.'
    );

  const saveSongDetails = async () => {
    if (!item.song) return;
    const patch: Record<string, unknown> = {};
    const title = songTitle.trim();
    if (!title) {
      setError('The song needs a name.');
      return;
    }
    if (title !== item.song.title) patch.title = title;
    const bpm = songBpm.trim() ? Number.parseInt(songBpm, 10) : null;
    if (songBpm.trim() && (!Number.isInteger(bpm) || (bpm ?? 0) <= 0 || (bpm ?? 0) >= 400)) {
      setError('That BPM is not a real tempo.');
      return;
    }
    if (bpm !== item.song.bpm) patch.bpm = bpm;
    const key = songKey.trim() || null;
    if (key !== (item.song.musicalKey ?? null)) patch.musicalKey = key;
    const parsedLength = parseDurationInput(songLength);
    if (!parsedLength.ok) {
      setError(parsedLength.error);
      return;
    }
    if (parsedLength.seconds !== item.song.durationSeconds) patch.durationSeconds = parsedLength.seconds;
    if (Object.keys(patch).length === 0) {
      setShowDetails(false);
      return;
    }
    const failure = await songRequest(
      `/api/songs/${item.song.id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      'Couldn’t save the song.'
    );
    if (!failure) setShowDetails(false);
  };

  const fieldClass =
    'w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand disabled:opacity-50';
  const labelClass = 'block text-xs font-semibold text-content-secondary';
  const blurOnEnter = (keyEvent: React.KeyboardEvent<HTMLInputElement>) => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      keyEvent.currentTarget.blur();
    }
  };

  const fallbackLength =
    item.durationSource === 'item'
      ? null
      : item.resolvedDurationSeconds
        ? formatDuration(item.resolvedDurationSeconds)
        : null;
  const hasOtherLength = Boolean(item.version?.durationSeconds || item.song?.durationSeconds);

  return (
    <div className="mt-2 space-y-4 rounded-lg border border-stroke-default bg-bg-base p-3">
      {!isSong ? (
        <label className="block">
          <span className={labelClass}>What it is</span>
          <input
            value={label}
            maxLength={MAX_ITEM_LABEL_LENGTH}
            placeholder={NON_SONG_ITEM_COPY[item.itemType as Exclude<SetlistItemType, 'song'>]}
            onChange={(changeEvent) => setLabel(changeEvent.target.value)}
            onBlur={() => void saveLabel()}
            onKeyDown={blurOnEnter}
            className={`${fieldClass} mt-1`}
          />
        </label>
      ) : null}

      <div>
        <label className="block w-40">
          <span className={labelClass}>Length</span>
          <input
            value={length}
            inputMode="decimal"
            placeholder={fallbackLength ?? '3:30'}
            aria-invalid={Boolean(lengthError)}
            aria-describedby={`length-help-${item.id}`}
            onChange={(changeEvent) => {
              setLength(changeEvent.target.value);
              setLengthError('');
            }}
            onBlur={() => void saveLength()}
            onKeyDown={blurOnEnter}
            className={`${fieldClass} mt-1 tabular-nums`}
          />
        </label>
        <p id={`length-help-${item.id}`} className="mt-1 text-xs text-content-tertiary">
          {lengthError ? (
            <span role="alert" className="text-status-error">{lengthError}</span>
          ) : item.durationSource ? (
            <>
              {sourceCopy[item.durationSource]}
              {item.durationSource === 'item' && hasOtherLength && isSong ? (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLength('');
                      void patchItem({ durationSeconds: null }, 'Couldn’t save that length.');
                    }}
                    className="motion-focus font-semibold text-content-secondary hover:text-content-primary hover:underline"
                  >
                    Use the song’s length
                  </button>
                </>
              ) : null}
            </>
          ) : (
            'Type it like 3:30.'
          )}
        </p>
      </div>

      {isSong && item.song ? (
        <div>
          <p className={labelClass}>File for the DJ</p>
          {item.files.length === 0 ? (
            <p className="mt-1 text-sm text-status-warning">This song has no file yet.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {item.files.map((file) => {
                const sending = item.version?.id === file.id;
                return (
                  <li
                    key={file.id}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      sending ? 'border-brand/40 bg-brand/5' : 'border-stroke-default'
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`file-${item.id}`}
                        checked={sending}
                        disabled={saving}
                        onChange={() => void chooseFile(file.id)}
                        className="h-4 w-4 accent-[rgb(var(--color-brand))]"
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-2 break-words text-sm text-content-primary">{file.fileName}</span>
                        {file.durationSeconds ? (
                          <span className="block text-xs text-content-tertiary">
                            {formatDuration(file.durationSeconds)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <select
                      value={file.label}
                      disabled={saving}
                      aria-label={`Which version ${file.fileName} is`}
                      onChange={(changeEvent) => void relabelFile(file, changeEvent.target.value)}
                      className="h-8 rounded-md border border-stroke-control bg-bg-surface px-2 text-xs text-content-primary outline-none focus:border-brand"
                    >
                      {SONG_VERSION_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {SONG_VERSION_LABEL_COPY[option]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPendingFileDelete(file)}
                      disabled={saving}
                      aria-label={`Delete ${file.fileName}`}
                      className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-tertiary hover:text-status-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {item.files.length > 1 && item.versionChosen ? (
            <button
              type="button"
              onClick={() => void chooseFile(null)}
              disabled={saving}
              className="motion-focus mt-1.5 text-xs font-semibold text-content-secondary hover:text-content-primary hover:underline"
            >
              Send the song’s main file instead
            </button>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept={SONG_VERSION_ACCEPT}
            className="hidden"
            onChange={(changeEvent) => {
              const file = changeEvent.target.files?.[0];
              changeEvent.target.value = '';
              if (file) void upload.start(file);
            }}
          />

          {upload.state.status === 'uploading' ? (
            <div className="mt-2" aria-live="polite">
              <p className="line-clamp-2 break-words text-xs text-content-secondary">Uploading {upload.state.fileName}</p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(upload.state.progress * 100)}
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-stroke-strong"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${Math.max(4, Math.round(upload.state.progress * 100))}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className={`motion-focus inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${
                  item.files.length === 0
                    ? 'bg-brand text-content-inverse hover:bg-brand-hover'
                    : 'border border-stroke-default text-content-secondary hover:text-content-primary'
                }`}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {item.files.length === 0 ? 'Add the file' : 'Add another version'}
              </button>
              <span className="text-xs text-content-tertiary">
                MP3, WAV, AIFF, FLAC or M4A, up to {Math.round(MAX_SONG_VERSION_BYTES / (1024 * 1024))} MB.
              </span>
            </div>
          )}

          {upload.state.status === 'error' ? (
            <p role="alert" className="mt-1.5 text-xs text-status-error">
              {upload.state.message}{' '}
              {upload.state.retryable ? (
                <button type="button" onClick={upload.retry} className="font-semibold underline">
                  Try again
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="block">
        <span className={labelClass}>Note for the DJ</span>
        <input
          value={cueNote}
          maxLength={MAX_CUE_NOTE_LENGTH}
          placeholder={isSong ? 'Fade into the next one' : 'Band intro, then straight in'}
          onChange={(changeEvent) => setCueNote(changeEvent.target.value)}
          onBlur={() => void saveCueNote()}
          onKeyDown={blurOnEnter}
          className={`${fieldClass} mt-1`}
        />
      </label>

      {isSong && item.song ? (
        <div className="rounded-lg border border-stroke-subtle">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="motion-focus flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-content-secondary hover:text-content-primary"
          >
            Song details
            <span className="font-normal text-content-tertiary">{showDetails ? 'Hide' : 'Edit'}</span>
          </button>
          {showDetails ? (
            <div className="space-y-3 border-t border-stroke-subtle p-3">
              <p className="text-xs text-content-tertiary">
                These change the song everywhere it’s used, not only in this set.
              </p>
              <label className="block">
                <span className={labelClass}>Title</span>
                <input
                  value={songTitle}
                  maxLength={MAX_SONG_TITLE_LENGTH}
                  onChange={(changeEvent) => setSongTitle(changeEvent.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className={labelClass}>Length</span>
                  <input
                    value={songLength}
                    inputMode="decimal"
                    placeholder="3:30"
                    onChange={(changeEvent) => setSongLength(changeEvent.target.value)}
                    className={`${fieldClass} mt-1 tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>BPM</span>
                  <input
                    value={songBpm}
                    inputMode="numeric"
                    onChange={(changeEvent) => setSongBpm(changeEvent.target.value.replace(/[^\d]/g, ''))}
                    className={`${fieldClass} mt-1 tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Key</span>
                  <input
                    value={songKey}
                    maxLength={MAX_MUSICAL_KEY_LENGTH}
                    placeholder="F#m"
                    onChange={(changeEvent) => setSongKey(changeEvent.target.value)}
                    className={`${fieldClass} mt-1`}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveSongDetails()}
                  disabled={saving}
                  className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Save song
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke-subtle pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst || saving}
            className="motion-focus inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-content-secondary hover:text-content-primary disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Move up
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast || saving}
            className="motion-focus inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-content-secondary hover:text-content-primary disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            Move down
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="motion-focus inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove from set
          </button>
          <button
            type="button"
            onClick={onClose}
            className="motion-focus h-8 rounded-md px-3 text-xs font-semibold text-content-secondary hover:text-content-primary"
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingFileDelete !== null}
        title={`Delete ${pendingFileDelete?.fileName ?? 'this file'}?`}
        body="It comes off the song, so no set sends it any more. Anyone who already downloaded it keeps their copy."
        confirmLabel="Delete file"
        onClose={() => setPendingFileDelete(null)}
        onConfirm={async () => {
          const file = pendingFileDelete;
          if (!file) return;
          const failure = await songRequest(
            `/api/songs/${item.songId}/versions/${file.id}`,
            { method: 'DELETE' },
            'Couldn’t delete that file.',
            false
          );
          if (failure) throw new Error(failure);
          setPendingFileDelete(null);
        }}
      />
    </div>
  );
}
