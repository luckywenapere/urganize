'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EyeOff, Loader2, Replace, Trash2, Upload } from '@/components/icons';
import { formatFileSize } from '@/lib/asset-constants';
import {
  describePlays,
  describeReleaseDayChoice,
  describeTrackStatus,
} from '@/lib/music/copy';
import {
  MUSIC_FILE_ACCEPT,
  MUSIC_FORMATS_LABEL,
  MUSIC_MAX_BYTES,
  formatDuration,
  type MusicLiveMode,
} from '@/lib/music/rules';
import type { OwnerTrack } from '@/lib/music/server';
import { readAudioDuration, uploadMusic } from '@/lib/music/upload';
import { supabase } from '@/lib/supabase/client';

const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stroke-control bg-transparent px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';
const FIELD =
  'motion-focus h-11 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-base text-content-primary hover:border-content-secondary';

type MusicData = {
  releaseTitle: string;
  releaseDate: string | null;
  tracks: OwnerTrack[];
};

type Props = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Put a rollout's songs on Urganize music: upload, publish, see the plays, take
 * a song down, swap its file.
 *
 * A song starts as a DRAFT and nobody can hear it. Publishing needs the rights
 * box ticked and a choice of release day or right away; the server refuses
 * without both. This scene never caches: it is edited in place and a stale copy
 * painted over a live edit is the failure the other editing scenes stay out of
 * the cache for.
 */
export function MusicSection({ releaseId, onToast }: Props) {
  const [data, setData] = useState<MusicData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/music`);
      const body = (await response.json().catch(() => ({}))) as Partial<MusicData> & { error?: string };
      if (!response.ok || !Array.isArray(body.tracks)) {
        setLoadError(body.error || 'Could not load the songs.');
        return;
      }
      setData({
        releaseTitle: body.releaseTitle ?? '',
        releaseDate: body.releaseDate ?? null,
        tracks: body.tracks,
      });
    } catch {
      setLoadError('Could not load the songs. Check your connection.');
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceTrack = (track: OwnerTrack) =>
    setData((current) =>
      current
        ? { ...current, tracks: current.tracks.map((item) => (item.id === track.id ? track : item)) }
        : current
    );

  const addFile = async (file: File | undefined, replaceTrackId?: string) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        setUploadError('Sign in again to upload.');
        return;
      }
      const durationSeconds = await readAudioDuration(file);
      const outcome = await uploadMusic({ releaseId, file, token, durationSeconds, replaceTrackId });
      if (!outcome.ok) {
        setUploadError(outcome.error);
        return;
      }
      if (replaceTrackId) {
        replaceTrack(outcome.track);
        onToast('File replaced.', 'success');
      } else {
        setData((current) =>
          current ? { ...current, tracks: [outcome.track, ...current.tracks] } : current
        );
        onToast('Song uploaded. Publish it when you are ready.', 'success');
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (loadError && !data) {
    return (
      <div role="alert" className="rounded-xl border border-stroke-default p-4 text-sm">
        <p className="text-content-primary">{loadError}</p>
        <button type="button" onClick={() => void load()} className={`${QUIET_BUTTON} mt-3`}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <MusicSectionSkeleton />;

  const hasSongs = data.tracks.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">
        Songs you publish here appear on Urganize music, where anyone can listen. Nothing goes out until you publish it.
      </p>

      {data.tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          releaseId={releaseId}
          releaseDate={data.releaseDate}
          onChange={replaceTrack}
          onRemoved={() =>
            setData((current) =>
              current ? { ...current, tracks: current.tracks.filter((item) => item.id !== track.id) } : current
            )
          }
          onReplaceFile={(file) => addFile(file, track.id)}
          onToast={onToast}
        />
      ))}

      <div>
        <input
          ref={fileInput}
          type="file"
          accept={MUSIC_FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void addFile(event.target.files?.[0])}
        />
        {hasSongs ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className={QUIET_BUTTON}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {uploading ? 'Uploading…' : 'Add another song'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="motion-focus flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-stroke-control px-4 py-8 text-center transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
            ) : (
              <Upload className="h-5 w-5 text-brand" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold text-content-primary">
              {uploading ? 'Uploading your song…' : 'Choose a song'}
            </span>
            <span className="text-xs text-content-secondary">
              {MUSIC_FORMATS_LABEL}, up to {formatFileSize(MUSIC_MAX_BYTES)}
            </span>
          </button>
        )}
        {uploadError ? (
          <p role="alert" className="mt-2 text-sm text-status-error">
            {uploadError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TrackCard({
  track,
  releaseId,
  releaseDate,
  onChange,
  onRemoved,
  onReplaceFile,
  onToast,
}: {
  track: OwnerTrack;
  releaseId: string;
  releaseDate: string | null;
  onChange: (track: OwnerTrack) => void;
  onRemoved: () => void;
  onReplaceFile: (file: File | undefined) => Promise<void>;
  onToast: Props['onToast'];
}) {
  const [title, setTitle] = useState(track.title);
  const [explicit, setExplicit] = useState(track.explicit);
  const [rights, setRights] = useState(track.rightsConfirmed);
  const [liveMode, setLiveMode] = useState<MusicLiveMode>(track.liveMode);
  const [busy, setBusy] = useState<null | 'publish' | 'unpublish' | 'remove'>(null);
  const [error, setError] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const patch = async (body: Record<string, unknown>, busyKey: 'publish' | 'unpublish') => {
    setBusy(busyKey);
    setError(null);
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/music/${track.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { track?: OwnerTrack; error?: string };
      if (!response.ok || !result.track) {
        setError(result.error || 'Could not save that. Try again.');
        return null;
      }
      onChange(result.track);
      return result.track;
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const saved = await patch(
      {
        action: 'publish',
        title: title.trim() || track.title,
        explicit,
        rightsConfirmed: rights,
        liveMode,
      },
      'publish'
    );
    if (saved) {
      onToast(saved.status === 'live' ? 'Your song is live.' : 'Scheduled. It goes live on release day.', 'success');
    }
  };

  const takeDown = async () => {
    const saved = await patch({ action: 'unpublish' }, 'unpublish');
    if (saved) onToast('Taken down. Nobody can hear it now.', 'success');
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${track.title}" for good? Its file and its plays are deleted.`)) return;
    setBusy('remove');
    setError(null);
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/music/${track.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error || 'Could not remove that song.');
        return;
      }
      onToast('Song removed.', 'success');
      onRemoved();
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const isDraft = track.status === 'draft';
  const isLiveOrScheduled = track.status === 'live' || track.status === 'scheduled';
  const canPublish = rights && title.trim().length > 0 && busy === null;
  const day = describeReleaseDayChoice(releaseDate);

  return (
    <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-content-primary">{track.title}</h3>
          <p className="mt-0.5 text-xs text-content-secondary">
            {track.fileName}
            {track.durationSeconds ? ` · ${formatDuration(track.durationSeconds)}` : ''} · {formatFileSize(track.fileBytes)}
          </p>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-xs font-medium ${
            track.status === 'live'
              ? 'bg-brand/15 text-brand'
              : 'bg-bg-elevated text-content-secondary'
          }`}
        >
          {describeTrackStatus(track)}
        </span>
      </div>

      {track.previewUrl ? (
        <audio controls preload="none" src={track.previewUrl} className="mt-3 h-10 w-full" aria-label={`Preview ${track.title}`} />
      ) : null}

      {track.status === 'live' || track.status === 'taken_down' || track.plays > 0 ? (
        <p className="mt-3 text-sm font-medium text-content-primary">{describePlays(track.plays)}</p>
      ) : null}

      {isDraft ? (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`title-${track.id}`} className="mb-1 block text-xs font-medium text-content-secondary">
              Song title
            </label>
            <input
              id={`title-${track.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className={FIELD}
            />
          </div>

          <fieldset>
            <legend className="mb-1 text-xs font-medium text-content-secondary">When it goes live</legend>
            <div className="space-y-1.5">
              {(
                [
                  ['release_day', day],
                  ['now', 'Right away'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm text-content-primary">
                  <input
                    type="radio"
                    name={`live-${track.id}`}
                    value={value}
                    checked={liveMode === value}
                    onChange={() => setLiveMode(value)}
                    className="h-4 w-4 accent-[rgb(var(--color-brand))]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-[40px] cursor-pointer items-start gap-2.5 text-sm text-content-primary">
            <input
              type="checkbox"
              checked={explicit}
              onChange={(event) => setExplicit(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-brand))]"
            />
            This song has explicit lyrics
          </label>
          <label className="flex min-h-[40px] cursor-pointer items-start gap-2.5 text-sm text-content-primary">
            <input
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-brand))]"
            />
            I own this song or have the right to publish it
          </label>

          <button type="button" onClick={() => void publish()} disabled={!canPublish} className={`${PRIMARY_BUTTON} w-full`}>
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Publish to Urganize music
          </button>
          {!rights ? (
            <p className="text-center text-xs text-content-secondary">
              Publish stays off until the rights box is ticked.
            </p>
          ) : null}
        </div>
      ) : null}

      {track.status === 'taken_down' ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void patch({ action: 'publish', liveMode: track.liveMode }, 'publish').then((saved) => {
              if (saved) onToast('Back up.', 'success');
            })}
            disabled={busy !== null}
            className={QUIET_BUTTON}
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Put it back up
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={replaceInput}
          type="file"
          accept={MUSIC_FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (replaceInput.current) replaceInput.current.value = '';
            void onReplaceFile(file);
          }}
        />
        <button type="button" onClick={() => replaceInput.current?.click()} disabled={busy !== null} className={QUIET_BUTTON}>
          <Replace className="h-4 w-4" aria-hidden="true" />
          Replace the file
        </button>
        {isLiveOrScheduled ? (
          <button type="button" onClick={() => void takeDown()} disabled={busy !== null} className={QUIET_BUTTON}>
            {busy === 'unpublish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
            Take it down
          </button>
        ) : null}
        {!isLiveOrScheduled ? (
          <button type="button" onClick={() => void remove()} disabled={busy !== null} className={`${QUIET_BUTTON} text-status-error`}>
            {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Remove
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </article>
  );
}

/** The same blocks the loaded scene draws: the intro line, then either a song card or the empty drop box. */
export function MusicSectionSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading songs">
      <div className="h-4 w-4/5 animate-pulse rounded bg-bg-elevated" />
      <div className="h-[120px] animate-pulse rounded-xl bg-bg-elevated" />
    </div>
  );
}
